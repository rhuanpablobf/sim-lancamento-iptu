import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db import obter_sessao
from app.schemas import RespostaPadrao
from app.clickhouse import sincronizar_historico_para_clickhouse, sincronizar_todas_simulacoes_para_clickhouse
from app.celery_app import celery_app
from app.models import ParametroMacroeconomico

router = APIRouter()

UPLOAD_DIR = "uploads"
DATA_DIR_VPS = os.getenv("DATA_PATH", "/data")

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

@router.get("/detectar-vps", summary="Verificar se existem arquivos na pasta /data da VPS")
async def detectar_vps():
    """Verifica a presença dos arquivos CSV na pasta de volume compartilhado."""
    arquivos = {
        "principal": "raw_lancamento_iptu.csv",
        "auxiliar": "raw_lancamento_iptu_tipo_edf.csv"
    }
    
    status = {}
    for chave, nome in arquivos.items():
        caminho = os.path.join(DATA_DIR_VPS, nome)
        existe = os.path.exists(caminho)
        tamanho = os.path.getsize(caminho) if existe else 0
        status[chave] = {
            "nome": nome,
            "existe": existe,
            "tamanho_mb": round(tamanho / (1024 * 1024), 2) if existe else 0
        }
    
    return RespostaPadrao(dados=status)

@router.get("/debug-vps", summary="Diagnóstico de arquivos no volume")
async def debug_vps():
    """Lista todos os arquivos presentes na pasta de dados para debug."""
    try:
        if not os.path.exists(DATA_DIR_VPS):
            return {"erro": f"Pasta {DATA_DIR_VPS} não existe no container."}
        
        arquivos = os.listdir(DATA_DIR_VPS)
        return {
            "caminho_configurado": DATA_DIR_VPS,
            "existe": True,
            "total_arquivos": len(arquivos),
            "arquivos_encontrados": arquivos,
            "env_data_path": os.getenv("DATA_PATH")
        }
    except Exception as e:
        return {"erro": str(e)}

@router.post("/processar-vps", summary="Processar arquivos que já estão na VPS")
async def processar_vps(
    modo: str = Form(default="substituir"),
    db: Session = Depends(obter_sessao)
) -> RespostaPadrao:
    """Inicia o processamento dos arquivos localizados em /data."""
    path_principal = os.path.join(DATA_DIR_VPS, "raw_lancamento_iptu.csv")
    path_auxiliar = os.path.join(DATA_DIR_VPS, "raw_lancamento_iptu_tipo_edf.csv")
    
    if not os.path.exists(path_principal):
        raise HTTPException(status_code=404, detail="Arquivo principal não encontrado na VPS.")
        
    import_id = f"vps_{str(uuid.uuid4())[:8]}"
    
    # Se o arquivo auxiliar não existir, passamos None
    if not os.path.exists(path_auxiliar):
        path_auxiliar = None

    # Disparar Task Celery
    from app.tasks.importacao_task import importar_csv_task
    task = importar_csv_task.delay(path_principal, path_auxiliar, modo, import_id)
    
    return RespostaPadrao(
        dados={
            "task_id": task.id,
            "import_id": import_id,
            "status": "ENFILEIRADO"
        },
        meta={"mensagem": "Processamento local iniciado com sucesso."}
    )


