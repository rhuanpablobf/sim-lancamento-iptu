
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)


def classificar_faixas_base_real(db: Session, anos: list = None):
    """
    Classifica cada imóvel da base real (SIA_LANCIPTU_ASG) em sua respectiva faixa de alíquota.

    Lógica de classificação por alíquota aplicada (VALR_ALIQUOTA_LAN):
    ─────────────────────────────────────────────────────────────────────
    1. Determina a categoria do imóvel:
       - TIPO_IMPOSTO_LAN = 2                          → TERRITORIAL
       - TIPO_IMPOSTO_LAN = 1 e INFO_USO_LAN = 1       → RESIDENCIAL
       - TIPO_IMPOSTO_LAN = 1 e INFO_USO_LAN > 1       → NAO_RESIDENCIAL

    2. Cruza VALR_ALIQUOTA_LAN com o campo aliquota da tabela de faixas:
       - Prioridade 1: sim_faixas_aliquota (exercício exato) — faixas cadastradas no sistema
       - Prioridade 2: sim_faixas_referencia — faixas históricas de referência

    Exceção: alíquota de 1% (0.01000) existe em TERRITORIAL e NAO_RESIDENCIAL,
    mas é resolvida pelo TIPO_IMPOSTO_LAN antes do cruzamento.
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
            # Passo 1: Classificar usando sim_faixas_aliquota (exercício exato)
            # Faixas cadastradas pelo usuário no sistema para o ano específico
            # ─────────────────────────────────────────────────────────────────
            res1 = db.execute(text("""
                UPDATE "SIA_LANCIPTU_ASG" s
                SET faixa_codigo = fa.faixa_codigo,
                    faixa_label  = fa.faixa_label,
                    faixa_ordem  = fa.faixa_ordem
                FROM sim_faixas_aliquota fa
                WHERE s."CODG_EXERCICIO_LAN" = :ano
                  AND fa.exercicio = :ano
                  AND fa.simulacao_id IS NULL
                  AND s."VALR_ALIQUOTA_LAN" = fa.aliquota
                  AND (
                      -- Territorial: TIPO_IMPOSTO_LAN = 2
                      (s."TIPO_IMPOSTO_LAN" = 2 AND fa.categoria = 'TERRITORIAL')
                      OR
                      -- Residencial: predial (tipo=1) com uso residencial (uso=1)
                      (s."TIPO_IMPOSTO_LAN" = 1 AND s."INFO_USO_LAN" = 1 AND fa.categoria = 'RESIDENCIAL')
                      OR
                      -- Não Residencial: predial (tipo=1) com uso não residencial (uso>1)
                      (s."TIPO_IMPOSTO_LAN" = 1 AND s."INFO_USO_LAN" != 1 AND fa.categoria = 'NAO_RESIDENCIAL')
                  )
            """), {"ano": ano})
            db.commit()
            classificados_passo1 = res1.rowcount
            print(f"   📊 Passo 1 (sim_faixas_aliquota exercício {ano}): {classificados_passo1} imóveis classificados.")

            # ─────────────────────────────────────────────────────────────────
            # Passo 2: Classificar restantes usando sim_faixas_referencia
            # Para imóveis que não foram classificados no passo 1
            # (anos sem faixas específicas cadastradas no sistema)
            # ─────────────────────────────────────────────────────────────────
            res2 = db.execute(text("""
                UPDATE "SIA_LANCIPTU_ASG" s
                SET faixa_codigo = fr.faixa_codigo,
                    faixa_label  = fr.faixa_label,
                    faixa_ordem  = fr.faixa_ordem
                FROM sim_faixas_referencia fr
                WHERE s."CODG_EXERCICIO_LAN" = :ano
                  AND s.faixa_codigo IS NULL
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
            classificados_passo2 = res2.rowcount
            print(f"   📊 Passo 2 (sim_faixas_referencia fallback): {classificados_passo2} imóveis classificados.")

            # ─────────────────────────────────────────────────────────────────
            # Diagnóstico: imóveis que ficaram sem classificação
            # ─────────────────────────────────────────────────────────────────
            nao_classificados = db.execute(text("""
                SELECT COUNT(*) FROM "SIA_LANCIPTU_ASG"
                WHERE "CODG_EXERCICIO_LAN" = :ano AND faixa_codigo IS NULL
            """), {"ano": ano}).scalar()

            total_classificados = classificados_passo1 + classificados_passo2
            print(f"   ✅ Ano {ano}: {total_classificados} classificados | ⚠️ {nao_classificados} sem faixa.")

            if nao_classificados > 0:
                # Mostrar alíquotas que não encontraram correspondência (para diagnóstico)
                aliquotas_sem_match = db.execute(text("""
                    SELECT DISTINCT "VALR_ALIQUOTA_LAN", "TIPO_IMPOSTO_LAN", "INFO_USO_LAN", COUNT(*) as total
                    FROM "SIA_LANCIPTU_ASG"
                    WHERE "CODG_EXERCICIO_LAN" = :ano AND faixa_codigo IS NULL
                    GROUP BY "VALR_ALIQUOTA_LAN", "TIPO_IMPOSTO_LAN", "INFO_USO_LAN"
                    ORDER BY total DESC
                    LIMIT 10
                """), {"ano": ano}).fetchall()
                for row in aliquotas_sem_match:
                    logger.warning(
                        f"   ⚠️ Alíquota sem faixa: {row[0]} | "
                        f"tipo={row[1]} | uso={row[2]} | {row[3]} imóveis"
                    )

        print("🚀 Classificação de faixas concluída com sucesso.")
        return True

    except Exception as e:
        logger.error(f"Erro na classificação de faixas: {e}")
        db.rollback()
        return False
