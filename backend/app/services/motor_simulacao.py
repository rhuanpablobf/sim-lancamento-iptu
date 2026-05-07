"""
Motor de simulação principal — SimLan IPTU.
Usa Pandas + NumPy para processar centenas de milhares de imóveis com vetorização.
"""
import time
import uuid
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import text


# ─── LIMITE IPTU SOCIAL ────────────────────────────────────────────────────────
LIMITE_IPTU_SOCIAL_BASE = 140_000.00   # R$ 140.000 em 2022
IMPOSTO_MINIMO_BASE     = 100.00       # R$ 100,00 em 2022 (Art. 179 CTM)


def _preprocessar_regras_sociais(df: pd.DataFrame):
    """
    Analisa a base para identificar CPFs, contagem de imóveis e casos de Apto+Box.
    Cria as colunas: is_pf, cpf_unico_social e valr_venal_comparacao_social.
    """
    # 1. Identificar PF/PJ (Threshold numérico de 11 dígitos)
    # Como o campo pode vir como float/int, garantimos a conversão
    df["cpf_cnpj_num"] = pd.to_numeric(df["INFO_CPF_CGC_LAN"], errors="coerce").fillna(0).astype(np.int64)
    df["is_pf"] = (df["cpf_cnpj_num"] > 0) & (df["cpf_cnpj_num"] < 100_000_000_000)

    # 2. Identificar Tipos (Apto=2, Box=11, Escaninho=13)
    # Garantimos tratamento de nulos caso o JOIN não encontre correspondência
    df["INFO_TIPO_EDF_LAN"] = pd.to_numeric(df["INFO_TIPO_EDF_LAN"], errors="coerce").fillna(0).astype(np.int64)
    df["is_apto"] = df["INFO_TIPO_EDF_LAN"] == 2
    df["is_box_esc"] = df["INFO_TIPO_EDF_LAN"].isin([11, 13])

    # 3. Contagem total de imóveis por CPF
    # Consideramos apenas o que está na base de cálculo (PF)
    pf_df = df[df["is_pf"]].copy()
    counts = pf_df.groupby("cpf_cnpj_num").size()
    df["total_imoveis_cpf"] = df["cpf_cnpj_num"].map(counts).fillna(0)

    # 4. Caso Especial: Apto + Box/Escaninho no mesmo edifício
    # Agrupamos por CPF e Edifício para encontrar os pares
    g = pf_df.groupby(["cpf_cnpj_num", "CODG_EDIFICIO_LAN"])
    
    # Flag para saber se o registro faz parte de um grupo de 2 com Apto e Box
    count_g = g["ISN_SIA_LANCIPTU_ASG"].transform("count")
    has_apt = g["is_apto"].transform("any")
    has_box = g["is_box_esc"].transform("any")
    
    df["faz_parte_par"] = False
    df.loc[pf_df.index, "faz_parte_par"] = (count_g == 2) & has_apt & has_box

    # 5. Definição de Unicidade
    # É único se (tem 1 imóvel) OU (tem 2 imóveis que formam o par Apto+Box)
    df["cpf_unico_social"] = (df["total_imoveis_cpf"] == 1) | \
                             ((df["total_imoveis_cpf"] == 2) & df["faz_parte_par"])

    # 6. Valor de Comparação
    # Para o par Apto+Box, o valor de comparação é a soma dos dois
    df["valr_venal_social_base"] = df["VALR_VENAL_LAN"]
    
    # Soma dos valores venais para os registros que fazem parte do par
    soma_pares = g["VALR_VENAL_LAN"].transform("sum")
    df.loc[pf_df.index[df.loc[pf_df.index, "faz_parte_par"]], "valr_venal_social_base"] = soma_pares.loc[df.loc[pf_df.index, "faz_parte_par"]]

    return df