@router.post("/upload", summary="Enviar CSVs de lançamento (Assíncrono)")
async def upload_csv(
    arquivo_principal: UploadFile = File(...),
    arquivo_auxiliar: UploadFile | None = File(None),
    modo: str = Form(default="substituir"),
    db: Session = Depends(obter_sessao),
) -> RespostaPadrao:
    """
    Recebe os arquivos, salva em disco e enfileira o processamento via Celery.
    arquivo_auxiliar é opcional.
    """
    try:
        import_id = str(uuid.uuid4())
        
        # Salvar arquivo principal
        path_principal = os.path.join(UPLOAD_DIR, f"{import_id}_principal.csv")
        with open(path_principal, "wb") as buffer:
            shutil.copyfileobj(arquivo_principal.file, buffer)
            
        # Salvar arquivo auxiliar (se enviado)
        path_auxiliar = None
        if arquivo_auxiliar and arquivo_auxiliar.filename:
            path_auxiliar = os.path.join(UPLOAD_DIR, f"{import_id}_auxiliar.csv")
            with open(path_auxiliar, "wb") as buffer:
                shutil.copyfileobj(arquivo_auxiliar.file, buffer)
            
        # Disparar Task Celery
        from app.tasks.importacao_task import importar_csv_task
        task = importar_csv_task.delay(path_principal, path_auxiliar, modo, import_id)
        
        return RespostaPadrao(
            dados={
                "task_id": task.id,
                "import_id": import_id,
                "status": "ENFILEIRADO"
            },
            meta={"mensagem": "Arquivos recebidos. Processamento iniciado em segundo plano."}
        )
    except Exception as e:
        import logging
        logging.error(f"Erro no upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivos: {str(e)}")

@router.get("/task/{task_id}", summary="Consultar status de uma tarefa")
async def consultar_status(task_id: str):
    """Retorna o progresso atual de uma tarefa do Celery."""
    try:
        from celery.result import AsyncResult
        from app.celery_app import celery_app
        
        res = AsyncResult(task_id, app=celery_app)
        
        status = res.status
        progresso = 0
        mensagem = ""
        detalhes = {}
        
        if res.info:
            if isinstance(res.info, dict):
                progresso = res.info.get("progresso", 0)
                mensagem = res.info.get("mensagem", "")
                detalhes = res.info.get("detalhes", {})
            elif isinstance(res.info, Exception):
                mensagem = str(res.info)
        
        return RespostaPadrao(dados={
            "id": task_id,
            "status": status,
            "progresso": progresso,
            "mensagem": mensagem,
            "detalhes": detalhes
        })
    except Exception as e:
        return RespostaPadrao(dados={
            "id": task_id,
            "status": "PENDING",
            "progresso": 0,
            "mensagem": f"Erro ao consultar: {str(e)}",
            "detalhes": {}
        })

from app.clickhouse import inicializar_clickhouse, sincronizar_historico_para_clickhouse, sincronizar_todas_simulacoes_para_clickhouse

@router.post("/sync-analitico", summary="Sincroniza base histórica para o ClickHouse")
def sync_analitico(db: Session = Depends(obter_sessao)):
    """Dispara a sincronização manual da base histórica do Postgres para o ClickHouse."""
    try:
        # Garante que as tabelas existam com o schema correto
        inicializar_clickhouse()
        
        # Sincroniza histórico e todas as simulações
        sincronizar_historico_para_clickhouse(db)
        sincronizar_todas_simulacoes_para_clickhouse(db)
        return {"mensagem": "Sincronização analítica completa (histórico + simulações) concluída com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na sincronização: {str(e)}")

