import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db import obter_sessao
from app.schemas import RespostaPadrao
from app.celery_app import celery_app
from app.models import ParametroMacroeconomico

router = APIRouter()

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

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
def consultar_task(task_id: str):
    """Retorna o status e progresso de uma tarefa do Celery."""
    try:
        res = celery_app.AsyncResult(task_id)
        
        progresso = 0
        mensagem = ""
        
        if res.state == 'PROGRESS':
            info = res.info if isinstance(res.info, dict) else {}
            progresso = info.get('progresso', 0)
            mensagem = info.get('mensagem', '')
        elif res.state == 'FAILURE':
            mensagem = str(res.result)
        
        return {
            "status": res.state,
            "progresso": progresso,
            "mensagem": mensagem,
            "resultado": res.result if res.ready() else None
        }
    except Exception as e:
        import logging
        logging.error(f"Erro ao consultar task {task_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Manter os outros endpoints (excluir, status, dashboard) ---
# (Eu vou manter os outros endpoints que já existiam mas vou simplificar o arquivo para focar no novo fluxo)
# Na verdade, vou fazer um merge cuidadoso.

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
                   COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 0) AS normal,
                   COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 1) AS isento,
                   COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 2) AS imposto_minimo,
                   COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = 3) AS iptu_social,
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
        ex_val = None
        if exercicio and str(exercicio).strip():
            try:
                ex_val = int(exercicio)
            except:
                pass

        if ex_val:
            ex = ex_val
        else:
            row_exercicio = db.execute(text('SELECT MAX(CAST("CODG_EXERCICIO_LAN" AS INTEGER)) AS max_ex FROM "SIA_LANCIPTU_ASG"')).mappings().one_or_none()
            if not row_exercicio or not row_exercicio["max_ex"]:
                return RespostaPadrao(dados={}, meta={"mensagem": "Sem dados."})
            ex = row_exercicio["max_ex"]
        kpis = db.execute(text("""
            SELECT COUNT(*) AS total_imoveis,
                   COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = '1') AS isentos,
                   COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = '2') AS imposto_minimo,
                   COUNT(*) FILTER (WHERE "TIPO_LANCAMENTO_LAN" = '3') AS iptu_social,
                   COUNT(*) FILTER (WHERE "TIPO_IMPOSTO_LAN" = '1') AS predial,
                   COUNT(*) FILTER (WHERE "TIPO_IMPOSTO_LAN" = '2') AS territorial,
                   COALESCE(SUM(CAST("VALR_VENAL_LAN" AS NUMERIC)), 0) AS valr_venal_total,
                   COALESCE(SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)), 0) AS valr_imposto_total,
                   COALESCE(AVG(CAST("VALR_ALIQUOTA_LAN" AS NUMERIC)), 0) AS aliquota_media
            FROM "SIA_LANCIPTU_ASG" WHERE "CODG_EXERCICIO_LAN" = :ex
        """), {"ex": str(ex)}).mappings().one()
        categorias = db.execute(text("""
            SELECT CASE WHEN "TIPO_IMPOSTO_LAN" = '2' THEN 'Territorial'
                        WHEN "INFO_USO_LAN" = '1' THEN 'Residencial'
                        ELSE 'Não Residencial' END AS categoria,
                   COUNT(*) AS total,
                   COALESCE(SUM(CAST("VALR_VENAL_LAN" AS NUMERIC)), 0) AS venal_total,
                   COALESCE(SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)), 0) AS imposto_total
            FROM "SIA_LANCIPTU_ASG" WHERE "CODG_EXERCICIO_LAN" = :ex
            GROUP BY 1 ORDER BY total DESC
        """), {"ex": str(ex)}).mappings().all()
        kpis_ant = db.execute(text("""
            SELECT COUNT(*) AS total_imoveis,
                   COALESCE(SUM(CAST("VALR_VENAL_LAN" AS NUMERIC)), 0) AS valr_venal_total,
                   COALESCE(SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)), 0) AS valr_imposto_total
            FROM "SIA_LANCIPTU_ASG" WHERE "CODG_EXERCICIO_LAN" = :ex
        """), {"ex": str(ex - 1)}).mappings().one_or_none()
        faixas = db.execute(text("""
            SELECT faixa_codigo, faixa_label, faixa_ordem,
                   COUNT(*) AS total,
                   COALESCE(SUM(CAST("VALR_VENAL_LAN" AS NUMERIC)), 0) AS venal_total,
                   COALESCE(SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)), 0) AS imposto_total
            FROM "SIA_LANCIPTU_ASG" 
            WHERE "CODG_EXERCICIO_LAN" = :ex AND faixa_codigo IS NOT NULL
            GROUP BY 1, 2, 3 ORDER BY 3
        """), {"ex": str(ex)}).mappings().all()

        # Buscar configurações base e parâmetros para projeção automática
        from app.models import ConfiguracaoBase
        
        ex_val = int(ex)
        # Valores de fallback caso não existam no banco
        VAL_MIN_BASE = 100.0
        LIM_SOC_BASE = 140000.0
        ANO_REF_DEFAULT = 2022

        config_min = db.query(ConfiguracaoBase).filter(ConfiguracaoBase.tipo == "VALOR_MINIMO_IPTU").first()
        config_soc = db.query(ConfiguracaoBase).filter(ConfiguracaoBase.tipo == "LIMITE_VENAL_SOCIAL").first()
        
        v_min = float(config_min.valor) if config_min else VAL_MIN_BASE
        v_soc = float(config_soc.valor) if config_soc else LIM_SOC_BASE
        a_ref_min = config_min.ano_referencia if config_min else ANO_REF_DEFAULT
        a_ref_soc = config_soc.ano_referencia if config_soc else ANO_REF_DEFAULT

        # Buscar todos os índices do período necessário para projeção
        params_periodo = {
            p.exercicio: float(p.ipca) 
            for p in db.query(ParametroMacroeconomico).filter(
                ParametroMacroeconomico.exercicio > min(a_ref_min, a_ref_soc),
                ParametroMacroeconomico.exercicio <= ex_val
            ).all()
        }

        # Projetar Mínimo (IPCA acumulado)
        for a in range(a_ref_min + 1, ex_val + 1):
            idx = params_periodo.get(a, 0.0)
            v_min *= (1 + idx / 100.0)
        
        # Projetar Social (IPCA acumulado)
        for a in range(a_ref_soc + 1, ex_val + 1):
            idx = params_periodo.get(a, 0.0)
            v_soc *= (1 + idx / 100.0)

        return RespostaPadrao(dados={
            "exercicio_atual": ex, "exercicio_anterior": ex - 1,
            "kpis": {
                **dict(kpis),
                "valr_minimo": round(v_min, 2),
                "limite_social": round(v_soc, 2)
            }, 
            "kpis_anterior": dict(kpis_ant) if kpis_ant else None,
            "categorias": [dict(r) for r in categorias],
            "faixas": [dict(r) for r in faixas]
        })
    except Exception as e:
        return RespostaPadrao(dados={}, meta={"mensagem": str(e)})

