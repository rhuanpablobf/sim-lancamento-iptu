import os
import clickhouse_connect
import logging
import threading
from uuid import UUID

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "localhost")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")

_thread_local = threading.local()

def obter_cliente():
    """Retorna um cliente de conexão com o ClickHouse para a thread atual (Thread-Local)."""
    if getattr(_thread_local, "client", None) is not None:
        return _thread_local.client
        
    try:
        _thread_local.client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            port=CLICKHOUSE_PORT,
            username=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD,
            database="lancamento_iptu"
        )
        return _thread_local.client
    except Exception as e:
        logging.error(f"Erro ao conectar no ClickHouse: {e}")
        return None

def consultar_clickhouse(query, params=None):
    """Executa uma consulta no ClickHouse e retorna os resultados como lista de dicts."""
    client = obter_cliente()
    if not client:
        return []
    try:
        resultado = client.query(query, parameters=params)
        return [dict(zip(resultado.column_names, row)) for row in resultado.result_rows]
    except Exception as e:
        logging.error(f"Erro ao consultar ClickHouse: {e}")
        return []

def inicializar_clickhouse():
    """Cria as tabelas analíticas no ClickHouse caso não existam."""
    client = obter_cliente()
    if not client:
        return

    logging.info("Inicializando schema do ClickHouse...")
    
    # Garante que o database existe
    client.command("CREATE DATABASE IF NOT EXISTS lancamento_iptu")
    
    # Tabela desnormalizada para simulações
    client.command("""
        CREATE TABLE IF NOT EXISTS lancamento_iptu.sim_lancamentos_analitico (
            simulacao_id String,
            exercicio UInt16,
            categoria String,
            faixa_codigo String,
            faixa_label String,
            tipo_lancamento UInt8,
            tipo_edificacao String,
            valr_imposto Float64,
            valr_venal_simulado Float64,
            valr_imposto_anterior Float64,
            valr_venal_anterior Float64,
            valr_aliquota Float64
        ) ENGINE = MergeTree()
        ORDER BY (simulacao_id, exercicio, categoria, faixa_codigo)
    """)

    # Tabela desnormalizada para histórico real (cache analítico)
    client.command("""
        CREATE TABLE IF NOT EXISTS lancamento_iptu.historico_lancamentos_analitico (
            exercicio UInt16,
            categoria String,
            faixa_codigo String,
            faixa_label String,
            tipo_lancamento UInt8,
            tipo_edificacao String,
            valr_imposto Float64,
            valr_venal_total Float64
        ) ENGINE = MergeTree()
        ORDER BY (exercicio, categoria, faixa_codigo)
    """)
    
    # Tabela de cache para migração da trava (CAP)
    client.command("""
        CREATE TABLE IF NOT EXISTS lancamento_iptu.cache_migracao_trava (
            exercicio UInt16,
            subiu_faixa UInt64,
            desceu_faixa UInt64,
            travado_cap UInt64,
            abaixo_trava UInt64
        ) ENGINE = MergeTree()
        ORDER BY exercicio
    """)
    
    # Tabela de cache para migração da trava de simulações (CAP)
    client.command("""
        CREATE TABLE IF NOT EXISTS lancamento_iptu.cache_sim_migracao_trava (
            simulacao_id String,
            exercicio UInt16,
            subiu_faixa UInt64,
            desceu_faixa UInt64,
            travado_cap UInt64,
            abaixo_trava UInt64
        ) ENGINE = MergeTree()
        ORDER BY (simulacao_id, exercicio)
    """)
    
    logging.info("Schema do ClickHouse pronto.")