@router.delete("/exercicio/{ano}")
def excluir_exercicio(ano: int, db: Session = Depends(obter_sessao)):
    try:
        db.execute(text('DELETE FROM "SIA_LANCIPTU_ASG" WHERE "CODG_EXERCICIO_LAN" = :ano'), {"ano": ano})
        db.execute(text("""
            DELETE FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" t
            WHERE NOT EXISTS (SELECT 1 FROM "SIA_LANCIPTU_ASG" s WHERE s."ISN_SIA_LANCIPTU_ASG" = t."ISN_SIA_LANCIPTU_ASG")
        """))
        db.commit()
        return RespostaPadrao(dados={"exercicio": ano}, meta={"mensagem": "Excluído."})
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/tudo")
def excluir_tudo(confirmar: bool = False, db: Session = Depends(obter_sessao)):
    if not confirmar: raise HTTPException(status_code=400, detail="Confirme.")
    try:
        db.execute(text('TRUNCATE TABLE "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN"'))
        db.execute(text('TRUNCATE TABLE "SIA_LANCIPTU_ASG" RESTART IDENTITY CASCADE'))
        db.commit()
        return RespostaPadrao(dados={"truncado": True}, meta={"mensagem": "Limpo."})
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
def status_importacao(db: Session = Depends(obter_sessao)):
    try:
        resultado = db.execute(text("""
            SELECT "CODG_EXERCICIO_LAN" AS exercicio, COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE ("TIPO_LANCAMENTO_LAN" = 0 OR "TIPO_LANCAMENTO_LAN" IS NULL)) AS normal,
                    COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 1 AND "INFO_POSICAO_FISCAL_LAN" >= 2) AS isento,
                    COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 2) AS imposto_minimo,
                    COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 3 OR ("TIPO_LANCAMENTO_LAN" = 1 AND "INFO_POSICAO_FISCAL_LAN" IS NULL)) AS iptu_social,
                    COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 1 AND "INFO_POSICAO_FISCAL_LAN" = 1) AS imune,
                   COALESCE(SUM(CAST("VALR_VENAL_LAN" AS NUMERIC)), 0) AS valr_venal_total,
                   COALESCE(SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)), 0) AS valr_imposto_total
            FROM "SIA_LANCIPTU_ASG" WHERE "CODG_EXERCICIO_LAN" IS NOT NULL
            GROUP BY 1 ORDER BY 1
        """)).mappings().all()
        linhas = [dict(r) for r in resultado]
        return RespostaPadrao(dados=linhas, meta={"total_registros": sum(r["total"] for r in linhas)})
    except Exception as e:
        return RespostaPadrao(dados=[], meta={"mensagem": str(e)})

@router.get("/dashboard/anos", summary="Anos disponíveis na base real")
def dashboard_anos(db: Session = Depends(obter_sessao)):
    """Retorna todos os exercícios distintos presentes na tabela de lançamentos."""
    try:
        # Busca anos reais da tabela SIA_LANCIPTU_ASG
        resultado = db.execute(text('SELECT DISTINCT CAST("CODG_EXERCICIO_LAN" AS INTEGER) AS ano FROM "SIA_LANCIPTU_ASG" WHERE "CODG_EXERCICIO_LAN" IS NOT NULL ORDER BY 1 DESC')).mappings().all()
        return RespostaPadrao(dados=[r["ano"] for r in resultado])
    except Exception as e:
        return RespostaPadrao(dados=[])