def _calcular_limite_iptu_social(parametros: dict, configs_base: dict, exercicio: int, indexador: str = "SELIC") -> float:
    """
    Atualiza o limite do IPTU Social pelo indexador escolhido (SELIC ou IPCA) acumulado desde o ano base.
    """
    cfg = configs_base.get("LIMITE_VENAL_SOCIAL", {"valor": LIMITE_IPTU_SOCIAL_BASE, "ano": 2022})
    limite = float(cfg["valor"])
    ano_base = int(cfg["ano"])
    
    idx_key = indexador.lower() # "selic" ou "ipca"

    for ano in range(ano_base, exercicio):
        valor_idx = parametros.get(ano, {}).get(idx_key, 0.0)
        limite *= (1 + valor_idx / 100.0)
    
    return round(limite, 2)


def _calcular_imposto_minimo(parametros: dict, configs_base: dict, exercicio: int, indexador: str = "SELIC") -> float:
    """
    Atualiza o imposto mínimo pelo indexador escolhido (SELIC ou IPCA) acumulado desde o ano base.
    """
    cfg = configs_base.get("VALOR_MINIMO_IPTU", {"valor": IMPOSTO_MINIMO_BASE, "ano": 2022})
    minimo = float(cfg["valor"])
    ano_base = int(cfg["ano"])

    idx_key = indexador.lower() # "selic" ou "ipca"

    for ano in range(ano_base, exercicio):
        valor_idx = parametros.get(ano, {}).get(idx_key, 0.0)
        minimo *= (1 + valor_idx / 100.0)
        
    return round(minimo, 2)


def _enquadrar_faixas_vetorizado(df: pd.DataFrame, faixas: list, coluna_valor: str, coluna_cat: str) -> pd.DataFrame:
    """
    Enquadra cada imóvel em uma faixa de alíquota de forma vetorizada (rápido).
    """
    # 1. Remover colunas duplicadas por NOME (Garante que df["col"] retorne Series, não DataFrame)
    df = df.loc[:, ~df.columns.duplicated()].copy()
    
    # 2. Remover colunas de resultado anteriores para recriar do zero
    cols_resultado = ["faixa_atual", "faixa_label", "valr_aliquota_calculada"]
    df = df.drop(columns=[c for c in cols_resultado if c in df.columns]).copy()
    
    # 3. Resetar índice para garantir que não existam duplicatas de label
    df = df.reset_index(drop=True)
    
    # 4. Criar colunas de resultado com valores padrão
    df["faixa_atual"] = "NI"
    df["faixa_label"] = "Não Enquadrado"
    df["valr_aliquota_calculada"] = -1.0

    # Converter colunas base para arrays NumPy para evitar erros de broadcasting
    valores_brutos = df[coluna_valor].values.astype(float)
    categorias_brutas = df[coluna_cat].values
    
    for cat in ["RESIDENCIAL", "NAO_RESIDENCIAL", "TERRITORIAL"]:
        mask_cat = (categorias_brutas == cat)
        if not np.any(mask_cat):
            continue
            
        faixas_cat = [f for f in faixas if f["categoria"] == cat]
        faixas_cat.sort(key=lambda x: x["limite_inferior"])

        for faixa in faixas_cat:
            lim_inf = float(faixa["limite_inferior"])
            lim_sup = float(faixa["limite_superior"]) if faixa["limite_superior"] else float('inf')
            
            # Condição de enquadramento usando NumPy puro para máxima performance e segurança de shape
            mask_valor = (valores_brutos >= lim_inf) & (valores_brutos <= lim_sup)
            # Verifica quem ainda está com -1.0 (não enquadrado)
            aliquotas_atuais = df["valr_aliquota_calculada"].values
            mask_enquadrar = mask_cat & mask_valor & (aliquotas_atuais == -1.0)
            
            if np.any(mask_enquadrar):
                df.loc[mask_enquadrar, "faixa_atual"] = str(faixa["faixa_codigo"])
                df.loc[mask_enquadrar, "faixa_label"] = faixa["faixa_label"]
                df.loc[mask_enquadrar, "valr_aliquota_calculada"] = float(faixa["aliquota"])

    # Quem sobrou com -1.0 recebe 0.0 de alíquota
    df.loc[df["valr_aliquota_calculada"] == -1.0, "valr_aliquota_calculada"] = 0.0
    
    return df


