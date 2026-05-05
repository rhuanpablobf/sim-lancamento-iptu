from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db import obter_sessao
from app.schemas import RespostaPadrao
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/historico", summary="Disparar classificação histórica")
async def disparar_classificacao():
    """
    Dispara a tarefa de classificação de faixas para todos os registros 2022+.
    """
    try:
        from app.tasks.classificacao_task import classificar_faixas_task
        task = classificar_faixas_task.delay()
        return RespostaPadrao(
            dados={"task_id": task.id, "status": "ENFILEIRADO"},
            meta={"mensagem": "Processo de classificação iniciado em background via Celery."}
        )
    except Exception as e:
        logger.error(f"Erro ao disparar classificação: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/historico/resumo", summary="Resumo de classificação")
def resumo_classificacao(db: Session = Depends(obter_sessao)):
    """Retorna contagem de imóveis por faixa e exercício."""
    try:
        resultado = db.execute(text("""
            SELECT 
                "CODG_EXERCICIO_LAN" AS exercicio,
                faixa_codigo,
                faixa_label,
                faixa_ordem,
                COUNT(*) AS qtd_imoveis,
                SUM(CAST("VALR_VENAL_LAN" AS NUMERIC)) AS valr_venal_total,
                SUM(CAST("VALR_IMPOSTO_LAN" AS NUMERIC)) AS imposto_total
            FROM "SIA_LANCIPTU_ASG"
            WHERE "CODG_EXERCICIO_LAN" >= 2022
              AND ("INFO_STATUS_LAN" IS NULL OR "INFO_STATUS_LAN" = '1')
              AND faixa_codigo IS NOT NULL
            GROUP BY 1, 2, 3, 4
            ORDER BY 1 DESC, 4 ASC
        """)).mappings().all()
        return RespostaPadrao(dados=[dict(r) for r in resultado])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/historico/migracao", summary="Migração entre anos")
def migracao_entre_anos(ano_a: int, ano_b: int, db: Session = Depends(obter_sessao)):
    """
    Analisa como os imóveis mudaram de faixa entre dois anos.
    """
    try:
        query = text("""
            SELECT 
                a.faixa_codigo AS faixa_ano_a,
                a.faixa_label AS label_ano_a,
                b.faixa_codigo AS faixa_ano_b,
                b.faixa_label AS label_ano_b,
                CASE 
                    WHEN b.faixa_ordem > a.faixa_ordem THEN 'SUBIU'
                    WHEN b.faixa_ordem < a.faixa_ordem THEN 'DESCEU'
                    ELSE 'PERMANECEU'
                END AS sentido,
                COUNT(*) AS qtd_imoveis
            FROM "SIA_LANCIPTU_ASG" a
            JOIN "SIA_LANCIPTU_ASG" b ON a."CODG_INSCRICAO_LAN" = b."CODG_INSCRICAO_LAN" 
                AND a."NUMR_SEQUENCIA_LAN" = b."NUMR_SEQUENCIA_LAN"
            WHERE a."CODG_EXERCICIO_LAN" = :ano_a
              AND b."CODG_EXERCICIO_LAN" = :ano_b
              AND a.faixa_codigo IS NOT NULL
              AND b.faixa_codigo IS NOT NULL
            GROUP BY 1, 2, 3, 4, 5
            ORDER BY qtd_imoveis DESC
        """)
        resultado = db.execute(query, {"ano_a": ano_a, "ano_b": ano_b}).mappings().all()
        return RespostaPadrao(dados=[dict(r) for r in resultado])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