@router.get("/dashboard/distribuicao-aliquotas")
def distribuicao_aliquotas(anos: str = Query(None), db: Session = Depends(obter_sessao)):
    """Retorna a contagem de imóveis por faixa de alíquota, agrupado por categoria e exercício."""
    try:
        lista_anos = [int(a) for a in anos.split(",")] if anos else []
        
        # Se não informou anos, pega os últimos 8
        if not lista_anos:
            row_anos = db.execute(text('SELECT DISTINCT CAST("CODG_EXERCICIO_LAN" AS INTEGER) AS ano FROM "SIA_LANCIPTU_ASG" ORDER BY 1 DESC LIMIT 8')).mappings().all()
            lista_anos = sorted([r["ano"] for r in row_anos])
        
        if not lista_anos:
            return RespostaPadrao(dados={"anos": [], "categorias": []})

        # Query para pegar a distribuição por Categoria, Faixa e Ano
        query = text("""
            SELECT 
                CASE WHEN "TIPO_IMPOSTO_LAN" = '2' THEN 'Territorial'
                     WHEN "INFO_USO_LAN" = '1' THEN 'Residencial'
                     ELSE 'Não Residencial' END AS categoria,
                faixa_codigo, 
                faixa_label, 
                faixa_ordem,
                CAST("CODG_EXERCICIO_LAN" AS INTEGER) AS ano,
                COUNT(*) AS total
            FROM "SIA_LANCIPTU_ASG" 
            WHERE "CODG_EXERCICIO_LAN" IN :anos AND faixa_codigo IS NOT NULL
            GROUP BY 1, 2, 3, 4, 5
            ORDER BY 1, 4, 5
        """)
        
        anos_str = [str(a) for a in lista_anos]
        resultados = db.execute(query, {"anos": tuple(anos_str)}).mappings().all()
        
        # Estruturar os dados: Categoria -> (Codigo, Label, Ordem) -> Ano -> Total
        categorias_dict = {}
        for r in resultados:
            cat = r["categoria"]
            if cat not in categorias_dict:
                categorias_dict[cat] = {}
            
            f_key = (r["faixa_codigo"], r["faixa_label"], r["faixa_ordem"])
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
                            WHEN 1 THEN 'Casa/Sobrado'
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
