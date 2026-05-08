
import pandas as pd
from sqlalchemy import create_engine, text
import io
import csv

# Configurações
DB_URL = "postgresql://iptu_user:iptu_password@localhost:5433/lancamento-iptu"
FILE_PATH = r"c:\Users\Rhuan\OneDrive\Documentos\1.Sistema\SistemaLancamentoIPTU\lancamento-iptu\dadosCru\raw_lancamento_iptu_tipo_edf.csv"

engine = create_engine(DB_URL)

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

print("Iniciando carga de edificações...")
try:
    # Ler em chunks para não estourar memória
    chunks = pd.read_csv(FILE_PATH, sep=";", encoding="utf-8", dtype=str, chunksize=100000)
    
    total = 0
    for i, chunk in enumerate(chunks):
        # Limpar nomes de colunas (remover aspas se o pandas não removeu)
        chunk.columns = [c.replace('"', '') for c in chunk.columns]
        
        with engine.begin() as conn:
            chunk.to_sql("SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN", conn, if_exists="append", index=False, method=psql_insert_copy)
        
        total += len(chunk)
        print(f"Processados: {total:,}")

    print("Carga finalizada com sucesso!")
except Exception as e:
    print(f"Erro na carga: {str(e)}")
