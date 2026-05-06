from sqlalchemy import inspect, text
from app.db import engine, Base
from app.models import (
    ParametroMacroeconomico, FaixaAliquota, Simulacao, 
    SimLancamento, HistoricoExportacao, ConfiguracaoBase,
    SimulacaoParametroUtilizado
)

def migrar():
    print("Iniciando verificação de schema...")
    inspector = inspect(engine)
    
    # Criar tabelas que não existem
    Base.metadata.create_all(bind=engine)
    
    with engine.connect() as conn:
        # Verificar sim_simulacoes especificamente
        colunas_atuais = [c["name"] for c in inspector.get_columns("sim_simulacoes")]
        
        # Colunas que deveriam existir conforme models.py
        colunas_necessarias = {
            "descricao": "TEXT",
            "exercicio_base": "SMALLINT",
            "exercicio_destino": "SMALLINT",
            "ano_base_faixas": "SMALLINT",
            "cenario": "VARCHAR(10)",
            "aplicar_cap": "BOOLEAN DEFAULT TRUE",
            "total_imoveis": "INTEGER",
            "total_processados": "INTEGER DEFAULT 0",
            "exercicio_atual": "SMALLINT",
            "progresso_json": "JSONB DEFAULT '[]'::jsonb",
            "erro_mensagem": "TEXT"
        }
        
        for col, tipo in colunas_necessarias.items():
            if col not in colunas_atuais:
                print(f"Adicionando coluna {col} em sim_simulacoes...")
                try:
                    conn.execute(text(f"ALTER TABLE sim_simulacoes ADD COLUMN {col} {tipo}"))
                    conn.commit()
                except Exception as e:
                    print(f"Erro ao adicionar {col}: {e}")

        # Corrigir sim_faixas_aliquota se necessário (adicionada recentemente)
        colunas_faixas = [c["name"] for c in inspector.get_columns("sim_faixas_aliquota")]
        if "origem" not in colunas_faixas:
            print("Adicionando coluna origem em sim_faixas_aliquota...")
            conn.execute(text("ALTER TABLE sim_faixas_aliquota ADD COLUMN origem VARCHAR(10) DEFAULT 'MANUAL'"))
            conn.commit()

        # Verificar sim_parametros
        colunas_params = [c["name"] for c in inspector.get_columns("sim_parametros")]
        # Remover colunas obsoletas se existirem (agora usamos ConfiguracaoBase)
        for col in ["valr_minimo_iptu", "limite_venal_social"]:
            if col in colunas_params:
                print(f"Removendo coluna obsoleta {col} de sim_parametros...")
                conn.execute(text(f"ALTER TABLE sim_parametros DROP COLUMN {col}"))
        conn.commit()

        # Verificar sim_simulacoes
        colunas_sim = [c["name"] for c in inspector.get_columns("sim_simulacoes")]
        if "indexador_social" not in colunas_sim:
            conn.execute(text("ALTER TABLE sim_simulacoes ADD COLUMN indexador_social VARCHAR(10) DEFAULT 'SELIC'"))
        if "indexador_minimo" not in colunas_sim:
            conn.execute(text("ALTER TABLE sim_simulacoes ADD COLUMN indexador_minimo VARCHAR(10) DEFAULT 'SELIC'"))
        conn.commit()

        # Verificar sim_lancamentos (onde ocorreu o erro relatado)
        colunas_lancamentos = [c["name"] for c in inspector.get_columns("sim_lancamentos")]
        colunas_nec_lan = {
            "isn_sia_lanciptu_asg": "BIGINT",
            "valr_venal_simulado": "NUMERIC(15, 2)",
            "valr_aliquota_simulada": "NUMERIC(7, 5)",
            "valr_iptu_bruto": "NUMERIC(12, 2)",
            "valr_iptu_cap": "NUMERIC(12, 2)",
            "valr_imposto_final": "NUMERIC(12, 2)",
            "valr_imposto_anterior": "NUMERIC(12, 2)",
            "valr_venal_base": "NUMERIC(15, 2)",
            "tipo_lancamento": "SMALLINT",
            "faixa_anterior": "VARCHAR(20)",
            "faixa_atual": "VARCHAR(20)",
            "migrou_faixa": "BOOLEAN DEFAULT FALSE"
        }

        for col, tipo in colunas_nec_lan.items():
            if col not in colunas_lancamentos:
                print(f"Adicionando coluna {col} em sim_lancamentos...")
                try:
                    conn.execute(text(f"ALTER TABLE sim_lancamentos ADD COLUMN {col} {tipo}"))
                    conn.commit()
                except Exception as e:
                    print(f"Erro ao adicionar {col} em sim_lancamentos: {e}")

        # Garantir que a tabela SIA_LANCIPTU_ASG exista (mesmo que vazia)
        if "SIA_LANCIPTU_ASG" not in inspector.get_table_names():
            print("Criando tabela SIA_LANCIPTU_ASG para evitar erros de leitura...")
            conn.execute(text("""
                CREATE TABLE "SIA_LANCIPTU_ASG" (
                    "ISN_SIA_LANCIPTU_ASG" BIGSERIAL PRIMARY KEY,
                    "CODG_EXERCICIO_LAN" SMALLINT,
                    "TIPO_IMPOSTO_LAN" VARCHAR(1),
                    "INFO_USO_LAN" VARCHAR(1),
                    "VALR_VENAL_LAN" NUMERIC(15, 2),
                    "VALR_IMPOSTO_LAN" NUMERIC(15, 2),
                    "faixa_codigo" VARCHAR(20),
                    "faixa_label" VARCHAR(100)
                )
            """))
            conn.commit()

    print("Migração concluída.")

if __name__ == "__main__":
    migrar()
