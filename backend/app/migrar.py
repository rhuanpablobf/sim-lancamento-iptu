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
            "indexador_social": "VARCHAR(10) DEFAULT 'SELIC'",
            "indexador_minimo": "VARCHAR(10) DEFAULT 'SELIC'",
            "aplicar_cap": "BOOLEAN DEFAULT TRUE",
            "status": "VARCHAR(15) DEFAULT 'PENDENTE'",
            "total_imoveis": "INTEGER",
            "total_processados": "INTEGER DEFAULT 0",
            "exercicio_atual": "SMALLINT",
            "mensagem_status": "VARCHAR(100)",
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

        # Corrigir sim_faixas_aliquota se necessário
        colunas_faixas = [c["name"] for c in inspector.get_columns("sim_faixas_aliquota")]
        colunas_nec_faixas = {
            "origem": "VARCHAR(20) DEFAULT 'MANUAL'",
            "simulacao_id": "UUID REFERENCES sim_simulacoes(id) ON DELETE CASCADE",
            "faixa_codigo": "VARCHAR(20)",
            "faixa_label": "VARCHAR(100)"
        }
        for col, tipo in colunas_nec_faixas.items():
            if col not in colunas_faixas:
                print(f"Adicionando coluna {col} em sim_faixas_aliquota...")
                try:
                    conn.execute(text(f"ALTER TABLE sim_faixas_aliquota ADD COLUMN {col} {tipo}"))
                    conn.commit()
                except Exception as e:
                    print(f"Erro ao adicionar {col} em sim_faixas_aliquota: {e}")
            else:
                # Verificar se o tipo precisa de ajuste (especialmente o tamanho do VARCHAR)
                if col == "origem":
                    print(f"Ajustando tamanho da coluna {col} em sim_faixas_aliquota para VARCHAR(20)...")
                    try:
                        conn.execute(text(f"ALTER TABLE sim_faixas_aliquota ALTER COLUMN {col} TYPE VARCHAR(20)"))
                        conn.commit()
                    except Exception as e:
                        print(f"Erro ao ajustar {col} em sim_faixas_aliquota: {e}")

        # Verificar sim_parametros
        colunas_params = [c["name"] for c in inspector.get_columns("sim_parametros")]
        # Remover colunas obsoletas se existirem (agora usamos ConfiguracaoBase)
        for col in ["valr_minimo_iptu", "limite_venal_social"]:
            if col in colunas_params:
                print(f"Removendo coluna obsoleta {col} de sim_parametros...")
                conn.execute(text(f"ALTER TABLE sim_parametros DROP COLUMN {col}"))
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
            else:
                # Corrigir tipos se necessário (especialmente faixas que eram INTEGER no init.sql)
                if col in ["faixa_anterior", "faixa_atual"]:
                    print(f"Verificando/Corrigindo tipo da coluna {col} em sim_lancamentos para VARCHAR(20)...")
                    try:
                        # Mudança segura de INTEGER para VARCHAR
                        conn.execute(text(f"ALTER TABLE sim_lancamentos ALTER COLUMN {col} TYPE VARCHAR(20)"))
                        conn.commit()
                    except Exception as e:
                        print(f"Erro ao ajustar tipo de {col} em sim_lancamentos: {e}")

        # Garantir que a tabela SIA_LANCIPTU_ASG exista com o schema COMPLETO
        tabelas_atuais = inspector.get_table_names()
        
        # Se a tabela existe mas está incompleta (menos de 20 colunas, por exemplo), vamos recriar
        recriar_principal = False
        if "SIA_LANCIPTU_ASG" in tabelas_atuais:
            cols = [c["name"] for c in inspector.get_columns("SIA_LANCIPTU_ASG")]
            if len(cols) < 15: # Está na versão simplificada
                recriar_principal = True
        else:
            recriar_principal = True

        if recriar_principal:
            print("Criando/Atualizando tabela SIA_LANCIPTU_ASG com schema completo...")
            if "SIA_LANCIPTU_ASG" in tabelas_atuais:
                conn.execute(text('DROP TABLE "SIA_LANCIPTU_ASG" CASCADE'))
            
            conn.execute(text("""
                CREATE TABLE "SIA_LANCIPTU_ASG" (
                    "ISN_SIA_LANCIPTU_ASG" BIGINT PRIMARY KEY,
                    "CODG_INSCRICAO_LAN" NUMERIC(14,0),
                    "CODG_EXERCICIO_LAN" SMALLINT,
                    "NUMR_SEQUENCIA_LAN" SMALLINT,
                    "INFO_STATUS_LAN" SMALLINT,
                    "TIPO_IMPOSTO_LAN" SMALLINT,
                    "TIPO_LANCAMENTO_LAN" SMALLINT,
                    "INFO_POSICAO_FISCAL_LAN" SMALLINT,
                    "INFO_USO_LAN" SMALLINT,
                    "INFO_OCUPACAO_LAN" SMALLINT,
                    "NUMR_CIM_CONTRIBUINTE_LAN" INTEGER,
                    "NOME_CONTRIBUINTE_LAN" VARCHAR(70),
                    "INFO_CPF_CGC_LAN" VARCHAR(14),
                    "NOME_LOGRAD_IMOVEL_LAN" VARCHAR(25),
                    "NUMR_IMOVEL_LAN" VARCHAR(7),
                    "INFO_COMPLEM_IMOVEL_LAN" VARCHAR(15),
                    "CODG_BAIRRO_IMOVEL_LAN" SMALLINT,
                    "VALR_VENAL_LAN" NUMERIC(15,2),
                    "VALR_ALIQUOTA_LAN" NUMERIC(7,5),
                    "VALR_IMPOSTO_LAN" NUMERIC(13,2),
                    "VALR_TOTAL_LAN" NUMERIC(13,2),
                    "QTDE_AREA_TERRENO_LAN" NUMERIC(10,2),
                    "QTDE_AREA_EDIFICADA_LAN" NUMERIC(9,2),
                    "CODG_EDIFICIO_LAN" INTEGER,
                    "NUMR_SUBLOTE_PRINC_LAN" SMALLINT,
                    "CODG_INSCR_ENGLOBADO_LAN" NUMERIC(14,0),
                    "CODG_EXERC_ENGLOBADO_LAN" SMALLINT,
                    "faixa_codigo" VARCHAR(10),
                    "faixa_label" VARCHAR(60),
                    "faixa_ordem" SMALLINT
                )
            """))
            conn.commit()

        # Garantir que a tabela auxiliar exista sem travas de unicidade (para auditoria)
        recriar_auxiliar = False
        if "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" in tabelas_atuais:
            pk_info = inspector.get_pk_constraint("SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN")
            if pk_info and pk_info.get("constrained_columns"):
                recriar_auxiliar = True
        else:
            recriar_auxiliar = True

        if recriar_auxiliar:
            print("Criando/Atualizando tabela auxiliar SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN (Sem PK para auditoria)...")
            if "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" in tabelas_atuais:
                conn.execute(text('DROP TABLE "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN"'))
            
            conn.execute(text("""
                CREATE TABLE "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" (
                    "ISN_SIA_LANCIPTU_ASG" BIGINT,
                    "INFO_TIPO_EDF_LAN_COUNT" SMALLINT,
                    "INFO_TIPO_EDF_LAN" SMALLINT,
                    "cnxarraycolumn" SMALLINT
                )
            """))
            # Criar índice apenas para performance de busca
            conn.execute(text('CREATE INDEX IF NOT EXISTS "idx_isn_aux_auditoria" ON "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" ("ISN_SIA_LANCIPTU_ASG")'))
            conn.commit()


    print("Migração concluída.")

if __name__ == "__main__":
    migrar()
