"""
Router de simulações — SimLan IPTU.
Cria, lista e consulta simulações executadas via Celery.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db import obter_sessao
from app.models import Simulacao, SimLancamento
from app.clickhouse import obter_cliente
from app.schemas import SimulacaoCriar, SimulacaoLer, RespostaPadrao
from app.tasks.simulacao_task import executar_simulacao

router = APIRouter()


@router.get("/base/anos", summary="Listar anos disponíveis na base real e contagem")
def listar_anos_base(db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Retorna os exercícios disponíveis na base real (SIA_LANCIPTU_ASG) e a contagem de imóveis."""
    from sqlalchemy import text
    resultado = db.execute(text("""
        SELECT 
            "CODG_EXERCICIO_LAN" AS ano, 
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE "INFO_STATUS_LAN" IS NULL OR "INFO_STATUS_LAN" = '1') AS ativos
        FROM "SIA_LANCIPTU_ASG"
        GROUP BY 1
        ORDER BY 1 DESC
    """)).mappings().all()
    return RespostaPadrao(dados=[dict(r) for r in resultado])


@router.get("", summary="Listar simulações")
def listar_simulacoes(
    response: Response, 
    db: Session = Depends(obter_sessao)
) -> RespostaPadrao:
    """Retorna todas as simulações ordenadas pela mais recente."""
    # Desativar cache para garantir auto-refresh funcional no frontend
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    
    itens = db.query(Simulacao).order_by(Simulacao.criado_em.desc()).all()
    
    return RespostaPadrao(
        dados=[SimulacaoLer.model_validate(i) for i in itens],
        meta={"total": len(itens)},
    )


