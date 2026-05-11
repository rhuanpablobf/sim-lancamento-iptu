
from sqlalchemy import text
from sqlalchemy.orm import Session
import pandas as pd
import logging

logger = logging.getLogger(__name__)

def classificar_faixas_base_real(db: Session, anos: list = None):
    """
    Classifica cada imóvel da base real (SIA_LANCIPTU_ASG) em sua respectiva faixa de alíquota.
    Usa como referência as faixas cadastradas no banco (sim_faixas_aliquota) onde simulacao_id is NULL.
    """
    try:
        if not anos:
            # Se não informar anos, pega todos os anos presentes na base real
            resultado_anos = db.execute(text('SELECT DISTINCT "CODG_EXERCICIO_LAN" FROM "SIA_LANCIPTU_ASG"')).scalars().all()
            anos = [int(a) for a in resultado_anos if a is not None]

        if not anos:
            logger.warning("Nenhum exercício encontrado para classificação de faixas.")
            return

        for ano in anos:
            logger.info(f"Classificando faixas para o exercício {ano}...")
            
            # 1. Carregar faixas de referência para este ano (ou do ano mais próximo se não houver)
            faixas_db = db.execute(text("""
                SELECT categoria, faixa_codigo, faixa_label, limite_inferior, limite_superior, aliquota
                FROM sim_faixas_aliquota 
                WHERE exercicio = :ano AND simulacao_id IS NULL
                ORDER BY categoria, limite_inferior
            """), {"ano": ano}).mappings().all()

            if not faixas_db:
                # Fallback: tentar pegar do ano anterior se houver
                logger.info(f"Sem faixas para {ano}, tentando fallback...")
                faixas_db = db.execute(text("""
                    SELECT categoria, faixa_codigo, faixa_label, limite_inferior, limite_superior, aliquota
                    FROM sim_faixas_aliquota 
                    WHERE simulacao_id IS NULL
                    ORDER BY exercicio DESC, categoria, limite_inferior
                    LIMIT 20
                """)).mappings().all()
            
            if not faixas_db:
                logger.error(f"Nenhuma faixa de alíquota encontrada no banco para classificar o ano {ano}.")
                continue

            # Organizar faixas por categoria
            faixas_por_cat = {}
            for f in faixas_db:
                cat = f["categoria"]
                if cat not in faixas_por_cat: faixas_por_cat[cat] = []
                faixas_por_cat[cat].append(f)

            # 2. Processar em lotes para não estourar a memória
            # Vamos classificar categoria por categoria para ser mais eficiente
            for cat_nome, faixas in faixas_por_cat.items():
                logger.info(f"Processando categoria {cat_nome} no ano {ano}...")
                
                # Mapear categoria para filtros SQL do Postgres
                filtro_uso = ""
                if cat_nome == "Residencial":
                    filtro_uso = 'AND "INFO_USO_LAN" = 1 AND "TIPO_IMPOSTO_LAN" != 2'
                elif cat_nome == "Não Residencial":
                    filtro_uso = 'AND "INFO_USO_LAN" != 1 AND "TIPO_IMPOSTO_LAN" != 2'
                elif cat_nome == "Territorial":
                    filtro_uso = 'AND "TIPO_IMPOSTO_LAN" = 2'

                # Resetar faixas antes de começar (para garantir limpeza)
                db.execute(text(f"""
                    UPDATE "SIA_LANCIPTU_ASG" 
                    SET faixa_codigo = NULL, faixa_label = NULL
                    WHERE "CODG_EXERCICIO_LAN" = :ano {filtro_uso}
                """), {"ano": ano})
                db.commit()

                for f in faixas:
                    lim_inf = float(f["limite_inferior"])
                    lim_sup = float(f["limite_superior"]) if f["limite_superior"] else 999999999999.0
                    f_cod = f["faixa_codigo"]
                    f_lab = f["faixa_label"]

                    # Atualizar imóveis que caem nesta faixa
                    # Nota: Usamos VALR_VENAL_LAN para o histórico real
                    sql_update = text(f"""
                        UPDATE "SIA_LANCIPTU_ASG"
                        SET faixa_codigo = :f_cod,
                            faixa_label = :f_lab
                        WHERE "CODG_EXERCICIO_LAN" = :ano
                          {filtro_uso}
                          AND CAST("VALR_VENAL_LAN" AS NUMERIC) >= :inf
                          AND CAST("VALR_VENAL_LAN" AS NUMERIC) < :sup
                    """)
                    
                    db.execute(sql_update, {
                        "ano": ano,
                        "f_cod": f_cod,
                        "f_lab": f_lab,
                        "inf": lim_inf,
                        "sup": lim_sup
                    })
                    db.commit()
            
        logger.info("Classificação de faixas concluída com sucesso.")
        return True
    except Exception as e:
        logger.error(f"Erro na classificação de faixas: {e}")
        db.rollback()
        return False