def sincronizar_historico_para_clickhouse(db_session):
    """Sincroniza a base histórica real do Postgres para o ClickHouse."""
    from sqlalchemy import text
    import pandas as pd
    
    client = obter_cliente()
    if not client:
        return

    logging.info("Sincronizando histórico para ClickHouse...")
    
    # Garante que as tabelas existam antes de tentar fazer TRUNCATE
    # Isso protege contra o caso em que o ClickHouse subiu depois do backend
    inicializar_clickhouse()
    
    # Query que traz os tipos de edificação formatados
    query = text("""
        WITH tipos AS (
            SELECT 
                "ISN_SIA_LANCIPTU_ASG",
                STRING_AGG(
                    CASE "INFO_TIPO_EDF_LAN"
                        WHEN 1 THEN 'Casa'
                        WHEN 2 THEN 'Apartamento'
                        WHEN 3 THEN 'Barracão'
                        WHEN 4 THEN 'Loja'
                        WHEN 5 THEN 'Sala/Escritório'
                        WHEN 6 THEN 'Galpão Comum'
                        WHEN 7 THEN 'Galpão Industrial'
                        WHEN 8 THEN 'Telheiro'
                        WHEN 9 THEN 'Edificacao em Altura'
                        WHEN 10 THEN 'Especial'
                        WHEN 11 THEN 'Garagem'
                        WHEN 12 THEN 'Condomínio'
                        WHEN 13 THEN 'Escaninho'
                        WHEN 14 THEN 'Sobrado'
                        ELSE 'Não Mapeado'
                    END,
                    ' / '
                    ORDER BY cnxarraycolumn
                ) AS tipo_edificacao
            FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN"
            GROUP BY 1
        )
        SELECT 
            COALESCE(s."CODG_EXERCICIO_LAN", 0) AS exercicio,
            CASE WHEN s."TIPO_IMPOSTO_LAN" = '2' THEN 'Territorial'
                 WHEN s."INFO_USO_LAN" = '1' THEN 'Residencial'
                 ELSE 'Não Residencial' END AS categoria,
            COALESCE(s.faixa_codigo, '0') AS faixa_codigo,
            COALESCE(s.faixa_label, 'Sem Faixa') AS faixa_label,
            CASE 
                WHEN s."TIPO_LANCAMENTO_LAN" = 1 AND s."INFO_POSICAO_FISCAL_LAN" IS NULL THEN 3
                WHEN s."TIPO_LANCAMENTO_LAN" = 1 AND s."INFO_POSICAO_FISCAL_LAN" = 1 THEN 4
                WHEN s."TIPO_LANCAMENTO_LAN" = 1 AND s."INFO_POSICAO_FISCAL_LAN" >= 2 THEN 1
                WHEN s."TIPO_LANCAMENTO_LAN" = 2 THEN 2
                WHEN s."TIPO_LANCAMENTO_LAN" = 3 THEN 3
                ELSE 0
            END AS tipo_lancamento,
            COALESCE(t.tipo_edificacao, 'Territorial') AS tipo_edificacao,
            COALESCE(s."VALR_IMPOSTO_LAN", 0) AS valr_imposto,
            COALESCE(s."VALR_VENAL_LAN", 0) AS valr_venal_total
        FROM "SIA_LANCIPTU_ASG" s
        LEFT JOIN tipos t ON s."ISN_SIA_LANCIPTU_ASG" = t."ISN_SIA_LANCIPTU_ASG"
    """)
    
    logging.info("Sincronizando histórico para ClickHouse em lotes...")
    
    try:
        # Limpa dados antigos
        client.command("TRUNCATE TABLE lancamento_iptu.historico_lancamentos_analitico")
        client.command("TRUNCATE TABLE lancamento_iptu.cache_migracao_trava")
        
        # Executa com streaming para não estourar a RAM
        # Precisamos de uma conexão direta para stream_results
        from sqlalchemy import create_engine
        engine = create_engine(db_session.get_bind().url)
        
        with engine.connect().execution_options(stream_results=True) as conn:
            # Busca em lotes de 100.000
            for chunk_df in pd.read_sql(query, conn, chunksize=100000):
                if not chunk_df.empty:
                    # Blindagem final: converter para tipos nativos
                    chunk_df['exercicio'] = chunk_df['exercicio'].apply(lambda x: int(float(x)) if pd.notnull(x) else 0)
                    chunk_df['tipo_lancamento'] = chunk_df['tipo_lancamento'].apply(lambda x: int(float(x)) if pd.notnull(x) else 0)
                    chunk_df['valr_imposto'] = chunk_df['valr_imposto'].apply(lambda x: float(x) if pd.notnull(x) else 0.0)
                    chunk_df['valr_venal_total'] = chunk_df['valr_venal_total'].apply(lambda x: float(x) if pd.notnull(x) else 0.0)
                    chunk_df['faixa_codigo'] = chunk_df['faixa_codigo'].astype(str).replace('None', '0').replace('nan', '0')
                    
                    client.insert_df('historico_lancamentos_analitico', chunk_df, database='lancamento_iptu')
                    logging.info(f"Lote de histórico enviado: {len(chunk_df)} registros.")

        logging.info("Sincronização de histórico concluída.")
    except Exception as e:
        logging.error(f"Erro ao sincronizar histórico: {e}")