@router.post("", summary="Criar e enfileirar simulação", status_code=201)
def criar_simulacao(payload: SimulacaoCriar, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """
    Cria o registro da simulação (status=PENDENTE) e enfileira a task Celery.
    O frontend deve fazer polling em GET /api/simulacoes/{id} a cada 2s.
    """
    nova = Simulacao(
        nome=payload.nome,
        descricao=payload.descricao,
        exercicio_base=payload.exercicio_base,
        exercicio_destino=payload.exercicio_destino,
        ano_base_faixas=payload.ano_base_faixas,
        cenario=payload.cenario.upper(),
        indexador_social=payload.indexador_social.upper(),
        indexador_minimo=payload.indexador_minimo.upper(),
        aplicar_cap=payload.aplicar_cap,
        tipo_cap=payload.tipo_cap,
        status="PENDENTE",
        progresso_json=[],
    )
    db.add(nova)
    db.commit()
    db.refresh(nova)

    # Enfileirar task Celery
    executar_simulacao.delay(str(nova.id))

    return RespostaPadrao(dados=SimulacaoLer.model_validate(nova))


@router.get("/{simulacao_id}", summary="Detalhe e status da simulação")
def detalhe_simulacao(simulacao_id: UUID, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """
    Retorna o status atual + progresso de execução.
    Use polling a cada 2s enquanto status = PROCESSANDO.
    """
    item = db.get(Simulacao, simulacao_id)
    if not item:
        raise HTTPException(status_code=404, detail="Simulação não encontrada.")
    return RespostaPadrao(dados=SimulacaoLer.model_validate(item))


@router.delete("/{simulacao_id}", summary="Excluir simulação")
def excluir_simulacao(simulacao_id: UUID, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Exclui a simulação e todos os seus lançamentos de forma otimizada."""
    from sqlalchemy import text
    
    item = db.get(Simulacao, simulacao_id)
    if not item:
        raise HTTPException(status_code=404, detail="Simulação não encontrada.")
    
    sid_str = str(simulacao_id)
    
    # 1. Apagar lançamentos (filhos) via SQL puro para performance (milhões de registros)
    db.execute(text("DELETE FROM sim_lancamentos WHERE simulacao_id = :sid"), {"sid": sid_str})
    
    # 2. Apagar parâmetros utilizados na simulação
    db.execute(text("DELETE FROM sim_simulacao_parametros_utilizados WHERE simulacao_id = :sid"), {"sid": sid_str})
    
    # 3. Apagar faixas de alíquota criadas para esta simulação
    db.execute(text("DELETE FROM sim_faixas_aliquota WHERE simulacao_id = :sid"), {"sid": sid_str})
    
    # 4. Apagar registros de exportação vinculados
    db.execute(text("DELETE FROM sim_exportacoes WHERE simulacao_id = :sid"), {"sid": sid_str})
    
    # 5. Apagar o registro pai (Simulacao)
    db.delete(item)
    db.commit()

    # 6. Apagar do ClickHouse (Limpeza analítica)
    try:
        ch_client = obter_cliente()
        if ch_client:
            # Comando assíncrono de deleção no ClickHouse
            ch_client.command(f"ALTER TABLE sim_lancamentos_analitico DELETE WHERE simulacao_id = '{sid_str}'")
    except Exception as e_ch:
        import logging
        logging.error(f"Erro ao excluir dados no ClickHouse para {sid_str}: {e_ch}")

    return RespostaPadrao(dados={"mensagem": "Simulação e registros vinculados (Postgres + ClickHouse) excluídos com sucesso."})


@router.get("/{simulacao_id}/resultado", summary="Resultado por faixa e exercício")
def resultado_simulacao(
    simulacao_id: UUID,
    exercicio: int = Query(...),
    categoria: str = Query(None),
    db: Session = Depends(obter_sessao),
) -> RespostaPadrao:
    """
    Retorna o resumo por faixa de alíquota para um exercício simulado.
    Agrupado para exibição na tabela do dashboard.
    """
    from sqlalchemy import text
    item = db.get(Simulacao, simulacao_id)
    if not item:
        raise HTTPException(status_code=404, detail="Simulação não encontrada.")
    if item.status != "CONCLUIDO":
        raise HTTPException(status_code=400, detail="Simulação ainda não concluída.")

    resultado = db.execute(
        text("""
            SELECT
                faixa_atual,
                tipo_lancamento,
                COUNT(*)                       AS quantidade,
                AVG(valr_aliquota_simulada)    AS aliquota_media,
                SUM(valr_venal_simulado)       AS valr_venal_total,
                SUM(valr_imposto_final)        AS valr_imposto_total
            FROM sim_lancamentos
            WHERE simulacao_id = :sid AND codg_exercicio_lan = :ano
            GROUP BY faixa_atual, tipo_lancamento
            ORDER BY faixa_atual
        """),
        {"sid": str(simulacao_id), "ano": exercicio},
    ).mappings().all()

    return RespostaPadrao(
        dados=[dict(r) for r in resultado],
        meta={"simulacao_id": str(simulacao_id), "exercicio": exercicio},
    )


@router.get("/{simulacao_id}/migracao", summary="Migração de faixas por exercício")
def migracao_simulacao(
    simulacao_id: UUID,
    exercicio: int = Query(...),
    db: Session = Depends(obter_sessao),
) -> RespostaPadrao:
    """
    Retorna contagens de imóveis que subiram, desceram ou permaneceram na mesma faixa.
    """
    from sqlalchemy import text
    item = db.get(Simulacao, simulacao_id)
    if not item:
        raise HTTPException(status_code=404, detail="Simulação não encontrada.")

    resultado = db.execute(
        text("""
            SELECT
                CASE
                    WHEN faixa_atual > faixa_anterior THEN 'subiu'
                    WHEN faixa_atual < faixa_anterior THEN 'desceu'
                    ELSE 'permaneceu'
                END AS movimento,
                COUNT(*) AS quantidade
            FROM sim_lancamentos
            WHERE simulacao_id = :sid AND codg_exercicio_lan = :ano
              AND faixa_anterior IS NOT NULL
            GROUP BY movimento
        """),
        {"sid": str(simulacao_id), "ano": exercicio},
    ).mappings().all()

    return RespostaPadrao(dados=[dict(r) for r in resultado])


@router.get("/{simulacao_id}/imovel", summary="Detalhe de um imóvel específico")
def imovel_simulacao(
    simulacao_id: UUID,
    inscricao: str = Query(..., description="Inscrição cadastral do imóvel"),
    db: Session = Depends(obter_sessao),
) -> RespostaPadrao:
    """Retorna o histórico simulado de um imóvel por exercício."""
    # Correção robusta para campos NUMERIC no banco de dados
    try:
        # Tenta converter para int para remover zeros à esquerda se o banco for numeric
        import re
        inscricao_limpa = re.sub(r'\D', '', inscricao)
        
        # Faz a query usando o campo convertido para garantir compatibilidade
        from sqlalchemy import cast, String
        itens = (
            db.query(SimLancamento)
            .filter(
                SimLancamento.simulacao_id == simulacao_id,
                cast(SimLancamento.codg_inscricao_lan, String) == inscricao_limpa,
            )
            .order_by(SimLancamento.codg_exercicio_lan)
            .all()
        )
    except Exception as e:
        logging.error(f"Erro na busca de inscrição {inscricao}: {e}")
        itens = []
    if not itens:
        raise HTTPException(status_code=404, detail="Imóvel não encontrado nesta simulação.")

    dados = [
        {
            "exercicio": i.codg_exercicio_lan,
            "valr_venal_simulado": float(i.valr_venal_simulado or 0),
            "aliquota": float(i.valr_aliquota_simulada or 0),
            "imposto_final": float(i.valr_imposto_final or 0),
            "tipo_lancamento": i.tipo_lancamento,
            "faixa_atual": i.faixa_atual,
            "migrou_faixa": i.migrou_faixa,
        }
        for i in itens
    ]
    return RespostaPadrao(dados=dados, meta={"inscricao": inscricao})


@router.get("/{simulacao_id}/dashboard", summary="Dashboard detalhado da simulação")
def dashboard_simulacao(
    simulacao_id: UUID,
    exercicio: int = Query(...),
    db: Session = Depends(obter_sessao),
) -> RespostaPadrao:
    """
    Retorna métricas de dashboard (KPIs, faixas, categorias) para uma simulação.
    Prioriza o ClickHouse para performance analítica.
    """
    from sqlalchemy import text
    from app.clickhouse import consultar_clickhouse
    item = db.get(Simulacao, simulacao_id)
    if not item:
        raise HTTPException(status_code=404, detail="Simulação não encontrada.")

    # 1. Tenta buscar KPIs do ClickHouse
    kpis_click = consultar_clickhouse("""
        SELECT 
            count() AS total_imoveis,
            countIf(tipo_lancamento = 0) AS normal,
            countIf(tipo_lancamento = 1) AS isentos,
            countIf(tipo_lancamento = 2) AS imposto_minimo,
            countIf(tipo_lancamento = 3) AS iptu_social,
            countIf(tipo_lancamento = 4) AS imunes,
            sum(valr_venal_simulado) AS valr_venal_total,
            sum(valr_imposto) AS valr_imposto_total,
            sum(valr_imposto_anterior) AS valr_imposto_base,
            sum(valr_venal_anterior) AS valr_venal_base,
            avg(valr_aliquota) AS aliquota_media
        FROM lancamento_iptu.sim_lancamentos_analitico
        WHERE simulacao_id = {sid:String} AND exercicio = {ex:UInt16}
    """, {"sid": str(simulacao_id), "ex": exercicio})

    # Fallback se CH estiver vazio
    if not kpis_click or kpis_click[0]['total_imoveis'] == 0:
        kpis = db.execute(text("""
            SELECT COUNT(*) AS total_imoveis,
                   COUNT(*) FILTER (WHERE tipo_lancamento = 1) AS isentos,
                   COUNT(*) FILTER (WHERE tipo_lancamento = 2) AS imposto_minimo,
                   COUNT(*) FILTER (WHERE tipo_lancamento = 3) AS iptu_social,
                   COALESCE(SUM(valr_venal_simulado), 0)       AS valr_venal_total,
                   COALESCE(SUM(valr_imposto_final), 0)        AS valr_imposto_total,
                   COALESCE(SUM(valr_imposto_anterior), 0)     AS valr_imposto_base,
                   COALESCE(SUM(valr_venal_base), 0)           AS valr_venal_base,
                   COALESCE(AVG(valr_aliquota_simulada), 0)    AS aliquota_media
            FROM sim_lancamentos
            WHERE simulacao_id = :sid AND codg_exercicio_lan = :ano
        """), {"sid": str(simulacao_id), "ano": exercicio}).mappings().one()
        
        categorias = [dict(row) for row in db.execute(text("""
            SELECT CASE WHEN b."TIPO_IMPOSTO_LAN" = '2' THEN 'Territorial'
                        WHEN b."INFO_USO_LAN" = '1' THEN 'Residencial'
                        ELSE 'Não Residencial' END AS categoria,
                   COUNT(*) AS total,
                   COALESCE(SUM(s.valr_venal_simulado), 0) AS venal_total,
                   COALESCE(SUM(s.valr_imposto_final), 0) AS imposto_total
            FROM sim_lancamentos s
            JOIN "SIA_LANCIPTU_ASG" b ON s.isn_sia_lanciptu_asg = b."ISN_SIA_LANCIPTU_ASG"
            WHERE s.simulacao_id = :sid AND s.codg_exercicio_lan = :ano
            GROUP BY 1 ORDER BY total DESC
        """), {"sid": str(simulacao_id), "ano": exercicio}).mappings()]

        faixas = [dict(row) for row in db.execute(text("""
            SELECT s.faixa_atual AS faixa_codigo, COUNT(*) AS total,
                   COALESCE(SUM(s.valr_venal_simulado), 0) AS venal_total,
                   COALESCE(SUM(s.valr_imposto_final), 0) AS imposto_total
            FROM sim_lancamentos s
            WHERE s.simulacao_id = :sid AND s.codg_exercicio_lan = :ano
            GROUP BY 1 ORDER BY 1
        """), {"sid": str(simulacao_id), "ano": exercicio}).mappings()]
    else:
        kpis = kpis_click[0]
        categorias = consultar_clickhouse("""
            SELECT categoria, count() AS total, sum(valr_venal_simulado) AS venal_total, sum(valr_imposto) AS imposto_total
            FROM lancamento_iptu.sim_lancamentos_analitico
            WHERE simulacao_id = {sid:String} AND exercicio = {ex:UInt16}
            GROUP BY categoria ORDER BY total DESC
        """, {"sid": str(simulacao_id), "ex": exercicio})

        faixas = consultar_clickhouse("""
            SELECT faixa_codigo, count() AS total, sum(valr_venal_simulado) AS venal_total, sum(valr_imposto) AS imposto_total
            FROM lancamento_iptu.sim_lancamentos_analitico
            WHERE simulacao_id = {sid:String} AND exercicio = {ex:UInt16}
            GROUP BY faixa_codigo ORDER BY faixa_codigo
        """, {"sid": str(simulacao_id), "ex": exercicio})

    # Parâmetros (Postgres é rápido aqui, pois é um registro por exercício)
    from app.models import SimulacaoParametroUtilizado
    params = db.query(SimulacaoParametroUtilizado).filter(
        SimulacaoParametroUtilizado.simulacao_id == simulacao_id,
        SimulacaoParametroUtilizado.exercicio == exercicio
    ).first()

    return RespostaPadrao(dados={
        "exercicio_atual": exercicio,
        "exercicio_base": item.exercicio_base,
        "kpis": {
            **dict(kpis),
            "valr_minimo": float(params.valr_minimo_iptu) if params else 100.0,
            "limite_social": float(params.limite_venal_social) if params else 140000.0
        },
        "kpis_anterior": {
            "total_imoveis": kpis["total_imoveis"],
            "valr_venal_total": kpis["valr_venal_base"],
            "valr_imposto_total": kpis["valr_imposto_base"]
        },
        "categorias": categorias,
        "faixas": faixas,
        "arrecadacao_historica": consultar_clickhouse("""
            SELECT exercicio, sum(valr_imposto) AS valor, count() AS imoveis
            FROM (
                SELECT exercicio, valr_imposto FROM lancamento_iptu.historico_lancamentos_analitico
                UNION ALL
                SELECT exercicio, valr_imposto FROM lancamento_iptu.sim_lancamentos_analitico WHERE simulacao_id = {sid:String}
            ) GROUP BY exercicio ORDER BY exercicio
        """, {"sid": str(simulacao_id)}),
        "volume_historico": (v_hist := consultar_clickhouse("""
            SELECT 
                exercicio, 
                count() AS total, 
                countIf(tipo_lancamento = 0) AS normal,
                countIf(tipo_lancamento = 1) AS isentos,
                countIf(tipo_lancamento = 2) AS minimo,
                countIf(tipo_lancamento = 3) AS social,
                countIf(tipo_lancamento = 4) AS imunes
            FROM (
                SELECT exercicio, tipo_lancamento FROM lancamento_iptu.historico_lancamentos_analitico
                UNION ALL
                SELECT exercicio, tipo_lancamento FROM lancamento_iptu.sim_lancamentos_analitico WHERE simulacao_id = {sid:String}
            ) GROUP BY exercicio ORDER BY exercicio
        """, {"sid": str(simulacao_id)})),
        "series": {
            "social": [{"exercicio": h["exercicio"], "valor": int(h["social"])} for h in v_hist],
            "isentos": [{"exercicio": h["exercicio"], "valor": int(h["isentos"])} for h in v_hist],
            "imunes": [{"exercicio": h["exercicio"], "valor": int(h["imunes"])} for h in v_hist],
            "minimo": [{"exercicio": h["exercicio"], "valor": int(h["minimo"])} for h in v_hist],
            "normal": [{"exercicio": h["exercicio"], "valor": int(h["normal"])} for h in v_hist]
        },
        "migracao_trava": [dict(row) for row in db.execute(text("""
            SELECT codg_exercicio_lan AS exercicio,
                   COUNT(*) FILTER (WHERE NULLIF(REGEXP_REPLACE(faixa_atual, '[^0-9]', '', 'g'), '')::int > NULLIF(REGEXP_REPLACE(faixa_anterior, '[^0-9]', '', 'g'), '')::int) AS subiu_faixa,
                   COUNT(*) FILTER (WHERE NULLIF(REGEXP_REPLACE(faixa_atual, '[^0-9]', '', 'g'), '')::int < NULLIF(REGEXP_REPLACE(faixa_anterior, '[^0-9]', '', 'g'), '')::int) AS desceu_faixa,
                   COUNT(*) FILTER (WHERE valr_iptu_bruto > valr_imposto_final AND tipo_lancamento = 0) AS na_trava
            FROM sim_lancamentos
            WHERE simulacao_id = :sid
            GROUP BY codg_exercicio_lan
            ORDER BY codg_exercicio_lan
        """), {"sid": str(simulacao_id)}).mappings().all()]
    })


@router.get("/{simulacao_id}/anos", summary="Anos disponíveis na simulação")
def anos_simulacao(simulacao_id: UUID, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Retorna a lista de exercícios (anos) que foram processados nesta simulação."""
    from sqlalchemy import text
    resultado = db.execute(
        text('SELECT DISTINCT codg_exercicio_lan AS ano FROM sim_lancamentos WHERE simulacao_id = :sid ORDER BY 1'),
        {"sid": str(simulacao_id)}
    ).mappings().all()
    return RespostaPadrao(dados=[r["ano"] for r in resultado])


@router.get("/{simulacao_id}/parametros", summary="Parâmetros utilizados na simulação")
def parametros_simulacao(simulacao_id: UUID, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Retorna os thresholds (mínimo e social) calculados para cada ano da simulação."""
    from app.models import SimulacaoParametroUtilizado
    itens = (
        db.query(SimulacaoParametroUtilizado)
        .filter(SimulacaoParametroUtilizado.simulacao_id == simulacao_id)
        .order_by(SimulacaoParametroUtilizado.exercicio)
        .all()
    )
    return RespostaPadrao(dados=[
        {
            "exercicio": i.exercicio,
            "valr_minimo_iptu": float(i.valr_minimo_iptu),
            "limite_venal_social": float(i.limite_venal_social),
            "ipca_ano": float(i.ipca_ano or 0),
            "selic_ano": float(i.selic_ano or 0),
            "tipo_indice_social": i.tipo_indice_social,
            "tipo_indice_minimo": i.tipo_indice_minimo,
            "tipo_indice_faixa": i.tipo_indice_faixa,
            "indice_aplicado": float(i.indice_aplicado or 0), # Compatibilidade
            "tipo_indice": i.tipo_indice # Compatibilidade
        }
        for i in itens
    ])


@router.get("/{simulacao_id}/consolidado-faixas", summary="Dados consolidados para a tabela de faixas")
def consolidado_faixas(simulacao_id: UUID, response: Response, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """
    Retorna uma visão matricial (Categoria > Faixa > Ano) contendo a contagem de imóveis.
    Prioriza o ClickHouse para performance analítica.
    """
    import logging
    from sqlalchemy import text
    try:
        # Tentar ClickHouse primeiro
        ch_client = obter_cliente()
        if ch_client:
            try:
                logging.info(f"Consultando faixas via ClickHouse para {simulacao_id}")
                # Query unificada no ClickHouse (Histórico + Simulado)
                ch_query = f"""
                    SELECT categoria, faixa_codigo, faixa_label, exercicio, count(*) as total
                    FROM (
                        SELECT categoria, faixa_codigo, faixa_label, exercicio 
                        FROM lancamento_iptu.sim_lancamentos_analitico 
                        WHERE simulacao_id = '{simulacao_id}'
                        UNION ALL
                        SELECT categoria, faixa_codigo, faixa_label, exercicio 
                        FROM lancamento_iptu.historico_lancamentos_analitico
                    )
                    GROUP BY 1, 2, 3, 4
                """
                resultado_ch = ch_client.query(ch_query)
                
                if resultado_ch.result_rows:
                    resultado = {}
                    labels_por_codigo = {}
                    # Primeiro passo: mapear os melhores labels por código
                    for row in resultado_ch.result_rows:
                        cat, fx_cod, fx_label, ano, total = row
                        chave_cod = f"{cat}:{fx_cod}"
                        if fx_label and "???" in fx_label:
                            fx_label = fx_label.split("???")[-1].strip()
                        if fx_label and (chave_cod not in labels_por_codigo or len(fx_label) > len(labels_por_codigo[chave_cod])):
                            labels_por_codigo[chave_cod] = fx_label

                    # Segundo passo: agrupar os dados usando os labels consistentes
                    for row in resultado_ch.result_rows:
                        cat, fx_cod, fx_label, ano, total = row
                        label_final = labels_por_codigo.get(f"{cat}:{fx_cod}") or fx_label or f"Faixa {fx_cod}"
                        
                        # Extração numérica robusta de faixa_codigo para ordenação
                        ordem_num = 9999
                        try:
                            if fx_cod is not None:
                                s_cod = str(fx_cod).strip()
                                if s_cod.isdigit():
                                    ordem_num = int(s_cod)
                                else:
                                    # Tenta extrair apenas os dígitos caso venha algo como "Faixa 1" no código
                                    import re
                                    digitos = re.findall(r'\d+', s_cod)
                                    if digitos:
                                        ordem_num = int(digitos[0])
                        except:
                            pass
                        
                        if cat not in resultado: resultado[cat] = {}
                        if label_final not in resultado[cat]:
                            resultado[cat][label_final] = {"ordem": ordem_num, "dados": {}}
                        resultado[cat][label_final]["dados"][ano] = resultado[cat][label_final]["dados"].get(ano, 0) + total
                    
                    # Ordenação final
                    for cat in resultado:
                        resultado[cat] = dict(sorted(resultado[cat].items(), key=lambda x: x[1]["ordem"]))

                    response.headers["X-Data-Source"] = "ClickHouse"
                    return RespostaPadrao(dados=resultado)
                else:
                    logging.warning(f"ClickHouse retornou vazio para {simulacao_id}, recorrendo ao Postgres.")
            except Exception as e_ch:
                logging.error(f"Erro ao consultar ClickHouse: {e_ch}. Recorrendo ao Postgres.")

        # Fallback para PostgreSQL
        item = db.get(Simulacao, simulacao_id)
        if not item:
            raise HTTPException(status_code=404, detail="Simulação não encontrada.")

        historico = db.execute(text("""
            SELECT 
                CASE WHEN "TIPO_IMPOSTO_LAN" = '2' THEN 'Territorial'
                     WHEN "INFO_USO_LAN" = '1' THEN 'Residencial'
                     ELSE 'Não Residencial' END AS categoria,
                faixa_codigo, faixa_label, "CODG_EXERCICIO_LAN" AS ano, COUNT(*) AS total
            FROM "SIA_LANCIPTU_ASG"
            WHERE faixa_codigo IS NOT NULL
            GROUP BY 1, 2, 3, 4
        """)).mappings().all()

        simulado = db.execute(text("""
            SELECT 
                CASE WHEN b."TIPO_IMPOSTO_LAN" = '2' THEN 'Territorial'
                     WHEN b."INFO_USO_LAN" = '1' THEN 'Residencial'
                     ELSE 'Não Residencial' END AS categoria,
                s.faixa_atual AS faixa_codigo,
                COALESCE(f.faixa_label, 'Faixa ' || s.faixa_atual) AS faixa_label,
                s.codg_exercicio_lan AS ano, COUNT(*) AS total
            FROM sim_lancamentos s
            JOIN "SIA_LANCIPTU_ASG" b ON s.isn_sia_lanciptu_asg = b."ISN_SIA_LANCIPTU_ASG"
            LEFT JOIN sim_faixas_aliquota f ON (f.faixa_codigo = s.faixa_atual AND f.exercicio = s.codg_exercicio_lan AND f.simulacao_id = s.simulacao_id)
            WHERE s.simulacao_id = :sid
            GROUP BY 1, 2, 3, 4
        """), {"sid": str(simulacao_id)}).mappings().all()

        resultado = {}
        labels_por_codigo = {}
        # Mapear labels consistentes para o Postgres também
        for r in list(historico) + list(simulado):
            cat = r["categoria"]; fx_cod = r["faixa_codigo"]; fx_label = r["faixa_label"]
            chave_cod = f"{cat}:{fx_cod}"
            if fx_label and "???" in fx_label:
                fx_label = fx_label.split("???")[-1].strip()
            if fx_label and (chave_cod not in labels_por_codigo or len(fx_label) > len(labels_por_codigo.get(chave_cod, ""))):
                labels_por_codigo[chave_cod] = fx_label

        def inserir_no_mapa(rows):
            for r in rows:
                cat = r["categoria"]; fx_cod = r["faixa_codigo"]; fx_label = r["faixa_label"]; ano = r["ano"]; total = r["total"]
                label_final = labels_por_codigo.get(f"{cat}:{fx_cod}") or fx_label or f"Faixa {fx_cod}"
                # Extração numérica robusta de faixa_codigo para ordenação (Postgres)
                ordem_num = 9999
                try:
                    if fx_cod is not None:
                        s_cod = str(fx_cod).strip()
                        if s_cod.isdigit():
                            ordem_num = int(s_cod)
                        else:
                            import re
                            digitos = re.findall(r'\d+', s_cod)
                            if digitos:
                                ordem_num = int(digitos[0])
                except:
                    pass
                
                if cat not in resultado: resultado[cat] = {}
                if label_final not in resultado[cat]:
                    resultado[cat][label_final] = {"ordem": ordem_num, "dados": {}}
                resultado[cat][label_final]["dados"][ano] = resultado[cat][label_final]["dados"].get(ano, 0) + total

        inserir_no_mapa(historico)
        inserir_no_mapa(simulado)

        for cat in resultado:
            resultado[cat] = dict(sorted(resultado[cat].items(), key=lambda x: x[1]["ordem"]))

        response.headers["X-Data-Source"] = "PostgreSQL"
        return RespostaPadrao(dados=resultado)
    except Exception as e:
        logging.error(f"CRÍTICO: Erro em consolidado-faixas ({simulacao_id}): {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar faixas: {str(e)}")

@router.get("/{simulacao_id}/resumo-consolidado", summary="Resumo consolidado por exercício")
def resumo_consolidado_exercicios(simulacao_id: UUID, response: Response, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """
    Retorna o resumo financeiro e de contagem por exercício.
    Prioriza o ClickHouse para performance analítica.
    """
    import logging
    from sqlalchemy import text
    try:
        item = db.get(Simulacao, simulacao_id)
        if not item:
            raise HTTPException(status_code=404, detail="Simulação não encontrada.")

        # Tentar ClickHouse primeiro
        ch_client = obter_cliente()
        if ch_client:
            try:
                logging.info(f"Consultando resumo via ClickHouse para {simulacao_id}")
                ch_query = f"""
                    SELECT exercicio, count(*) as total_imoveis,
                           countIf(tipo_lancamento IN (0, 2)) as total_normal,
                           countIf(tipo_lancamento = 3) as iptu_social,
                           countIf(tipo_lancamento = 1) as total_isento,
                           countIf(tipo_lancamento = 4) as total_imune,
                           sum(valr_imposto) as total_imposto
                    FROM (
                        SELECT exercicio, tipo_lancamento, valr_imposto 
                        FROM sim_lancamentos_analitico 
                        WHERE simulacao_id = '{simulacao_id}'
                        UNION ALL
                        SELECT exercicio, tipo_lancamento, valr_imposto 
                        FROM historico_lancamentos_analitico 
                        WHERE exercicio = {item.exercicio_base}
                    )
                    GROUP BY 1
                    ORDER BY 1
                """
                resultado_ch = ch_client.query(ch_query)
                if resultado_ch.result_rows:
                    resumo = []
                    for row in resultado_ch.result_rows:
                        resumo.append({
                            "ano": row[0], "total_imoveis": row[1], "total_normal": row[2],
                            "iptu_social": row[3], "total_isento": row[4], "total_imune": row[5],
                            "total_imposto": float(row[6])
                        })
                    response.headers["X-Data-Source"] = "ClickHouse"
                    return RespostaPadrao(dados=resumo)
            except Exception as e_ch:
                logging.error(f"Erro ao consultar resumo no ClickHouse: {e_ch}. Recorrendo ao Postgres.")

        # Fallback para PostgreSQL
        base_real = db.execute(text("""
            SELECT 
                "CODG_EXERCICIO_LAN" AS ano, COUNT(*) AS total_imoveis,
                COUNT(*) FILTER (WHERE COALESCE("INFO_POSICAO_FISCAL_LAN", 0) = 0 AND "INFO_STATUS_LAN" != '4') AS total_normal,
                COUNT(*) FILTER (WHERE "INFO_STATUS_LAN" = '4') AS iptu_social,
                COUNT(*) FILTER (WHERE "INFO_POSICAO_FISCAL_LAN" >= 2) AS total_isento,
                COUNT(*) FILTER (WHERE "INFO_POSICAO_FISCAL_LAN" = 1) AS total_imune,
                SUM("VALR_IMPOSTO_LAN") AS total_imposto
            FROM "SIA_LANCIPTU_ASG"
            WHERE "CODG_EXERCICIO_LAN" = :ano_base
            GROUP BY 1
        """), {"ano_base": item.exercicio_base}).mappings().one_or_none()

        simulado = db.execute(text("""
            SELECT 
                codg_exercicio_lan AS ano, COUNT(*) AS total_imoveis,
                COUNT(*) FILTER (WHERE tipo_lancamento IN (0, 2)) AS total_normal,
                COUNT(*) FILTER (WHERE tipo_lancamento = 3) AS iptu_social,
                COUNT(*) FILTER (WHERE tipo_lancamento = 1) AS total_isento,
                COUNT(*) FILTER (WHERE tipo_lancamento = 4) AS total_imune,
                SUM(valr_imposto_final) AS total_imposto
            FROM sim_lancamentos
            WHERE simulacao_id = :sid
            GROUP BY 1
            ORDER BY 1
        """), {"sid": str(simulacao_id)}).mappings().all()

        resumo = []
        if base_real: resumo.append(dict(base_real))
        for r in simulado: resumo.append(dict(r))
        response.headers["X-Data-Source"] = "PostgreSQL"
        return RespostaPadrao(dados=resumo)
    except Exception as e:
        logging.error(f"CRÍTICO: Erro em resumo-consolidado ({simulacao_id}): {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{simulacao_id}/distribuicao-edificacao")
def distribuicao_edificacao_sim(
    simulacao_id: UUID,
    response: Response,
    exercicio: int = Query(...),
    db: Session = Depends(obter_sessao)
):
    """
    Retorna matriz de Tipo de Edificação x Tipo de Lançamento para uma simulação.
    Prioriza ClickHouse para performance analítica.
    """
    import logging
    from sqlalchemy import text
    try:
        # Tentar ClickHouse primeiro
        ch_client = obter_cliente()
        if ch_client:
            try:
                logging.info(f"Consultando distribuição por edificação via ClickHouse para {simulacao_id}")
                ch_query = f"""
                    SELECT tipo_edificacao, tipo_lancamento, count(*) as quantidade
                    FROM sim_lancamentos_analitico
                    WHERE simulacao_id = '{simulacao_id}' AND exercicio = {exercicio}
                    GROUP BY 1, 2
                    ORDER BY 1, 2
                """
                resultado_ch = ch_client.query(ch_query)
                if resultado_ch.result_rows:
                    matriz = {}
                    for row in resultado_ch.result_rows:
                        edf, t_lan, qtd = row
                        lan_label = {0: "Normal", 1: "Isento", 2: "Imposto Mínimo", 3: "IPTU Social", 4: "Imunidade"}.get(t_lan, "Outros")
                        if edf not in matriz:
                            matriz[edf] = {"Normal": 0, "Isento": 0, "Imposto Mínimo": 0, "IPTU Social": 0, "Imunidade": 0}
                        if lan_label in matriz[edf]:
                            matriz[edf][lan_label] = int(qtd)
                    response.headers["X-Data-Source"] = "ClickHouse"
                    return RespostaPadrao(dados=matriz)
            except Exception as e_ch:
                logging.error(f"Erro ao consultar ClickHouse (edificacao): {e_ch}. Recorrendo ao Postgres.")

        # Fallback para PostgreSQL (Query pesada)
        query = text("""
            WITH tipos AS (
                SELECT "ISN_SIA_LANCIPTU_ASG",
                    STRING_AGG(CASE "INFO_TIPO_EDF_LAN"
                        WHEN 1 THEN 'Casa' WHEN 2 THEN 'Apartamento' WHEN 3 THEN 'Barracão'
                        WHEN 4 THEN 'Loja' WHEN 5 THEN 'Sala/Escritório' WHEN 6 THEN 'Galpão Comum'
                        WHEN 7 THEN 'Galpão Industrial' WHEN 8 THEN 'Telheiro' WHEN 9 THEN 'Edificacao em Altura'
                        WHEN 10 THEN 'Especial' WHEN 11 THEN 'Garagem' WHEN 12 THEN 'Condomínio'
                        WHEN 13 THEN 'Escaninho' WHEN 14 THEN 'Sobrado' ELSE 'Não Mapeado'
                    END, ' / ' ORDER BY cnxarraycolumn) AS tipo_edificacao
                FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" GROUP BY 1
            )
            SELECT COALESCE(t.tipo_edificacao, 'Territorial') AS tipo_edificacao,
                   s.tipo_lancamento, COUNT(*) AS quantidade
            FROM sim_lancamentos s
            JOIN "SIA_LANCIPTU_ASG" l ON s.isn_sia_lanciptu_asg = l."ISN_SIA_LANCIPTU_ASG"
            LEFT JOIN tipos t ON s.isn_sia_lanciptu_asg = t."ISN_SIA_LANCIPTU_ASG"
            WHERE s.simulacao_id = :sid AND s.codg_exercicio_lan = :ano
            GROUP BY 1, 2 ORDER BY 1, 2
        """)
        resultados = db.execute(query, {"sid": str(simulacao_id), "ano": exercicio}).mappings().all()
        matriz = {}
        for r in resultados:
            edf = r["tipo_edificacao"]; t_lan = int(r["tipo_lancamento"] or 0)
            lan_label = {0: "Normal", 1: "Isento", 2: "Imposto Mínimo", 3: "IPTU Social", 4: "Imunidade"}.get(t_lan, "Outros")
            if edf not in matriz:
                matriz[edf] = {"Normal": 0, "Isento": 0, "Imposto Mínimo": 0, "IPTU Social": 0, "Imunidade": 0}
            if lan_label in matriz[edf]: matriz[edf][lan_label] = int(r["quantidade"])
        response.headers["X-Data-Source"] = "PostgreSQL"
        return RespostaPadrao(dados=matriz)
    except Exception as e:
        logging.error(f"Erro na distribuição por edificação (sim): {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
