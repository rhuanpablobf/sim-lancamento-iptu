import os
import io
import pandas as pd
import csv
from sqlalchemy import text
from app.db import engine
from app.celery_app import celery_app
import logging

logger = logging.getLogger(__name__)

def psql_insert_copy(table, conn, keys, data_iter):
    """
    Método de alta performance para to_sql usando COPY do PostgreSQL.
    Reduz drasticamente o consumo de memória e CPU.
    """
    # gets a DBAPI connection can provide a cursor
    dbapi_conn = conn.connection
    with dbapi_conn.cursor() as cur:
        s_buf = io.StringIO()
        writer = csv.writer(s_buf)
        
        # Converte valores nulos (NaN, pd.NA, None) para None 
        # para que o csv.writer grave como campos vazios, que o COPY do Postgres interpreta como NULL
        def _limpar_valores(row):
            return [val if pd.notna(val) else "" for val in row]

        writer.writerows((_limpar_valores(row) for row in data_iter))
        s_buf.seek(0)

        columns = ', '.join(['"{}"'.format(k) for k in keys])
        if table.schema:
            table_name = '{}.{}'.format(table.schema, table.name)
        else:
            table_name = table.name

        sql = 'COPY "{}" ({}) FROM STDIN WITH CSV'.format(table_name, columns)
        cur.copy_expert(sql=sql, file=s_buf)

def _processar_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Normaliza o DataFrame."""
    colunas_float = ["VALR_VENAL_LAN", "VALR_ALIQUOTA_LAN", "VALR_IMPOSTO_LAN", "VALR_TOTAL_LAN",
                     "QTDE_AREA_TERRENO_LAN", "QTDE_AREA_EDIFICADA_LAN"]
    for col in colunas_float:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(",", "."), errors="coerce")

    colunas_int = [
        "ISN_SIA_LANCIPTU_ASG", "CODG_EXERCICIO_LAN", "TIPO_IMPOSTO_LAN",
        "TIPO_LANCAMENTO_LAN", "INFO_USO_LAN", "INFO_OCUPACAO_LAN",
        "INFO_POSICAO_FISCAL_LAN", "NUMR_SEQUENCIA_LAN", "INFO_STATUS_LAN",
        "CODG_BAIRRO_IMOVEL_LAN", "CODG_EDIFICIO_LAN",
    ]
    for col in colunas_int:
        if col in df.columns:
            # Garante que seja lido como número e convertido para Inteiro de 64 bits (aceita nulos)
            # O Pandas converte automaticamente para float se houver nulos, o que quebra o COPY do Postgres
            df[col] = pd.to_numeric(df[col], errors="coerce").round().astype("Int64")

    if "INFO_STATUS_LAN" in df.columns:
        df = df[df["INFO_STATUS_LAN"].isna() | (df["INFO_STATUS_LAN"] == 1)]
    
    return df

@celery_app.task(bind=True)
def importar_csv_task(self, path_principal: str, path_auxiliar: str, modo: str, import_id: str):
    """Task otimizada para processar arquivos CSV gigantes (COPY method + Chunks)."""
    try:
        self.update_state(state='PROGRESS', meta={'progresso': 5, 'mensagem': 'Iniciando importação otimizada...'})
        
        # 1. Identificar exercícios para limpeza se modo for substituir
        # Lemos apenas a coluna de exercício primeiro para ser rápido
        df_anos = pd.read_csv(path_principal, sep=";", usecols=["CODG_EXERCICIO_LAN"], encoding="utf-8")
        anos = df_anos["CODG_EXERCICIO_LAN"].dropna().unique().tolist()
        
        if modo == "substituir" and anos:
            self.update_state(state='PROGRESS', meta={'progresso': 10, 'mensagem': 'Limpando dados antigos...'})
            with engine.begin() as conn:
                for ano in anos:
                    conn.execute(text('DELETE FROM "SIA_LANCIPTU_ASG" WHERE "CODG_EXERCICIO_LAN" = :ano'), {"ano": int(ano)})

        # 2. Processar e Inserir o arquivo Principal em Chunks
        self.update_state(state='PROGRESS', meta={'progresso': 20, 'mensagem': 'Lendo e inserindo dados principais (via COPY)...'})
        
        total_processado = 0
        # Usamos chunksize para não estourar a RAM
        chunks = pd.read_csv(path_principal, sep=";", encoding="utf-8", dtype=str, chunksize=100000)
        
        for i, chunk in enumerate(chunks):
            df_chunk = _processar_dataframe(chunk)
            if not df_chunk.empty:
                with engine.begin() as conn:
                    df_chunk.to_sql(
                        "SIA_LANCIPTU_ASG",
                        conn,
                        if_exists="append",
                        index=False,
                        method=psql_insert_copy  # MÉTODO ULTRA RÁPIDO
                    )
                total_processado += len(df_chunk)
                prog = min(20 + (i * 5), 70) # Avança progresso gradualmente
                self.update_state(state='PROGRESS', meta={'progresso': prog, 'mensagem': f'Processado {total_processado} registros...'})

        # 3. Processar e Inserir o arquivo Auxiliar (se existir)
        total_aux = 0
        if path_auxiliar and os.path.exists(path_auxiliar):
            self.update_state(state='PROGRESS', meta={'progresso': 80, 'mensagem': 'Processando tabela auxiliar...'})
            
            chunks_aux = pd.read_csv(path_auxiliar, sep=";", encoding="utf-8", dtype=str, chunksize=100000)
            for chunk_aux in chunks_aux:
                if not chunk_aux.empty:
                    with engine.begin() as conn:
                        chunk_aux.to_sql(
                            "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN",
                            conn,
                            if_exists="append",
                            index=False,
                            method=psql_insert_copy
                        )
                    total_aux += len(chunk_aux)
        else:
            self.update_state(state='PROGRESS', meta={'progresso': 90, 'mensagem': 'Arquivo auxiliar não fornecido, pulando...'})

        # 4. Limpeza final de órfãos (apenas se houver arquivo auxiliar para limpar)
        if total_aux > 0:
            self.update_state(state='PROGRESS', meta={'progresso': 95, 'mensagem': 'Finalizando integridade...'})
            with engine.begin() as conn:
                conn.execute(text("""
                    DELETE FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" t
                    WHERE NOT EXISTS (SELECT 1 FROM "SIA_LANCIPTU_ASG" s WHERE s."ISN_SIA_LANCIPTU_ASG" = t."ISN_SIA_LANCIPTU_ASG")
                """))

        # Limpar arquivos temporários
        if os.path.exists(path_principal): os.remove(path_principal)
        if path_auxiliar and os.path.exists(path_auxiliar): os.remove(path_auxiliar)
        
        return {
            "status": "CONCLUIDO",
            "registros_lancamento": total_processado,
            "registros_aux": total_aux,
            "import_id": import_id
        }
        
    except Exception as e:
        logger.error(f"Erro na task de importação: {str(e)}")
        if path_principal and os.path.exists(path_principal): os.remove(path_principal)
        if path_auxiliar and os.path.exists(path_auxiliar): os.remove(path_auxiliar)
        self.update_state(state='FAILURE', meta={'mensagem': str(e)})
        raise e
