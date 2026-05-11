
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)


def classificar_faixas_base_real(db: Session, anos: list = None):
    """
    Classifica cada imóvel da base real (SIA_LANCIPTU_ASG) em sua faixa de alíquota.

    Fonte de verdade: sim_faixas_referencia
    ─────────────────────────────────────────────────────────────────────
    Contém as alíquotas oficiais do Código Tributário Municipal e é usada
    para classificar TODOS os dados históricos reais (2022-2026+).

    sim_faixas_aliquota é usada apenas como base para projeção de anos
    futuros (2027+) e NÃO entra na classificação do histórico real.

    Lógica:
    1. Categoria do imóvel via TIPO_IMPOSTO_LAN + INFO_USO_LAN:
       - TIPO_IMPOSTO_LAN = 2                       → TERRITORIAL
       - TIPO_IMPOSTO_LAN = 1 + INFO_USO_LAN = 1    → RESIDENCIAL
       - TIPO_IMPOSTO_LAN = 1 + INFO_USO_LAN > 1    → NAO_RESIDENCIAL

    2. Cruzar VALR_ALIQUOTA_LAN com o campo aliquota de sim_faixas_referencia
       para encontrar faixa_codigo, faixa_label e faixa_ordem.

    Observação: alíquota 1% (0.01000) existe em TERRITORIAL e NAO_RESIDENCIAL,
    mas é resolvida corretamente pelo TIPO_IMPOSTO_LAN antes do cruzamento.
    """
    try:
        if not anos:
            # Busca todos os anos presentes na base real
            resultado_anos = db.execute(
                text('SELECT DISTINCT "CODG_EXERCICIO_LAN" FROM "SIA_LANCIPTU_ASG"')
            ).scalars().all()
            anos = sorted([int(a) for a in resultado_anos if a is not None])

        if not anos:
            logger.warning("Nenhum exercício encontrado para classificação de faixas.")
            return

        for ano in anos:
            logger.info(f"Classificando faixas para o exercício {ano}...")

            # Resetar classificação antes de reprocessar
            db.execute(text("""
                UPDATE "SIA_LANCIPTU_ASG"
                SET faixa_codigo = NULL, faixa_label = NULL, faixa_ordem = NULL
                WHERE "CODG_EXERCICIO_LAN" = :ano
            """), {"ano": ano})
            db.commit()

            # ─────────────────────────────────────────────────────────────────
            # Classificar via JOIN: VALR_ALIQUOTA_LAN = aliquota
            # Fonte: sim_faixas_referencia (alíquotas oficiais do CTM)
            # Categoria determinada por TIPO_IMPOSTO_LAN + INFO_USO_LAN
            # ─────────────────────────────────────────────────────────────────
            res = db.execute(text("""
                UPDATE "SIA_LANCIPTU_ASG" s
                SET faixa_codigo = fr.faixa_codigo,
                    faixa_label  = fr.faixa_label,
                    faixa_ordem  = fr.faixa_ordem
                FROM sim_faixas_referencia fr
                WHERE s."CODG_EXERCICIO_LAN" = :ano
                  AND s."VALR_ALIQUOTA_LAN" = fr.aliquota
                  AND (
                      -- Territorial: TIPO_IMPOSTO_LAN = 2
                      (s."TIPO_IMPOSTO_LAN" = 2 AND fr.categoria = 'TERRITORIAL')
                      OR
                      -- Residencial: predial (tipo=1) com uso residencial (uso=1)
                      (s."TIPO_IMPOSTO_LAN" = 1 AND s."INFO_USO_LAN" = 1 AND fr.categoria = 'RESIDENCIAL')
                      OR
                      -- Não Residencial: predial (tipo=1) com uso não residencial (uso>1)
                      (s."TIPO_IMPOSTO_LAN" = 1 AND s."INFO_USO_LAN" != 1 AND fr.categoria = 'NAO_RESIDENCIAL')
                  )
            """), {"ano": ano})
            db.commit()

            classificados = res.rowcount

            # Diagnóstico: imóveis sem classificação
            nao_classificados = db.execute(text("""
                SELECT COUNT(*) FROM "SIA_LANCIPTU_ASG"
                WHERE "CODG_EXERCICIO_LAN" = :ano AND faixa_codigo IS NULL
            """), {"ano": ano}).scalar()

            print(f"   ✅ Ano {ano}: {classificados} classificados | ⚠️ {nao_classificados} sem faixa.")

            if nao_classificados > 0:
                # Mostra as alíquotas sem correspondência em sim_faixas_referencia
                sem_match = db.execute(text("""
                    SELECT "VALR_ALIQUOTA_LAN", "TIPO_IMPOSTO_LAN", "INFO_USO_LAN", COUNT(*) as total
                    FROM "SIA_LANCIPTU_ASG"
                    WHERE "CODG_EXERCICIO_LAN" = :ano AND faixa_codigo IS NULL
                    GROUP BY "VALR_ALIQUOTA_LAN", "TIPO_IMPOSTO_LAN", "INFO_USO_LAN"
                    ORDER BY total DESC
                    LIMIT 10
                """), {"ano": ano}).fetchall()
                for row in sem_match:
                    logger.warning(
                        f"   ⚠️  Sem faixa em sim_faixas_referencia: "
                        f"aliquota={row[0]} | tipo={row[1]} | uso={row[2]} | {row[3]} imóveis"
                    )

        print("🚀 Classificação de faixas concluída com sucesso.")
        return True

    except Exception as e:
        logger.error(f"Erro na classificação de faixas: {e}")
        db.rollback()
        return False
