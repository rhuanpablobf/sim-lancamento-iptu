import pandas as pd
from sqlalchemy import text
import io
import csv
from app.db import engine
from app.celery_app import celery_app
import logging
import time

logger = logging.getLogger(__name__)

# Mapeamento completo
FAIXAS_MAP = {
    (15,  1, 1): ('RES-F1', 'Faixa 1 — Até R$ 100.000',              1),
    (20,  1, 1): ('RES-F2', 'Faixa 2 — R$ 100k a R$ 200k',           2),
    (29,  1, 1): ('RES-F3', 'Faixa 3 — R$ 200k a R$ 300k',           3),
    (40,  1, 1): ('RES-F4', 'Faixa 4 — R$ 300k a R$ 500k',           4),
    (50,  1, 1): ('RES-F5', 'Faixa 5 — R$ 500k a R$ 1mi',            5),
    (55,  1, 1): ('RES-F6', 'Faixa 6 — Acima de R$ 1mi',             6),
    (75,  1, 0): ('NR-F1',  'Faixa 1 — Até R$ 200.000',              1),
    (80,  1, 0): ('NR-F2',  'Faixa 2 — R$ 200k a R$ 300k',           2),
    (85,  1, 0): ('NR-F3',  'Faixa 3 — R$ 300k a R$ 500k',           3),
    (90,  1, 0): ('NR-F4',  'Faixa 4 — R$ 500k a R$ 700k',           4),
    (95,  1, 0): ('NR-F5',  'Faixa 5 — R$ 700k a R$ 1mi',            5),
    (100, 1, 0): ('NR-F6',  'Faixa 6 — Acima de R$ 1mi',             6),
    (100, 2, 0): ('TER-F1', 'Faixa 1 — Até R$ 40.000',               1),
    (130, 2, 0): ('TER-F2', 'Faixa 2 — R$ 40k a R$ 60k',             2),
    (160, 2, 0): ('TER-F3', 'Faixa 3 — R$ 60k a R$ 80k',             3),
    (190, 2, 0): ('TER-F4', 'Faixa 4 — R$ 80k a R$ 100k',            4),
    (220, 2, 0): ('TER-F5', 'Faixa 5 — R$ 100k a R$ 150k',           5),
    (250, 2, 0): ('TER-F6', 'Faixa 6 — R$ 150k a R$ 300k',           6),
    (280, 2, 0): ('TER-F7', 'Faixa 7 — Acima de R$ 300k',            7),
}

def psql_insert_copy(table, conn, keys, data_iter):
    dbapi_conn = conn.connection
    with dbapi_conn.cursor() as cur:
        s_buf = io.StringIO()
        writer = csv.writer(s_buf)
        writer.writerows(data_iter)
        s_buf.seek(0)
        columns = ', '.join(['"{}"'.format(k) for k in keys])
        sql = 'COPY "{}" ({}) FROM STDIN WITH CSV'.format(table.name, columns)
        cur.copy_expert(sql=sql, file=s_buf)

def classificar_faixas_df(df):
    """
    Versão otimizada para classificação em massa usando mapeamento por tupla.
    """
    codes, labels, orders = [], [], []
    total = len(df)
    
    # Pré-cálculo de vetores para performance
    # Arredondamos para 4 casas para evitar flutuações e multiplicamos por 10000
    aliq_int = (pd.to_numeric(df['VALR_ALIQUOTA_LAN'], errors='coerce') * 10000).round().fillna(0).astype(int).tolist()
    tipo = pd.to_numeric(df['TIPO_IMPOSTO_LAN'], errors='coerce').fillna(0).astype(int).tolist()
    uso = pd.to_numeric(df['INFO_USO_LAN'], errors='coerce').fillna(0).astype(int).tolist()
    
    for i in range(total):
        try:
            a = aliq_int[i]
            t = tipo[i]
            u = uso[i]
            
            # flag_residencial só importa para predial (tipo=1)
            is_res = 1 if (t == 1 and u == 1) else 0
            chave = (a, t, is_res)
            
            res = FAIXAS_MAP.get(chave)
            if res:
                codes.append(res[0])
                labels.append(res[1])
                orders.append(res[2])
                continue
        except:
            pass
            
        codes.append('INDEFINIDO')
        labels.append(f'Alíquota não mapeada: {df.iloc[i]["VALR_ALIQUOTA_LAN"]}')
        orders.append(99)
        
    df['faixa_codigo'] = codes
    df['faixa_label'] = labels
    df['faixa_ordem'] = orders
    return df

@celery_app.task(bind=True)
def classificar_faixas_task(self):
    try:
        self.update_state(state='PROGRESS', meta={'progresso': 10, 'mensagem': 'Carregando dados do banco...'})
        df = pd.read_sql("""
            SELECT "ISN_SIA_LANCIPTU_ASG", "CODG_EXERCICIO_LAN", "TIPO_IMPOSTO_LAN", "INFO_USO_LAN", "VALR_ALIQUOTA_LAN"
            FROM "SIA_LANCIPTU_ASG"
            WHERE "CODG_EXERCICIO_LAN" >= 2022
              AND ("INFO_STATUS_LAN" IS NULL OR "INFO_STATUS_LAN" = '1')
              AND "VALR_ALIQUOTA_LAN" IS NOT NULL
        """, engine)

        if df.empty: return {"status": "SUCESSO", "total": 0}

        self.update_state(state='PROGRESS', meta={'progresso': 30, 'mensagem': f'Classificando {len(df):,} registros...'})
        df = classificar_faixas_df(df)

        self.update_state(state='PROGRESS', meta={'progresso': 60, 'mensagem': 'Atualizando banco via Bulk COPY...'})
        df_update = df[['ISN_SIA_LANCIPTU_ASG', 'faixa_codigo', 'faixa_label', 'faixa_ordem']]
        df_update.columns = ['isn', 'codigo', 'label', 'ordem']

        with engine.begin() as conn:
            conn.execute(text('DROP TABLE IF EXISTS tmp_classificacao'))
            conn.execute(text('CREATE TABLE tmp_classificacao (isn BIGINT PRIMARY KEY, codigo VARCHAR(10), label VARCHAR(60), ordem SMALLINT)'))
            df_update.to_sql('tmp_classificacao', conn, if_exists='append', index=False, method=psql_insert_copy)
            conn.execute(text("""
                UPDATE "SIA_LANCIPTU_ASG" s
                SET faixa_codigo = t.codigo, faixa_label = t.label, faixa_ordem = t.ordem
                FROM tmp_classificacao t WHERE s."ISN_SIA_LANCIPTU_ASG" = t.isn
            """))
            conn.execute(text('DROP TABLE tmp_classificacao'))

        return {"status": "CONCLUIDO", "total": len(df)}
    except Exception as e:
        logger.error(f"Erro na task de classificação: {str(e)}")
        self.update_state(state='FAILURE', meta={'mensagem': str(e)})
        raise e
