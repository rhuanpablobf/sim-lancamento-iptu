import pandas as pd
from sqlalchemy import create_engine, text
import time
import io
import csv

# Conexão (ajustada para ambiente local acessando container)
engine = create_engine('postgresql://iptu_user:iptu_password@db:5432/lancamento-iptu')

# Mapeamento completo: (aliquota_arredondada, tipo_imposto, residencial_flag) -> (codigo, label, ordem)
# Multiplicamos a alíquota por 10000 para converter para inteiro (ex: 0.0015 -> 15, 0.0100 -> 100)
FAIXAS_MAP = {
    # Residencial (tipo_imposto=1, uso=1)
    (15,  1, 1): ('RES-F1', 'Faixa 1 — Até R$ 100.000',              1),
    (20,  1, 1): ('RES-F2', 'Faixa 2 — R$ 100k a R$ 200k',           2),
    (29,  1, 1): ('RES-F3', 'Faixa 3 — R$ 200k a R$ 300k',           3),
    (40,  1, 1): ('RES-F4', 'Faixa 4 — R$ 300k a R$ 500k',           4),
    (50,  1, 1): ('RES-F5', 'Faixa 5 — R$ 500k a R$ 1mi',            5),
    (55,  1, 1): ('RES-F6', 'Faixa 6 — Acima de R$ 1mi',             6),
    # Não residencial (tipo_imposto=1, uso≠1)
    (75,  1, 0): ('NR-F1',  'Faixa 1 — Até R$ 200.000',              1),
    (80,  1, 0): ('NR-F2',  'Faixa 2 — R$ 200k a R$ 300k',           2),
    (85,  1, 0): ('NR-F3',  'Faixa 3 — R$ 300k a R$ 500k',           3),
    (90,  1, 0): ('NR-F4',  'Faixa 4 — R$ 500k a R$ 700k',           4),
    (95,  1, 0): ('NR-F5',  'Faixa 5 — R$ 700k a R$ 1mi',            5),
    (100, 1, 0): ('NR-F6',  'Faixa 6 — Acima de R$ 1mi',             6),
    # Territorial (tipo_imposto=2)
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
        def _limpar_valores(row):
            return [val if pd.notna(val) else "" for val in row]
        writer.writerows((_limpar_valores(row) for row in data_iter))
        s_buf.seek(0)
        columns = ', '.join(['"{}"'.format(k) for k in keys])
        table_name = table.name
        if table.schema:
            table_name = '{}.{}'.format(table.schema, table.name)
        sql = 'COPY "{}" ({}) FROM STDIN WITH CSV'.format(table_name, columns)
        cur.copy_expert(sql=sql, file=s_buf)

def main():
    start_time = time.time()
    print('Carregando lançamentos 2022+...')
    df = pd.read_sql("""
        SELECT
            "ISN_SIA_LANCIPTU_ASG",
            "CODG_EXERCICIO_LAN",
            "TIPO_IMPOSTO_LAN",
            "INFO_USO_LAN",
            "VALR_ALIQUOTA_LAN"
        FROM "SIA_LANCIPTU_ASG"
        WHERE "CODG_EXERCICIO_LAN" >= 2022
          AND ("INFO_STATUS_LAN" IS NULL OR "INFO_STATUS_LAN" = '1')
          AND "VALR_ALIQUOTA_LAN" IS NOT NULL
    """, engine)

    if df.empty:
        print("Nenhum registro encontrado para classificação.")
        return

    print(f'{len(df):,} lançamentos carregados. Classificando...')
    
    codes, labels, orders = [], [], []
    total = len(df)
    
    for i, row in enumerate(df.itertuples()):
        if i % 100000 == 0 and i > 0:
            print(f'  Classificado {i:,} / {total:,}...')
            
        try:
            aliq_int = round(float(row.VALR_ALIQUOTA_LAN) * 10000)
            tipo = int(row.TIPO_IMPOSTO_LAN)
            residencial = int(row.INFO_USO_LAN) == 1 if pd.notna(row.INFO_USO_LAN) else False
            
            # Chave: (aliq_int, tipo_imposto, flag_residencial)
            # flag_residencial só importa para predial (tipo=1)
            chave = (aliq_int, tipo, 1 if (tipo == 1 and residencial) else 0)
            
            res = FAIXAS_MAP.get(chave)
            if res:
                codes.append(res[0])
                labels.append(res[1])
                orders.append(res[2])
                continue
        except:
            pass
            
        codes.append('INDEFINIDO')
        labels.append(f'Alíquota não mapeada: {row.VALR_ALIQUOTA_LAN}')
        orders.append(99)

    df['faixa_codigo'] = codes
    df['faixa_label'] = labels
    df['faixa_ordem'] = orders

    # Verificar não mapeados
    indefinidos = df[df['faixa_codigo'] == 'INDEFINIDO']
    if len(indefinidos) > 0:
        print(f'ATENÇÃO: {len(indefinidos)} lançamentos não mapeados:')
        print(indefinidos[['CODG_EXERCICIO_LAN','TIPO_IMPOSTO_LAN',
                            'INFO_USO_LAN','VALR_ALIQUOTA_LAN']].value_counts().head(10))

    # Atualização otimizada via tabela temporária
    print('Atualizando banco de dados (Bulk Update)...')
    df_update = df[['ISN_SIA_LANCIPTU_ASG', 'faixa_codigo', 'faixa_label', 'faixa_ordem']].copy()
    df_update.columns = ['isn', 'codigo', 'label', 'ordem']
    
    with engine.begin() as conn:
        # Criar tabela temporária
        conn.execute(text('DROP TABLE IF EXISTS tmp_classificacao'))
        conn.execute(text("""
            CREATE TABLE tmp_classificacao (
                isn BIGINT PRIMARY KEY,
                codigo VARCHAR(10),
                label VARCHAR(60),
                ordem SMALLINT
            )
        """))
        
        # Enviar dados para a temporária
        df_update.to_sql('tmp_classificacao', conn, if_exists='append', index=False, method=psql_insert_copy)
        
        # Update via JOIN
        print('Executando UPDATE via JOIN...')
        conn.execute(text("""
            UPDATE "SIA_LANCIPTU_ASG" s
            SET faixa_codigo = t.codigo,
                faixa_label  = t.label,
                faixa_ordem  = t.ordem
            FROM tmp_classificacao t
            WHERE s."ISN_SIA_LANCIPTU_ASG" = t.isn
        """))
        
        # Limpar
        conn.execute(text('DROP TABLE tmp_classificacao'))

    # Resumo final
    print('\n=== RESULTADO ===')
    resumo = df.groupby(['CODG_EXERCICIO_LAN', 'faixa_codigo']).size().reset_index(name='qtd')
    print(resumo.to_string(index=False))
    
    end_time = time.time()
    print(f'\nClassificação concluída em {end_time - start_time:.2f} segundos.')

if __name__ == '__main__':
    main()