@router.get("/dashboard")
def dashboard_metricas(exercicio: str = Query(None), db: Session = Depends(obter_sessao)):
    try:
        from app.clickhouse import consultar_clickhouse
        
        ex_val = None
        if exercicio and str(exercicio).strip():
            try: ex_val = int(exercicio)
            except: pass

        if not ex_val:
            row_exercicio = db.execute(text('SELECT MAX(CAST("CODG_EXERCICIO_LAN" AS INTEGER)) AS max_ex FROM "SIA_LANCIPTU_ASG"')).mappings().one_or_none()
            if not row_exercicio or not row_exercicio["max_ex"]:
                return RespostaPadrao(dados={}, meta={"mensagem": "Sem dados."})
            ex = row_exercicio["max_ex"]
        else:
            ex = ex_val

        # Tenta buscar do ClickHouse primeiro (Muito mais rápido)
        dados_click = consultar_clickhouse("""
            SELECT 
                count() AS total_imoveis,
                countIf(tipo_lancamento = 0) AS normal,
                countIf(tipo_lancamento = 1) AS isentos,
                countIf(tipo_lancamento = 2) AS imposto_minimo,
                countIf(tipo_lancamento = 3) AS iptu_social,
                countIf(tipo_lancamento = 4) AS imunes,
                countIf(categoria = 'Residencial') AS predial,
                countIf(categoria = 'Territorial') AS territorial,
                sum(valr_venal_total) AS valr_venal_total,
                sum(valr_imposto) AS valr_imposto_total
            FROM lancamento_iptu.historico_lancamentos_analitico
            WHERE exercicio = {ex:UInt16}
        """, {"ex": ex})

        # Se ClickHouse estiver vazio, usa o fallback do Postgres (Original)
        if not dados_click or dados_click[0]['total_imoveis'] == 0:
            # [LOGICA ORIGINAL DO POSTGRES PARA FALLBACK]
            kpis = db.execute(text("""
                SELECT COUNT(*) AS total_imoveis,
                       COUNT(*) FILTER (WHERE ("TIPO_LANCAMENTO_LAN" = 1 AND "INFO_POSICAO_FISCAL_LAN" >= 2)) AS isentos,
                       COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 2) AS imposto_minimo,
                       COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 3 OR ("TIPO_LANCAMENTO_LAN" = 1 AND "INFO_POSICAO_FISCAL_LAN" IS NULL)) AS iptu_social,
                       COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 1 AND "INFO_POSICAO_FISCAL_LAN" = 1) AS imunes,
                       COUNT(*) FILTER (WHERE "TIPO_IMPOSTO_LAN" = 1) AS predial,
                       COUNT(*) FILTER (WHERE "TIPO_IMPOSTO_LAN" = 2) AS territorial,
                       COALESCE(SUM(CAST("VALR_VENAL_LAN" AS NUMERIC)), 0) AS valr_venal_total,
                       COALESCE(SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)), 0) AS valr_imposto_total
                FROM "SIA_LANCIPTU_ASG" WHERE "CODG_EXERCICIO_LAN" = :ex
            """), {"ex": ex}).mappings().one()
            
            categorias = db.execute(text("""
                SELECT CASE WHEN "TIPO_IMPOSTO_LAN" = 2 THEN 'Territorial'
                            WHEN "INFO_USO_LAN" = 1 THEN 'Residencial'
                            ELSE 'Não Residencial' END AS categoria,
                       COUNT(*) AS total,
                       COALESCE(SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)), 0) AS imposto_total
                FROM "SIA_LANCIPTU_ASG" WHERE "CODG_EXERCICIO_LAN" = :ex
                GROUP BY 1 ORDER BY total DESC
            """), {"ex": ex}).mappings().all()
            
            faixas = db.execute(text("""
                SELECT faixa_codigo, faixa_label, faixa_ordem,
                       COUNT(*) AS total,
                       COALESCE(SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)), 0) AS imposto_total
                FROM "SIA_LANCIPTU_ASG" 
                WHERE "CODG_EXERCICIO_LAN" = :ex AND faixa_codigo IS NOT NULL
                GROUP BY 1, 2, 3 ORDER BY 3
            """), {"ex": str(ex)}).mappings().all()

            historico_geral = db.execute(text("""
                SELECT 
                    "CODG_EXERCICIO_LAN" AS exercicio, 
                    COUNT(*) AS total_imoveis,
                    COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 0) AS normal,
                    COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 1) AS isentos,
                    COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 2) AS minimo,
                    COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 3) AS social,
                    COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 4) AS imunes,
                    COALESCE(SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)), 0) AS valor_total
                FROM "SIA_LANCIPTU_ASG" 
                WHERE "CODG_EXERCICIO_LAN" IS NOT NULL
                GROUP BY 1 ORDER BY 1
            """)).mappings().all()
        else:
            # Usa dados do ClickHouse para o restante das queries (MUITO RÁPIDO)
            kpis = dados_click[0]

            categorias = consultar_clickhouse("""
                SELECT categoria, count() AS total, sum(valr_imposto) AS imposto_total
                FROM lancamento_iptu.historico_lancamentos_analitico
                WHERE exercicio = {ex:UInt16}
                GROUP BY categoria ORDER BY total DESC
            """, {"ex": ex})

            faixas = consultar_clickhouse("""
                SELECT faixa_codigo, faixa_label, count() AS total, sum(valr_imposto) AS imposto_total
                FROM lancamento_iptu.historico_lancamentos_analitico
                WHERE exercicio = {ex:UInt16}
                GROUP BY faixa_codigo, faixa_label ORDER BY faixa_codigo
            """, {"ex": ex})
            # Adiciona faixa_ordem fake para compatibilidade (usando o código)
            for f in faixas: f['faixa_ordem'] = f['faixa_codigo']

            historico_geral = consultar_clickhouse("""
                SELECT exercicio, count() AS total_imoveis, 
                       countIf(tipo_lancamento = 0) AS normal,
                       countIf(tipo_lancamento = 1) AS isentos,
                       countIf(tipo_lancamento = 2) AS minimo,
                       countIf(tipo_lancamento = 3) AS social,
                       countIf(tipo_lancamento = 4) AS imunes,
                       sum(valr_imposto) AS valor_total
                FROM lancamento_iptu.historico_lancamentos_analitico
                GROUP BY exercicio ORDER BY exercicio
            """)

        # [LÓGICA DE PROJEÇÃO DE LIMITES E HISTÓRICO - MANTIDA IGUAL]
        from app.models import ConfiguracaoBase
        ex_val = int(ex)
        config_soc = db.query(ConfiguracaoBase).filter(ConfiguracaoBase.tipo == "LIMITE_VENAL_SOCIAL").first()
        v_soc = float(config_soc.valor) if config_soc else 140000.0
        a_ref_soc = config_soc.ano_referencia if config_soc else 2022

        todos_params = {p.exercicio: float(p.ipca) for p in db.query(ParametroMacroeconomico).all()}
        
        iptu_social_serie = []
        for h in historico_geral:
            ano_h = int(h["exercicio"])
            lim_soc_h = v_soc
            if ano_h > a_ref_soc:
                for a in range(a_ref_soc + 1, ano_h + 1): lim_soc_h *= (1 + todos_params.get(a, 0.0) / 100.0)
            elif ano_h < a_ref_soc:
                for a in range(ano_h + 1, a_ref_soc + 1): lim_soc_h /= (1 + todos_params.get(a, 0.0) / 100.0)
            
            iptu_social_serie.append({"exercicio": ano_h, "quantidade": h["social"], "limite_vigente": round(lim_soc_h, 2)})

        return RespostaPadrao(dados={
            "exercicio_atual": ex,
            "kpis": dict(kpis),
            "categorias": [dict(r) for r in categorias],
            "faixas": [dict(r) for r in faixas],
            "iptu_social_historico": iptu_social_serie,
            "arrecadacao_historica": [{"exercicio": h["exercicio"], "valor": float(h["valor_total"]), "imoveis": h["total_imoveis"]} for h in historico_geral],
            "volume_historico": [{"exercicio": h["exercicio"], "total": h["total_imoveis"], "normal": h["normal"], "social": h["social"], "isentos": h["isentos"], "imunes": h["imunes"], "minimo": h["minimo"]} for h in historico_geral],
            "series": {
                "social": [{"exercicio": h["exercicio"], "valor": int(h.get("social", 0) or 0)} for h in historico_geral],
                "isentos": [{"exercicio": h["exercicio"], "valor": int(h.get("isentos", 0) or 0)} for h in historico_geral],
                "imunes": [{"exercicio": h["exercicio"], "valor": int(h.get("imunes", 0) or 0)} for h in historico_geral],
                "minimo": [{"exercicio": h["exercicio"], "valor": int(h.get("minimo", 0) or 0)} for h in historico_geral],
                "normal": [{"exercicio": h["exercicio"], "valor": int(h.get("normal", 0) or 0)} for h in historico_geral]
            }
        })
    except Exception as e:
        return RespostaPadrao(dados={}, meta={"mensagem": str(e)})

