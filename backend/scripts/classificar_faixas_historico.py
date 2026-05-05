import pandas as pd
from sqlalchemy import create_engine, text
import time
import io
import csv

# Conexão (ajustada para ambiente interno do Docker)
engine = create_engine('postgresql://iptu_user:iptu_password@db:5432/lancamento-iptu')

# Mapeamento completo: (aliquota_arredondada, tipo_imposto, residencial_flag) -> (codigo, label, ordem)
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
        table_name = table.name
        sql = 'COPY "{}" ({}) FROM STDIN WITH CSV'.format(table_name, columns)
        cur.copy_expert(sql=sql, file=s_buf)

def classificar_faixas_df(df):
    df['faixa_codigo'] = 'INDEFINIDO'
    df['faixa_label'] = 'Alíquota não mapeada'
    df['faixa_ordem'] = 99
    aliq_int = (pd.to_numeric(df['VALR_ALIQUOTA_LAN'], errors='coerce') * 10000).round().fillna(0).astype(int)
    tipo = pd.to_numeric(df['TIPO_IMPOSTO_LAN'], errors='coerce').fillna(0).astype(int)
    uso_res = (pd.to_numeric(df['INFO_USO_LAN'], errors='coerce') == 1)
    for (a, t, r), (cod, lab, ord) in FAIXAS_MAP.items():
        mask = (aliq_int == a) & (tipo == t)
        if t == 1: mask &= (uso_res if r == 1 else ~uso_res)
        df.loc[mask, 'faixa_codigo'] = cod
        df.loc[mask, 'faixa_label'] = lab
        df.loc[mask, 'faixa_ordem'] = ord
    return df

def main():
    start_time = time.time()
    print('Carregando lançamentos 2022+...')
    df = pd.read_sql("""
        SELECT "ISN_SIA_LANCIPTU_ASG", "CODG_EXERCICIO_LAN", "TIPO_IMPOSTO_LAN", "INFO_USO_LAN", "VALR_ALIQUOTA_LAN"
        FROM "SIA_LANCIPTU_ASG"
        WHERE "CODG_EXERCICIO_LAN" >= 2022
          AND ("INFO_STATUS_LAN" IS NULL OR "INFO_STATUS_LAN" = 1)
          AND "VALR_ALIQUOTA_LAN" IS NOT NULL
    """, engine)

    if df.empty: return
    print(f'{len(df):,} lançamentos carregados. Classificando...')
    df = classificar_faixas_df(df)

    print('Atualizando banco de dados (Bulk COPY)...')
    df_update = df[['ISN_SIA_LANCIPTU_ASG', 'faixa_codigo', 'faixa_label', 'faixa_ordem']]
    df_update.columns = ['isn', 'codigo', 'label', 'ordem'] # Align with table

    with engine.begin() as conn:
        conn.execute(text('DROP TABLE IF EXISTS tmp_classificacao'))
        conn.execute(text('CREATE TABLE tmp_classificacao (isn BIGINT PRIMARY KEY, codigo VARCHAR(10), label VARCHAR(60), ordem SMALLINT)'))
        df_update.to_sql('tmp_classificacao', conn, if_exists='append', index=False, method=psql_insert_copy)
        print('Executando UPDATE via JOIN...')
        conn.execute(text("""
            UPDATE "SIA_LANCIPTU_ASG" s
            SET faixa_codigo = t.codigo, faixa_label = t.label, faixa_ordem = t.ordem
            FROM tmp_classificacao t WHERE s."ISN_SIA_LANCIPTU_ASG" = t.isn
        """))
        conn.execute(text('DROP TABLE tmp_classificacao'))

    print(f'\nConcluído em {time.time() - start_time:.2f}s.')

if __name__ == '__main__':
    main()