def sincronizar_simulacao_para_clickhouse(simulacao_id, db_session):
    """Sincroniza os resultados de uma simulação específica para o ClickHouse."""
    import pandas as pd
    from sqlalchemy import text
    
    client = obter_cliente()
    if not client:
        return

    logging.info(f"Sincronizando simulação {simulacao_id} para ClickHouse...")
    
    # Query que traz os tipos de edificação formatados para a simulação
    query = text("""
        WITH tipos AS (
            SELECT 
                t."ISN_SIA_LANCIPTU_ASG",
                STRING_AGG(
                    CASE t."INFO_TIPO_EDF_LAN"
                        WHEN 1 THEN 'Casa'
                        WHEN 2 THEN 'Apartamento'
                        WHEN 3 THEN 'Barracão'
                        WHEN 4 THEN 'Loja'
                        WHEN 5 THEN 'Sala/Escritório'
                        WHEN 6 THEN 'Galpão Comum'
                        WHEN 7 THEN 'Galpão Industrial'
                        WHEN 8 THEN 'Telheiro'
                        WHEN 9 THEN 'Edificacao em Altura'
                        WHEN 10 THEN 'Especial'
                        WHEN 11 THEN 'Garagem'
                        WHEN 12 THEN 'Condomínio'
                        WHEN 13 THEN 'Escaninho'
                        WHEN 14 THEN 'Sobrado'
                        ELSE 'Não Mapeado'
                    END,
                    ' / '
                    ORDER BY t.cnxarraycolumn
                ) AS tipo_edificacao
            FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" t
            WHERE t."ISN_SIA_LANCIPTU_ASG" IN (
                SELECT DISTINCT s.isn_sia_lanciptu_asg 
                FROM sim_lancamentos s 
                WHERE s.simulacao_id = :sid
            )
            GROUP BY t."ISN_SIA_LANCIPTU_ASG"
        )
        SELECT 
            s.simulacao_id,
            s.codg_exercicio_lan AS exercicio,
            CASE WHEN b."TIPO_IMPOSTO_LAN" = '2' THEN 'Territorial'
                 WHEN b."INFO_USO_LAN" = '1' THEN 'Residencial'
                 ELSE 'Não Residencial' END AS categoria,
            s.faixa_atual AS faixa_codigo,
            COALESCE(f.faixa_label, 'Faixa ' || s.faixa_atual) AS faixa_label,
            COALESCE(s.tipo_lancamento, 0) AS tipo_lancamento,
            COALESCE(t.tipo_edificacao, 'Territorial') AS tipo_edificacao,
            COALESCE(s.valr_imposto_final, 0) AS valr_imposto,
            COALESCE(s.valr_venal_simulado, 0) AS valr_venal_simulado,
            COALESCE(s.valr_imposto_anterior, 0) AS valr_imposto_anterior,
            COALESCE(s.valr_venal_base, 0) AS valr_venal_anterior,
            COALESCE(s.valr_aliquota_simulada, 0) AS valr_aliquota
        FROM sim_lancamentos s
        JOIN "SIA_LANCIPTU_ASG" b ON s.isn_sia_lanciptu_asg = b."ISN_SIA_LANCIPTU_ASG"
        LEFT JOIN tipos t ON s.isn_sia_lanciptu_asg = t."ISN_SIA_LANCIPTU_ASG"
        LEFT JOIN sim_faixas_aliquota f ON (
            f.faixa_codigo = s.faixa_atual AND 
            f.exercicio = s.codg_exercicio_lan AND
            f.simulacao_id = s.simulacao_id
        )
        WHERE s.simulacao_id = :sid
    """)
    
    try:
        # Remove dados anteriores da mesma simulação
        try:
            client.command(f"ALTER TABLE lancamento_iptu.sim_lancamentos_analitico DELETE WHERE simulacao_id = '{simulacao_id}'")
        except:
            pass

        from sqlalchemy import create_engine
        engine = create_engine(db_session.get_bind().url)
        
        with engine.connect().execution_options(stream_results=True) as conn:
            # Busca em lotes de 100.000
            for chunk_df in pd.read_sql(query, conn, chunksize=100000, params={"sid": str(simulacao_id)}):
                if not chunk_df.empty:
                    # Blindagem final
                    chunk_df['exercicio'] = chunk_df['exercicio'].apply(lambda x: int(float(x)) if pd.notnull(x) else 0)
                    chunk_df['tipo_lancamento'] = chunk_df['tipo_lancamento'].apply(lambda x: int(float(x)) if pd.notnull(x) else 0)
                    chunk_df['valr_imposto'] = chunk_df['valr_imposto'].apply(lambda x: float(x) if pd.notnull(x) else 0.0)
                    chunk_df['valr_venal_simulado'] = chunk_df['valr_venal_simulado'].apply(lambda x: float(x) if pd.notnull(x) else 0.0)
                    chunk_df['valr_imposto_anterior'] = chunk_df['valr_imposto_anterior'].apply(lambda x: float(x) if pd.notnull(x) else 0.0)
                    chunk_df['valr_venal_anterior'] = chunk_df['valr_venal_anterior'].apply(lambda x: float(x) if pd.notnull(x) else 0.0)
                    chunk_df['valr_aliquota'] = chunk_df['valr_aliquota'].apply(lambda x: float(x) if pd.notnull(x) else 0.0)
                    chunk_df['simulacao_id'] = chunk_df['simulacao_id'].astype(str)
                    chunk_df['faixa_codigo'] = chunk_df['faixa_codigo'].astype(str).replace('None', '0').replace('nan', '0')
                    
                    client.insert_df('sim_lancamentos_analitico', chunk_df, database='lancamento_iptu')
                    logging.info(f"Lote de simulação {simulacao_id} enviado: {len(chunk_df)} registros.")

        logging.info(f"Simulação {simulacao_id} sincronizada com sucesso.")
    except Exception as e:
        logging.error(f"Erro ao sincronizar simulação {simulacao_id}: {e}")