def simular_exercicio(
    df_base: pd.DataFrame,
    faixas_base: list[dict],
    faixas_novo: list[dict],
    parametros: dict,
    configs_base: dict,
    ano: int,
    exercicio_base: int,
    indexador_social: str = "SELIC",
    indexador_minimo: str = "SELIC",
    aplicar_cap: bool = True,
) -> tuple[pd.DataFrame, float, float]:
    """
    Processa um exercício completo, aplicando todas as regras do CTM Goiânia.

    Etapas:
    1. Corrige o valor venal pelo IPCA.
    2. Enquadra o imóvel nas novas faixas (já projetadas pela SELIC).
       - Imóveis em construção: faixa TERRITORIAL + teto de 1% (Art. 178 IV).
    3. Calcula o imposto bruto.
    4. Aplica cap de 5% (Art. 168 §6º), se habilitado.
    5. Aplica imposto mínimo (Art. 179).
    6. Verifica IPTU Social (Anexo X, item 14).
    """
    param = parametros.get(ano, {})
    ipca  = param.get("ipca",  0.0) / 100.0
    selic = param.get("selic", 0.0) / 100.0

    df = df_base.copy()
    # Garantia contra colunas duplicadas que impediriam cálculos vetorizados
    df = df.loc[:, ~df.columns.duplicated()].copy()

    # Categoria tributária
    condicoes_cat = [
        df["TIPO_IMPOSTO_LAN"] == 2,    # TERRITORIAL (inclui em construção)
        (df["TIPO_IMPOSTO_LAN"] == 1) & (df["INFO_USO_LAN"] == 1),   # RESIDENCIAL
        (df["TIPO_IMPOSTO_LAN"] == 1) & (df["INFO_USO_LAN"] != 1),   # NÃO RESIDENCIAL
    ]
    escolhas_cat = ["TERRITORIAL", "RESIDENCIAL", "NAO_RESIDENCIAL"]
    df["categoria_tributacao"] = np.select(condicoes_cat, escolhas_cat, default="RESIDENCIAL")

    # Flag em construção (Art. 178 IV)
    df["em_construcao"] = (df["TIPO_IMPOSTO_LAN"] == 2) & (df["INFO_OCUPACAO_LAN"] == 4)

    # ETAPA 1 — Corrigir valor venal pelo IPCA
    df["valr_venal_simulado"] = df["VALR_VENAL_LAN"].astype(float) * (1 + ipca)

    # ETAPA 2 — Enquadrar nas faixas projetadas para o novo exercício
    df = _enquadrar_faixas_vetorizado(df, faixas_novo, "valr_venal_simulado", "categoria_tributacao")

    # Teto de 1% para imóveis em construção (Art. 178, inciso IV)
    df.loc[df["em_construcao"], "valr_aliquota_calculada"] = np.minimum(
        df.loc[df["em_construcao"], "valr_aliquota_calculada"],
        0.01,
    )

    # Registrar faixa anterior (do exercício base)
    df_base_faixas = _enquadrar_faixas_vetorizado(df_base, faixas_base, "VALR_VENAL_LAN", "categoria_tributacao")
    df["faixa_anterior"] = df_base_faixas["faixa_atual"].values

    df["migrou_faixa"] = df["faixa_atual"] != df["faixa_anterior"]

    # ETAPA 3 — Imposto bruto
    df["valr_iptu_bruto"] = df["valr_venal_simulado"] * df["valr_aliquota_calculada"]

    # ETAPA 4 — Cap de 5% (Art. 168 §6º)
    if aplicar_cap and "VALR_IMPOSTO_LAN" in df.columns:
        limite_cap = df["VALR_IMPOSTO_LAN"].astype(float) * 1.05 * (1 + ipca)
        df["valr_iptu_cap"] = np.minimum(df["valr_iptu_bruto"], limite_cap)
    else:
        df["valr_iptu_cap"] = df["valr_iptu_bruto"]

    # ETAPA 5 — Cálculo Inicial (Sem mínimo ainda)
    df["valr_imposto_final"] = df["valr_iptu_cap"]

    # ETAPA 6 — IPTU Social (Regra de Ouro)
    limite_social = _calcular_limite_iptu_social(parametros, configs_base, ano, indexador_social)
    
    # O índice acumulado para fins de IPTU Social deve refletir a correção total desde o ano base original
    # Usamos o valor venal atual (projetado) dividido pelo valor venal original (da base de cálculo)
    # O valor de comparação para o IPTU Social (que pode ser a soma de Apto+Box) 
    # deve ser corrigido pelo IPCA do ano para manter a paridade com o valor venal simulado.
    df["valr_venal_social_simulado"] = df["valr_venal_social_base"].astype(float) * (1 + ipca)
    valr_venal_comparacao_social = df["valr_venal_social_simulado"]

    mask_social = (
        (df["TIPO_IMPOSTO_LAN"] == 1)      # Predial
        & (df["INFO_USO_LAN"] == 1)        # Residencial
        & (df["is_pf"])                    # Pessoa Física
        & (df["cpf_unico_social"])         # Único Imóvel (ou par Apto+Box)
        & (valr_venal_comparacao_social <= limite_social)
    )
    
    # ETAPA 7 — Aplicação Final do Mínimo e Classificação
    minimo = _calcular_imposto_minimo(parametros, configs_base, ano, indexador_minimo)
    
    # Só aplica o mínimo se:
    # 1. NÃO for IPTU Social
    # 2. O imposto bruto for maior que zero (para não tributar isentos de origem)
    mask_aplicar_minimo = (~mask_social) & (df["valr_iptu_bruto"] > 0) & (df["valr_imposto_final"] < minimo)
    df.loc[mask_aplicar_minimo, "valr_imposto_final"] = minimo
    
    # Zera imposto para Social
    df.loc[mask_social, "valr_imposto_final"] = 0.0

    # Classificação final do tipo de lançamento
    df["tipo_lancamento"] = 0 # Normal
    df.loc[df["valr_imposto_final"] == 0.0, "tipo_lancamento"] = 1 # Isento
    df.loc[mask_social, "tipo_lancamento"] = 3 # IPTU Social
    df.loc[mask_aplicar_minimo, "tipo_lancamento"] = 2 # Imposto Mínimo

    df["codg_exercicio_lan"] = ano
    # Garantir índice limpo no retorno
    return df.reset_index(drop=True), float(minimo), float(limite_social)


