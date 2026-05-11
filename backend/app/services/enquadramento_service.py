
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
            # 1. Buscar faixas na tabela de REFERÊNCIA (sim_faixas_referencia)
            # Esta tabela contém as faixas oficiais do Código Tributário para o histórico
            faixas_db = db.execute(text("""
                SELECT categoria, faixa_codigo, faixa_label, limite_inferior, limite_superior, aliquota
                FROM sim_faixas_referencia 
                ORDER BY categoria, limite_inferior
            """)).mappings().all()

            if not faixas_db:
                # Fallback: se a tabela de referência não existir/vazia, tenta as alíquotas base da simulação
                logger.info(f"Sem faixas em sim_faixas_referencia para {ano}, tentando sim_faixas_aliquota...")
                faixas_db = db.execute(text("""
                    SELECT categoria, faixa_codigo, faixa_label, limite_inferior, limite_superior, aliquota
                    FROM sim_faixas_aliquota 
                    WHERE (exercicio = :ano OR exercicio IS NULL) AND simulacao_id IS NULL
                    ORDER BY categoria, limite_inferior
                """), {"ano": ano}).mappings().all()
            
            if not faixas_db:
                print(f"❌ Nenhuma faixa de alíquota encontrada para o ano {ano} ou fallback.")
                continue

            print(f"📌 Encontradas {len(faixas_db)} faixas para processar o ano {ano}.")

            # Organizar faixas por categoria
            faixas_por_cat = {}
            for f in faixas_db:
                cat = f["categoria"]
                if cat not in faixas_por_cat: faixas_por_cat[cat] = []
                faixas_por_cat[cat].append(f)

            # 2. Processar em lotes para não estourar a memória
            for cat_nome, faixas in faixas_por_cat.items():
                # Mapear categoria para filtros SQL do Postgres
                filtro_uso = ""
                if cat_nome == "RESIDENCIAL":
                    filtro_uso = 'AND "INFO_USO_LAN" = 1 AND "TIPO_IMPOSTO_LAN" != 2'
                elif cat_nome == "NAO_RESIDENCIAL":
                    filtro_uso = 'AND "INFO_USO_LAN" != 1 AND "TIPO_IMPOSTO_LAN" != 2'
                elif cat_nome == "TERRITORIAL":
                    filtro_uso = 'AND "TIPO_IMPOSTO_LAN" = 2'

                # Resetar faixas antes de começar
                db.execute(text(f"""
                    UPDATE "SIA_LANCIPTU_ASG" 
                    SET faixa_codigo = NULL, faixa_label = NULL, faixa_ordem = NULL
                    WHERE "CODG_EXERCICIO_LAN" = :ano {filtro_uso}
                """), {"ano": ano})
                db.commit()

                # Ordenar faixas pelo limite inferior para garantir numeração correta
                faixas = sorted(faixas, key=lambda x: float(x["limite_inferior"]))
                
                for idx, f in enumerate(faixas, 1):
                    lim_inf = float(f["limite_inferior"])
                    lim_sup = float(f["limite_superior"]) if f["limite_superior"] else 999999999999.0
                    
                    # Batismo automático se estiver nulo
                    f_cod = str(f["faixa_codigo"]) if f["faixa_codigo"] else str(idx)
                    f_lab = str(f["faixa_label"]) if f["faixa_label"] else f"Faixa {idx}"
                    f_ord = f["faixa_ordem"] if f["faixa_ordem"] is not None else idx

                    # Atualizar imóveis que caem nesta faixa
                    sql_update = text(f"""
                        UPDATE "SIA_LANCIPTU_ASG"
                        SET faixa_codigo = :f_cod,
                            faixa_label = :f_lab,
                            faixa_ordem = :f_ord
                        WHERE "CODG_EXERCICIO_LAN" = :ano
                          {filtro_uso}
                          AND CAST(REPLACE(CAST("VALR_VENAL_LAN" AS TEXT), ',', '.') AS NUMERIC) >= :inf
                          AND CAST(REPLACE(CAST("VALR_VENAL_LAN" AS TEXT), ',', '.') AS NUMERIC) < :sup
                    """)
                    
                    res = db.execute(sql_update, {
                        "ano": ano,
                        "f_cod": f_cod,
                        "f_lab": f_lab,
                        "f_ord": f_ord,
                        "inf": lim_inf,
                        "sup": lim_sup
                    })
                    db.commit()
                    if res.rowcount > 0:
                        print(f"   ✅ {cat_nome} | {f_lab}: {res.rowcount} imóveis enquadrados.")
            
        print("🚀 Classificação de faixas concluída com sucesso.")
        return True
    except Exception as e:
        logger.error(f"Erro na classificação de faixas: {e}")
        db.rollback()
        return False