def sincronizar_todas_simulacoes_para_clickhouse(db_session):
    """Sincroniza todas as simulações existentes no Postgres para o ClickHouse."""
    from sqlalchemy import text
    client = obter_cliente()
    if not client: return

    logging.info("Sincronizando TODAS as simulações para ClickHouse...")
    
    # Busca todos os IDs de simulação que possuem dados
    query_ids = text("SELECT DISTINCT simulacao_id FROM sim_lancamentos")
    try:
        ids = db_session.execute(query_ids).scalars().all()
        logging.info(f"Encontradas {len(ids)} simulações para sincronizar.")
        
        # Limpa dados antigos das simulações
        client.command("TRUNCATE TABLE lancamento_iptu.sim_lancamentos_analitico")
        
        for sid in ids:
            sincronizar_simulacao_para_clickhouse(sid, db_session)
            
        logging.info("Sincronização em massa de simulações concluída.")
    except Exception as e:
        logging.error(f"Erro na sincronização em massa: {e}")

def pre_cachear_simulacao_migracao_trava(simulacao_id, db_session):
    """Calcula a migração e travas da simulação no Postgres e salva no cache do ClickHouse."""
    from sqlalchemy import text
    import pandas as pd
    
    client = obter_cliente()
    if not client:
        return
    try:
        logging.info(f"Gerando cache de migracao_trava para a simulação {simulacao_id}...")
        
        # Limpa cache antigo se existir
        try:
            client.command(f"ALTER TABLE lancamento_iptu.cache_sim_migracao_trava DELETE WHERE simulacao_id = '{simulacao_id}'")
        except Exception as ec:
            pass
        
        # Calcula a agregação da simulação no Postgres
        dados_sim = db_session.execute(text("""
            SELECT codg_exercicio_lan AS exercicio,
                   COUNT(*) FILTER (WHERE NULLIF(REGEXP_REPLACE(faixa_atual, '[^0-9]', '', 'g'), '')::int > NULLIF(REGEXP_REPLACE(faixa_anterior, '[^0-9]', '', 'g'), '')::int) AS subiu_faixa,
                   COUNT(*) FILTER (WHERE NULLIF(REGEXP_REPLACE(faixa_atual, '[^0-9]', '', 'g'), '')::int < NULLIF(REGEXP_REPLACE(faixa_anterior, '[^0-9]', '', 'g'), '')::int) AS desceu_faixa,
                   COUNT(*) FILTER (WHERE valr_iptu_bruto > valr_imposto_final AND tipo_lancamento = 0) AS travado_cap,
                   COUNT(*) FILTER (WHERE valr_iptu_bruto <= valr_imposto_final AND tipo_lancamento = 0) AS abaixo_trava
            FROM sim_lancamentos
            WHERE simulacao_id = :sid
            GROUP BY codg_exercicio_lan
        """), {"sid": str(simulacao_id)}).mappings().all()
        
        if dados_sim:
            df = pd.DataFrame([dict(r) for r in dados_sim])
            df['simulacao_id'] = str(simulacao_id)
            df['exercicio'] = df['exercicio'].apply(lambda x: int(float(x)) if pd.notnull(x) else 0)
            df['subiu_faixa'] = df['subiu_faixa'].apply(lambda x: int(float(x)) if pd.notnull(x) else 0)
            df['desceu_faixa'] = df['desceu_faixa'].apply(lambda x: int(float(x)) if pd.notnull(x) else 0)
            df['travado_cap'] = df['travado_cap'].apply(lambda x: int(float(x)) if pd.notnull(x) else 0)
            df['abaixo_trava'] = df['abaixo_trava'].apply(lambda x: int(float(x)) if pd.notnull(x) else 0)
            
            client.insert_df('cache_sim_migracao_trava', df, database='lancamento_iptu')
            logging.info(f"Pre-cache de migracao_trava concluído para simulação {simulacao_id}.")
    except Exception as e:
        logging.error(f"Erro ao pre-cachear migracao_trava para simulação {simulacao_id}: {e}")