def executar_motor_completo(
    simulacao_id: str,
    db: Session,
    exercicio_base: int,
    exercicio_destino: int,
    faixas_por_ano: dict,
    parametros: dict,
    configs_base: dict,
    indexador_social: str = "SELIC",
    indexador_minimo: str = "SELIC",
    aplicar_cap: bool = True,
    atualizar_progresso: callable = None,
) -> None:
    """
    Ponto de entrada do motor. Processa todos os exercícios sequencialmente.
    """
    inicio_total = time.time()

    # Carregar base de imóveis do exercício base com o tipo de edificação (tabela auxiliar)
    df_base = pd.read_sql(
        f"""
        SELECT t1.*, t2."INFO_TIPO_EDF_LAN"
        FROM "SIA_LANCIPTU_ASG" t1
        LEFT JOIN (
            SELECT "ISN_SIA_LANCIPTU_ASG", MIN("INFO_TIPO_EDF_LAN") as "INFO_TIPO_EDF_LAN"
            FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN"
            GROUP BY "ISN_SIA_LANCIPTU_ASG"
        ) t2 ON t1."ISN_SIA_LANCIPTU_ASG" = t2."ISN_SIA_LANCIPTU_ASG"
        WHERE t1."CODG_EXERCICIO_LAN" = {exercicio_base}
          AND (t1."INFO_STATUS_LAN" IS NULL OR t1."INFO_STATUS_LAN" = '1')
        """,
        db.bind,
    )

    if df_base.empty:
        raise ValueError(f"Nenhum imóvel encontrado para o exercício base {exercicio_base}.")

    # Garantir que colunas da base externa estejam em CAIXA ALTA para consistência
    df_base.columns = [c.upper() for c in df_base.columns]
    
    # Remover colunas duplicadas que podem ter surgido do JOIN ou do banco
    df_base = df_base.loc[:, ~df_base.columns.duplicated()].copy()

    # IMPORTANTE: Resetar o índice para evitar o erro "cannot reindex on an axis with duplicate labels"
    # Isso garante que cada linha tenha um índice único e sequencial (0, 1, 2...)
    df_base = df_base.reset_index(drop=True)

    total_imoveis = len(df_base)
    atualizar_progresso(total_imoveis=total_imoveis, status="PROCESSANDO")

    # Pré-processamento das Regras Sociais (Unicidade e CPF/CNPJ)
    df_base = _preprocessar_regras_sociais(df_base)

    # Preparar categoria no df_base
    condicoes_cat = [
        df_base["TIPO_IMPOSTO_LAN"] == 2,
        (df_base["TIPO_IMPOSTO_LAN"] == 1) & (df_base["INFO_USO_LAN"] == 1),
        (df_base["TIPO_IMPOSTO_LAN"] == 1) & (df_base["INFO_USO_LAN"] != 1),
    ]
    escolhas_cat = ["TERRITORIAL", "RESIDENCIAL", "NAO_RESIDENCIAL"]
    df_base["categoria_tributacao"] = np.select(condicoes_cat, escolhas_cat, default="RESIDENCIAL")

    faixas_base = faixas_por_ano.get(exercicio_base, faixas_por_ano.get(min(faixas_por_ano.keys()), []))
    exercicios_concluidos = []

    for ano in range(exercicio_base + 1, exercicio_destino + 1):
        inicio_ano = time.time()
        faixas_novo = faixas_por_ano.get(ano, [])

        atualizar_progresso(exercicio_atual=ano)

        df_resultado, valr_minimo, limite_social = simular_exercicio(
            df_base=df_base,
            faixas_base=faixas_base,
            faixas_novo=faixas_novo,
            parametros=parametros,
            configs_base=configs_base,
            ano=ano,
            exercicio_base=exercicio_base,
            indexador_social=indexador_social,
            indexador_minimo=indexador_minimo,
            aplicar_cap=aplicar_cap,
        )

        # Salvar parâmetros utilizados para auditoria
        from app.models import Simulacao, SimulacaoParametroUtilizado
        sim_obj = db.query(Simulacao).filter(Simulacao.id == uuid.UUID(simulacao_id)).first()
        
        param_audit = SimulacaoParametroUtilizado(
            simulacao_id=uuid.UUID(simulacao_id),
            exercicio=ano,
            valr_minimo_iptu=valr_minimo,
            limite_venal_social=limite_social,
            ipca_ano=parametros.get(ano, {}).get("ipca", 0),
            selic_ano=parametros.get(ano, {}).get("selic", 0),
            tipo_indice_social=indexador_social,
            tipo_indice_minimo=indexador_minimo,
            tipo_indice_faixa=sim_obj.cenario if sim_obj else "SELIC",
            indice_aplicado=parametros.get(ano, {}).get(indexador_minimo.lower(), 0), # Compatibilidade
            tipo_indice=indexador_minimo # Compatibilidade
        )
        db.add(param_audit)
        db.commit()

        # Preparar registros para inserção em lote
        colunas = [
            "ISN_SIA_LANCIPTU_ASG", "CODG_INSCRICAO_LAN", "codg_exercicio_lan",
            "valr_venal_simulado", "valr_aliquota_calculada",
            "valr_iptu_bruto", "valr_iptu_cap", "valr_imposto_final",
            "tipo_lancamento", "faixa_anterior", "faixa_atual", "migrou_faixa",
            "VALR_IMPOSTO_LAN", "VALR_VENAL_LAN"
        ]
        colunas_existentes = [c for c in colunas if c in df_resultado.columns]
        df_insert = df_resultado[colunas_existentes].rename(
            columns={
                "ISN_SIA_LANCIPTU_ASG": "isn_sia_lanciptu_asg",
                "CODG_INSCRICAO_LAN": "codg_inscricao_lan",
                "valr_aliquota_calculada": "valr_aliquota_simulada",
                "VALR_IMPOSTO_LAN": "valr_imposto_anterior",
                "VALR_VENAL_LAN": "valr_venal_base"
            }
        )
        df_insert["simulacao_id"] = simulacao_id

        # Atualizar progresso parcial (Cálculo concluído, iniciando salvamento)
        atualizar_progresso(
            total_processados=(ano - exercicio_base - 0.5) * total_imoveis,
        )

        # Salvamento otimizado para PostgreSQL
        print(f"[{ano}] Salvando {len(df_insert)} registros no banco...")
        
        # Função auxiliar para inserção rápida
        from sqlalchemy import text
        def psql_insert_copy(table, conn, keys, data_iter):
            import csv
            from io import StringIO
            
            # Preparar buffer em memória
            s_buf = StringIO()
            writer = csv.writer(s_buf)
            writer.writerows(data_iter)
            s_buf.seek(0)
            
            columns = ', '.join([f'"{k}"' for k in keys])
            table_name = table.name
            if table.schema:
                table_name = f'"{table.schema}"."{table_name}"'
            else:
                table_name = f'"{table_name}"'
                
            sql = f'COPY {table_name} ({columns}) FROM STDIN WITH CSV'
            
            dbapi_conn = conn.connection
            with dbapi_conn.cursor() as cur:
                cur.copy_expert(sql=sql, file=s_buf)

        # Usar o método de cópia rápida
        df_insert.to_sql(
            "sim_lancamentos",
            db.bind,
            if_exists="append",
            index=False,
            method=psql_insert_copy
        )

        tempo_ano = round(time.time() - inicio_ano, 1)
        concluido = {
            "exercicio": ano,
            "total": total_imoveis,
            "iptu_social": int((df_resultado["tipo_lancamento"] == 3).sum()),
            "imposto_minimo": int((df_resultado["tipo_lancamento"] == 2).sum()),
            "tempo_segundos": tempo_ano,
        }
        exercicios_concluidos.append(concluido)
        atualizar_progresso(
            exercicios_concluidos=exercicios_concluidos,
            total_processados=(ano - exercicio_base) * total_imoveis,
        )

        # Próximo ano usa o resultado como base
        # IMPORTANTÍSSIMO: Dropamos as colunas originais antes do rename para evitar duplicidade
        # e garantir que o '~duplicated()' mantenha o valor atualizado e não o antigo.
        cols_base_antigas = ["VALR_VENAL_LAN", "VALR_IMPOSTO_LAN"]
        df_base_next = df_resultado.drop(columns=[c for c in cols_base_antigas if c in df_resultado.columns])
        
        df_base = df_base_next.rename(
            columns={
                "valr_venal_simulado": "VALR_VENAL_LAN",
                "valr_imposto_final": "VALR_IMPOSTO_LAN",
                "valr_venal_social_simulado": "valr_venal_social_base"
            }
        ).reset_index(drop=True)
        
        # Limpar colunas de cálculo do ano anterior para não duplicar no próximo
        cols_limpar = ["faixa_atual", "faixa_label", "valr_aliquota_calculada", "faixa_anterior", "migrou_faixa", "valr_venal_social_simulado"]
        df_base = df_base.drop(columns=[c for c in cols_limpar if c in df_base.columns])
        # Remover duplicatas por nome (segurança extra, agora o valor atualizado será o único)
        df_base = df_base.loc[:, ~df_base.columns.duplicated()]
        
        faixas_base = faixas_novo

    atualizar_progresso(status="CONCLUIDO", exercicios_concluidos=exercicios_concluidos)