@router.get("/dashboard/distribuicao-aliquotas")
def distribuicao_aliquotas(anos: str = Query(None), db: Session = Depends(obter_sessao)):
    """Retorna a contagem de imóveis por faixa de alíquota, agrupado por categoria e exercício."""
    try:
        from app.clickhouse import consultar_clickhouse
        lista_anos = [int(a) for a in anos.split(",")] if anos else []
        
        # Se não informou anos, tenta pegar do CH os últimos 8
        if not lista_anos:
            row_anos = consultar_clickhouse('SELECT DISTINCT exercicio FROM lancamento_iptu.historico_lancamentos_analitico ORDER BY exercicio DESC LIMIT 8', {})
            lista_anos = sorted([r["exercicio"] for r in row_anos])
        
        if not lista_anos:
            return RespostaPadrao(dados={"anos": [], "categorias": []})

        # Query ClickHouse para pegar a distribuição por Categoria, Faixa e Ano
        # Nota: faixa_label e faixa_ordem fake baseados no código se não existirem
        resultados = consultar_clickhouse("""
            SELECT 
                categoria,
                faixa_codigo, 
                faixa_label, 
                exercicio AS ano,
                count() AS total
            FROM lancamento_iptu.historico_lancamentos_analitico
            WHERE exercicio IN {anos:Array(UInt16)}
            GROUP BY categoria, faixa_codigo, faixa_label, exercicio
            ORDER BY categoria, faixa_codigo, exercicio
        """, {"anos": lista_anos})
        
        # Estruturar os dados: Categoria -> (Codigo, Label) -> Ano -> Total
        categorias_dict = {}
        for r in resultados:
            cat = r["categoria"]
            if cat not in categorias_dict:
                categorias_dict[cat] = {}
            
            f_key = (r["faixa_codigo"], r["faixa_label"], r["faixa_codigo"]) # ordem = codigo para CH
            if f_key not in categorias_dict[cat]:
                categorias_dict[cat][f_key] = {ano: 0 for ano in lista_anos}
            
            categorias_dict[cat][f_key][r["ano"]] = r["total"]
            
        # Converter para lista formatada para o frontend
        resp_categorias = []
        # Ordem de exibição sugerida
        cat_ordem = {"Residencial": 1, "Não Residencial": 2, "Territorial": 3}
        
        # Iterar pelas categorias ordenadas
        for cat_nome in sorted(categorias_dict.keys(), key=lambda x: cat_ordem.get(x, 99)):
            faixas_lista = []
            # Ordenar faixas pela ordem numérica definida na classificação
            faixas_agrupadas = categorias_dict[cat_nome]
            sorted_faixas = sorted(faixas_agrupadas.items(), key=lambda x: x[0][2] if x[0][2] is not None else 999)
            
            for (f_cod, f_lab, f_ord), anos_valores in sorted_faixas:
                faixas_lista.append({
                    "codigo": f_cod,
                    "label": f_lab,
                    "ordem": f_ord,
                    "valores": [anos_valores[ano] for ano in lista_anos]
                })
                
            resp_categorias.append({
                "nome": cat_nome,
                "faixas": faixas_lista
            })
            
        return RespostaPadrao(dados={
            "anos": lista_anos,
            "categorias": resp_categorias
        })
    except Exception as e:
        import logging
        logging.error(f"Erro na distribuição de faixas: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dashboard/consolidado-faixas", summary="Dados consolidados para a tabela de faixas (Base)")
def consolidado_faixas_base(db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """
    Retorna uma visão matricial (Categoria > Faixa > Ano) contendo a contagem de imóveis.
    Versão para a base real (sem simulação).
    """
    # 1. Dados Históricos (Reais)
    historico = db.execute(text("""
        SELECT 
            CASE WHEN "TIPO_IMPOSTO_LAN" = '2' THEN 'Territorial'
                 WHEN "INFO_USO_LAN" = '1' THEN 'Residencial'
                 ELSE 'Não Residencial' END AS categoria,
            COALESCE(faixa_codigo, 'NI') as faixa_codigo,
            COALESCE(faixa_label, 'Não Identificada') as faixa_label,
            CAST("CODG_EXERCICIO_LAN" AS INTEGER) AS ano,
            COUNT(*) AS total
        FROM "SIA_LANCIPTU_ASG"
        GROUP BY 1, 2, 3, 4
        ORDER BY 1, 2, 4
    """)).mappings().all()

    # Organizar em estrutura de árvore para o frontend
    resultado = {}

    for r in historico:
        cat = r["categoria"]
        fx_cod = r["faixa_codigo"]
        fx_label = r["faixa_label"]
        ano = r["ano"]
        total = r["total"]

        if cat not in resultado:
            resultado[cat] = {}
        
        if fx_label not in resultado[cat]:
            resultado[cat][fx_label] = {"ordem": fx_cod, "dados": {}}
        
        resultado[cat][fx_label]["dados"][ano] = total

    return RespostaPadrao(dados=resultado)

@router.get("/dashboard/distribuicao-edificacao")
def distribuicao_edificacao_base(exercicio: str = Query(None), db: Session = Depends(obter_sessao)):
    """Retorna matriz de Tipo de Edificação x Tipo de Lançamento para a base real."""
    try:
        ex_val = None
        if exercicio and str(exercicio).strip():
            try:
                ex_val = int(exercicio)
            except:
                pass
        
        if not ex_val:
            row_exercicio = db.execute(text('SELECT MAX(CAST("CODG_EXERCICIO_LAN" AS INTEGER)) AS max_ex FROM "SIA_LANCIPTU_ASG"')).mappings().one_or_none()
            if not row_exercicio or not row_exercicio["max_ex"]:
                return RespostaPadrao(dados={}, meta={"mensagem": "Sem dados."})
            ex_val = row_exercicio["max_ex"]

        query = text("""
            WITH tipos AS (
                SELECT 
                    "ISN_SIA_LANCIPTU_ASG",
                    STRING_AGG(
                        CASE "INFO_TIPO_EDF_LAN"
                            WHEN 1 THEN 'Casa'
                            WHEN 2 THEN 'Apartamento'
                            WHEN 3 THEN 'Barracão'
                            WHEN 4 THEN 'Loja'
                            WHEN 5 THEN 'Sala/Escritório'
                            WHEN 6 THEN 'Galpão Comum'
                            WHEN 7 THEN 'Galpão Industrial'
                            WHEN 8 THEN 'Telheiro'
                            WHEN 9 THEN 'Edificacao em Altura'
                            WHEN 10 THEN 'Especial'
                            WHEN 11 THEN 'Garagem'
                            WHEN 12 THEN 'Condomínio'
                            WHEN 13 THEN 'Escaninho'
                            WHEN 14 THEN 'Sobrado'
                            ELSE 'Não Mapeado'
                        END,
                        ' / '
                        ORDER BY cnxarraycolumn
                    ) AS tipo_edificacao
                FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN"
                GROUP BY 1
            )
            SELECT 
                COALESCE(t.tipo_edificacao, 'Territorial') AS tipo_edificacao,
                "TIPO_LANCAMENTO_LAN" AS tipo_lancamento,
                COUNT(*) AS quantidade
            FROM "SIA_LANCIPTU_ASG" s
            LEFT JOIN tipos t ON s."ISN_SIA_LANCIPTU_ASG" = t."ISN_SIA_LANCIPTU_ASG"
            WHERE s."CODG_EXERCICIO_LAN" = :ex
            GROUP BY 1, 2
            ORDER BY 1, 2
        """)
        
        resultados = db.execute(query, {"ex": str(ex_val)}).mappings().all()
        
        # Estruturar para o frontend: { "Casa": { "Normal": 100, "Minimo": 10, ... } }
        matriz = {}
        for r in resultados:
            edf = r["tipo_edificacao"]
            tipo_lan = int(r["tipo_lancamento"] or 0)
            lan_label = {0: "Normal", 1: "Isento/Imune", 2: "Imposto Mínimo", 3: "IPTU Social"}.get(tipo_lan, "Outros")
            
            if edf not in matriz:
                matriz[edf] = {"Normal": 0, "Isento/Imune": 0, "Imposto Mínimo": 0, "IPTU Social": 0}
            
            matriz[edf][lan_label] = r["quantidade"]
            
        return RespostaPadrao(dados=matriz)
    except Exception as e:
        import logging
        logging.error(f"Erro na distribuição por edificação: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
