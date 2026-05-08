# PRD — Sistema de Simulação de Lançamento IPTU

**Produto:** SimLan IPTU — Simulador de Lançamentos Futuros do IPTU Municipal
**Base legal:** Lei Complementar nº 344/2021 (CTM Goiânia) e LC nº 362/2022
**Fonte de dados:** Tabela `SIA_LANCIPTU_ASG` e tabela auxiliar `SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN`
**Versão:** 1.1 — Maio/2026

---

## Histórico de versões

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | Mai/2026 | Versão inicial |
| 1.1 | Mai/2026 | Atualização da fonte de dados: nomes reais das tabelas e campos do SQL Server (SEFIN); correção da lógica do `INFO_STATUS_LAN`; remoção de FK da tabela auxiliar; campos reduzidos aos necessários |

---

## 1. Objetivo

Construir um sistema que, a partir dos dados reais dos últimos exercícios fiscais de lançamento do IPTU, seja capaz de:

1. **Simular lançamentos futuros** com projeção de valor venal (via IPCA) e atualização dos limites de faixa de alíquota (via SELIC ou IPCA, conforme cenário escolhido).
2. **Identificar migração de faixas** de alíquota entre exercícios, tanto historicamente quanto nas projeções.
3. **Calcular e classificar isenções** de IPTU Social (Anexo X, item 14 do CTM) automaticamente por CPF.
4. **Aplicar o imposto mínimo** (Art. 179 do CTM) quando o valor calculado for inferior ao limite vigente.
5. **Aplicar o limite de acréscimo anual** do imposto (Art. 168, §§ 5º e 6º do CTM).
6. **Permitir o cadastro de faixas de alíquota** para um ano-base e projetá-las para anos seguintes com o indexador escolhido.
7. **Gerar relatórios e dashboards** de análise fiscal com visão histórica e projetada.

---

## 2. Escopo e não-escopo

**Em escopo:**

- Importação dos dados de lançamento (`SIA_LANCIPTU_ASG`) via CSV exportado do SQL Server (SEFIN)
- Motor de simulação de exercícios futuros com parâmetros de IPCA e SELIC configuráveis
- Módulo de IPTU Social com verificação por CPF e tratamento do caso apartamento + box/escaninho
- Módulo de imposto mínimo com atualização do valor mínimo pela SELIC
- Módulo de limite de acréscimo anual (cap de 5% acima da reposição inflacionária — Art. 168 §6º)
- Dashboard analítico: migração de faixas, evolução da base, crescimento de IPTU Social
- Cadastro e gestão de tabelas de faixas de alíquota por exercício
- Exportação dos lançamentos simulados em CSV/XLSX

**Fora de escopo (v1.0):**

- Recálculo do valor venal a partir dos fatores da Planta de Valores (terreno × m² × fatores de correção)
- IPTU Progressivo no Tempo (Art. 194 — função social)
- Geração de COSIP
- Integração direta com o sistema legado SIA via API
- Portal do contribuinte / notificação

---

## 3. Usuários-alvo

| Perfil | Necessidade principal |
|---|---|
| Analista tributário | Projetar receita futura e analisar migração de faixas |
| Gestor de arrecadação | Estimar impacto de mudanças nas faixas e indexadores |
| Auditor fiscal | Validar isenções de IPTU Social por CPF |
| TI / DBA municipal | Importar dados e configurar parâmetros anuais |

---

## 4. Fonte de dados

### 4.1 Origem

Os dados são extraídos do SQL Server do sistema SIA, schema `SEFIN.dbo`, exportados em CSV com separador `;` e encoding UTF-8, e carregados no PostgreSQL local (banco `lancamento-iptu`).

**SQL de extração (SQL Server):**

```sql
SELECT
    l.ISN_SIA_LANCIPTU_ASG,
    l.CODG_INSCRICAO_LAN,
    l.CODG_EXERCICIO_LAN,
    l.NUMR_SEQUENCIA_LAN,
    l.INFO_STATUS_LAN,
    l.TIPO_IMPOSTO_LAN,
    l.TIPO_LANCAMENTO_LAN,
    l.INFO_POSICAO_FISCAL_LAN,
    l.INFO_USO_LAN,
    l.INFO_OCUPACAO_LAN,
    l.NUMR_CIM_CONTRIBUINTE_LAN,
    l.NOME_CONTRIBUINTE_LAN,
    l.INFO_CPF_CGC_LAN,
    l.NOME_LOGRAD_IMOVEL_LAN,
    l.NUMR_IMOVEL_LAN,
    l.INFO_COMPLEM_IMOVEL_LAN,
    l.CODG_BAIRRO_IMOVEL_LAN,
    l.VALR_VENAL_LAN,
    l.VALR_ALIQUOTA_LAN,
    l.VALR_IMPOSTO_LAN,
    l.VALR_TOTAL_LAN,
    l.QTDE_AREA_TERRENO_LAN,
    l.QTDE_AREA_EDIFICADA_LAN,
    l.CODG_EDIFICIO_LAN,
    l.NUMR_SUBLOTE_PRINC_LAN,
    l.CODG_INSCR_ENGLOBADO_LAN,
    l.CODG_EXERC_ENGLOBADO_LAN
FROM SEFIN.dbo.SIA_LANCIPTU_ASG l
WHERE l.CODG_EXERCICIO_LAN IN (2020, 2021, 2022, 2023, 2024, 2025, 2026)
AND (l.INFO_STATUS_LAN IS NULL OR l.INFO_STATUS_LAN = 1)
```

### 4.2 Tabela principal — `SIA_LANCIPTU_ASG`

> Nomes das colunas em maiúsculo conforme CSV exportado do SQL Server.
> No PostgreSQL as tabelas são criadas com nomes entre aspas duplas para preservar o case.

| Campo | Tipo PostgreSQL | Descrição |
|---|---|---|
| `ISN_SIA_LANCIPTU_ASG` | BIGINT PK | Chave surrogate — ligação com tabelas auxiliares |
| `CODG_INSCRICAO_LAN` | NUMERIC(14,0) | Inscrição cadastral do imóvel |
| `CODG_EXERCICIO_LAN` | SMALLINT | Ano do exercício fiscal |
| `NUMR_SEQUENCIA_LAN` | SMALLINT | Sequência do lançamento; `0` = original |
| `INFO_STATUS_LAN` | SMALLINT | `NULL` ou `1` = Ativo; `2` = Inativo |
| `TIPO_IMPOSTO_LAN` | SMALLINT | `1` = Predial; `2` = Territorial |
| `TIPO_LANCAMENTO_LAN` | SMALLINT | `0` = Normal; `1` = Isento; `2` = Mínimo; `3` = IPTU Social; `4` = Imunidade |
| `INFO_POSICAO_FISCAL_LAN` | SMALLINT | `0` (ou NULL) = Normal; `1` = Imunidade; `2` a `5` = Isenções Diversas |
| `INFO_USO_LAN` | SMALLINT | `1` = Residencial; `2` = Ativ.Econômica; `3` = Religioso; `4` = Ativ.Pública; `5` = Agro-Pastoril |
| `INFO_OCUPACAO_LAN` | SMALLINT | `1` = Edificado; `2` = Vago; `3` = Temp.; `4` = Em Construção; `5` = Paralisada; `6` = Demolição; `7` = Ruínas; `8` = Praça |
| `NUMR_CIM_CONTRIBUINTE_LAN` | INTEGER | Matrícula do contribuinte no CIM |
| `NOME_CONTRIBUINTE_LAN` | VARCHAR(70) | Nome do contribuinte |
| `INFO_CPF_CGC_LAN` | VARCHAR(14) | CPF (11 dígitos) ou CNPJ (14 dígitos) |
| `NOME_LOGRAD_IMOVEL_LAN` | VARCHAR(25) | Nome do logradouro |
| `NUMR_IMOVEL_LAN` | VARCHAR(7) | Número do imóvel |
| `INFO_COMPLEM_IMOVEL_LAN` | VARCHAR(15) | Complemento do endereço |
| `CODG_BAIRRO_IMOVEL_LAN` | SMALLINT | Código do bairro |
| `VALR_VENAL_LAN` | NUMERIC(15,2) | Valor venal usado no cálculo do tributo |
| `VALR_ALIQUOTA_LAN` | NUMERIC(7,5) | Alíquota aplicada |
| `VALR_IMPOSTO_LAN` | NUMERIC(13,2) | Valor do imposto calculado |
| `VALR_TOTAL_LAN` | NUMERIC(13,2) | Valor total do tributo |
| `QTDE_AREA_TERRENO_LAN` | NUMERIC(10,2) | Área do terreno (m²) |
| `QTDE_AREA_EDIFICADA_LAN` | NUMERIC(9,2) | Área edificada (m²) |
| `CODG_EDIFICIO_LAN` | INTEGER | Código do edifício/condomínio — usado para agrupar apt + box |
| `NUMR_SUBLOTE_PRINC_LAN` | SMALLINT | Número do sublote principal (imóvel englobado) |
| `CODG_INSCR_ENGLOBADO_LAN` | NUMERIC(14,0) | Inscrição da unidade englobada |
| `CODG_EXERC_ENGLOBADO_LAN` | SMALLINT | Exercício da inscrição englobada |

### 4.3 Tabela auxiliar — `SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN`

Armazena os tipos de edificação de cada lançamento. Um lançamento pode ter até 2 ocorrências (ex.: apartamento + garagem).

| Campo | Tipo PostgreSQL | Descrição |
|---|---|---|
| `ISN_SIA_LANCIPTU_ASG` | BIGINT | Chave de ligação com a tabela principal |
| `INFO_TIPO_EDF_LAN_COUNT` | SMALLINT | Total de ocorrências para este lançamento |
| `INFO_TIPO_EDF_LAN` | SMALLINT | `1`=Casa/Sobrado; `2`=Apartamento; `3`=Barracão; `4`=Loja; `5`=Sala/Escritório; `6`=Galpão Comum; `7`=Galpão Industrial; `8`=Telheiro; `9`=Edif.em Altura; `10`=Especial; `11`=Garagem; `12`=Condomínio; `13`=Escaninho; `14`=Sobrado |
| `cnxarraycolumn` | SMALLINT | Número da ocorrência: `0` = principal; `1` = secundária |

> **Observação:** a FK entre a auxiliar e a tabela principal foi removida pois a tabela auxiliar contém registros de todos os exercícios históricos, enquanto a principal é filtrada por exercício. A integridade é garantida pela aplicação.

### 4.4 Filtro de lançamentos ativos

```
INFO_STATUS_LAN IS NULL OR INFO_STATUS_LAN = 1
```

> **Atenção:** no lançamento a lógica é diferente do cadastro. `NULL` significa ativo. `2` significa inativo. O valor `1` explícito também representa ativo.

---

## 5. Passo a passo detalhado do cálculo do IPTU

Esta seção documenta a lógica completa do motor de simulação, artigo por artigo do CTM.

### 5.1 Etapa 1 — Determinar o valor venal do exercício simulado

Na simulação, **não** recalculamos a Planta de Valores. Partimos do `VALR_VENAL_LAN` do último exercício real disponível e aplicamos a correção:

```
ValorVenal(ano) = VALR_VENAL_LAN(último exercício real) × ∏ IPCA(ano_i)
```

Onde `∏ IPCA(ano_i)` é o produto acumulado do IPCA de cada ano entre o último exercício real e o ano simulado.

> **Base legal:** Art. 168 §2º — os valores de referência do m² das edificações são atualizados pelo IPCA (IBGE). Art. 382 — o terreno é apurado pela Lei nº 9.704/2015 atualizada pelo IPCA.

**Regra de limite de acréscimo (Art. 168 §6º — a partir de 2026):**

```
IPTU_calculado = ValorVenal × Alíquota
IPTU_maximo_permitido = IPTU_exercicio_anterior × 1,05 × (1 + IPCA_do_ano)
IPTU_final = MIN(IPTU_calculado, IPTU_maximo_permitido)
```

> **Exceção (Art. 168 §8º e §9º):** Imóveis incluídos no cadastro a partir de 01/01/2021 ou que sofreram alterações cadastrais não têm o cap aplicado.

### 5.2 Etapa 2 — Enquadramento do imóvel

#### 2.1 — Verificar a posição fiscal

```
SE INFO_POSICAO_FISCAL_LAN = 0 OU NULL → NORMAL (TIPO 0) → prossegue para o cálculo
SE INFO_POSICAO_FISCAL_LAN = 1        → IMUNIDADE (TIPO 4) → imposto = 0
SE INFO_POSICAO_FISCAL_LAN >= 2       → ISENTO (TIPO 1)    → imposto = 0
```

#### 2.2 — Determinar o tipo de tributação

```
SE TIPO_IMPOSTO_LAN = 2 → TERRITORIAL → faixa III do Art. 178
    SE INFO_OCUPACAO_LAN = 4 (Em construção com Alvará válido) →
        Entra na faixa III (territorial) pelo valor venal
        Alíquota encontrada na faixa é aplicada normalmente
        MAS: se alíquota encontrada > 1,00% → aplicar teto de 1,00% (Art. 178, inciso IV)
SE TIPO_IMPOSTO_LAN = 1 → PREDIAL →
    SE INFO_USO_LAN = 1 → RESIDENCIAL → faixa I do Art. 178
    SE INFO_USO_LAN ≠ 1 → NÃO RESIDENCIAL → faixa II do Art. 178
```

> **Base legal:** Art. 178, inciso IV — o imóvel em construção é territorial por natureza, competindo pelas faixas do inciso III. O inciso IV garante que a alíquota não ultrapasse 1%, funcionando como **teto**, não como faixa separada.
>
> **Exemplo:** terreno com valor venal R$ 350.000 em construção com alvará → faixa III enquadra em 2,50% → teto de 1,00% → alíquota final = 1,00%.

#### 2.3 — Tipo de edificação via tabela auxiliar

O tipo de edificação é obtido cruzando `ISN_SIA_LANCIPTU_ASG` com a tabela `SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN`:

```sql
SELECT INFO_TIPO_EDF_LAN
FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN"
WHERE "ISN_SIA_LANCIPTU_ASG" = :isn
ORDER BY cnxarraycolumn  -- 0 = principal, 1 = secundário
```

Usado para identificar apartamentos (tipo `2`), garagens (tipo `11`) e escaninhos (tipo `13`) no agrupamento do IPTU Social.

### 5.3 Etapa 3 — Enquadrar na faixa de alíquota

Os **limites das faixas** são atualizados anualmente pela **SELIC** (Art. 178 §4º c/c Art. 381):

```
Limite_faixa(ano) = Limite_faixa(ano_base) × ∏ SELIC(ano_i)
Alíquota = primeira faixa cuja Limite_superior(ano) ≥ ValorVenal(ano)
IPTU_bruto = ValorVenal(ano) × Alíquota
```

### 5.4 Etapa 4 — Verificar IPTU Social (Anexo X, item 14)

**Condições (todas devem ser verdadeiras):**

1. Imóvel edificado de uso residencial (`TIPO_IMPOSTO_LAN = 1` e `INFO_USO_LAN = 1`)
2. Contribuinte é pessoa física (CPF com 11 dígitos em `INFO_CPF_CGC_LAN`)
3. É o único imóvel do CPF no cadastro (ver regra de agrupamento apt+box abaixo)
4. Valor venal ≤ limite vigente do IPTU Social no exercício

**Limite do IPTU Social:**

```
Limite(ano) = R$ 140.000,00 × ∏ SELIC(ano_i, de 2022 até ano-1)
```

**Agrupamento apt + box/escaninho:**

```
1. Carregar todas as inscrições do CPF no exercício base
2. Para inscrições com mesmo CODG_EDIFICIO_LAN:
   - 1 apartamento (tipo 2) + N garagens (tipo 11) ou escaninhos (tipo 13)
   - Contar como 1 imóvel único
   - Somar os VALR_VENAL_LAN de todas as inscrições do grupo
3. Se CPF tem apenas 1 unidade (ou 1 grupo apt+box):
   SE valor venal total ≤ Limite(ano) → IPTU Social (tipo 3, imposto = 0)
```

### 5.5 Etapa 5 — Aplicar imposto mínimo (Art. 179)

```
Minimo(ano) = R$ 100,00 × ∏ SELIC(ano_i, de 2022 até ano-1)
SE IPTU_final < Minimo(ano) → TIPO_LANCAMENTO_LAN = 2, imposto = Minimo(ano)
SENÃO → TIPO_LANCAMENTO_LAN = 0, imposto = IPTU_final
```

---

## 6. Motor de simulação — regras de projeção

### 6.1 Parâmetros de entrada

| Parâmetro | Descrição |
|---|---|
| `exercicio_base` | Último exercício real disponível |
| `exercicio_destino` | Até qual ano gerar a simulação |
| `ipca_anual[]` | IPCA por ano projetado (array ou taxa única) |
| `selic_anual[]` | SELIC por ano projetado (array ou taxa única) |
| `cenario_faixa` | `SELIC` = faixas corrigidas pela SELIC; `IPCA` = faixas corrigidas pelo IPCA |
| `ano_base_faixas` | Ano de referência das faixas cadastradas |
| `aplicar_cap_5pct` | Booleano — aplicar limite de acréscimo de 5% (Art. 168 §6º) |

### 6.2 Cenários de atualização das faixas

**Cenário A (padrão legal):** faixas corrigidas pela SELIC, valor venal pelo IPCA.

- IPCA > SELIC → pressão ascendente de faixa.
- SELIC > IPCA → estabilização ou descida de faixa.

**Cenário B (alternativo):** faixas corrigidas pelo IPCA, valor venal pelo IPCA.

- Neutralidade de migração — útil para simular congelamento real das faixas.

---

## 7. Gestão de faixas de alíquota

### 7.1 Cadastro

O usuário cadastra as faixas para um ano-base (ex.: 2027, já com valores atualizados pela SELIC) e o sistema projeta automaticamente para os anos seguintes.

### 7.2 Projeção

```
PARA CADA ano APÓS ano_base:
    limite_inferior(ano) = limite_inferior(ano-1) × (1 + índice_do_ano)
    limite_superior(ano) = limite_superior(ano-1) × (1 + índice_do_ano)
    aliquota permanece igual
```

---

## 8. Banco de dados — esquema PostgreSQL

### 8.1 Tabelas de dados históricos (origem SIA)

> Nomes em maiúsculo entre aspas duplas para preservar o case do CSV original.

```sql
-- Tabela principal
CREATE TABLE "SIA_LANCIPTU_ASG" (
    "ISN_SIA_LANCIPTU_ASG"      BIGINT          NOT NULL,
    "CODG_INSCRICAO_LAN"        NUMERIC(14,0),
    "CODG_EXERCICIO_LAN"        SMALLINT,
    "NUMR_SEQUENCIA_LAN"        SMALLINT,
    "INFO_STATUS_LAN"           SMALLINT,       -- NULL ou 1=Ativo | 2=Inativo
    "TIPO_IMPOSTO_LAN"          SMALLINT,
    "TIPO_LANCAMENTO_LAN"       SMALLINT,
    "INFO_POSICAO_FISCAL_LAN"   SMALLINT,
    "INFO_USO_LAN"              SMALLINT,
    "INFO_OCUPACAO_LAN"         SMALLINT,
    "NUMR_CIM_CONTRIBUINTE_LAN" INTEGER,
    "NOME_CONTRIBUINTE_LAN"     VARCHAR(70),
    "INFO_CPF_CGC_LAN"          VARCHAR(14),
    "NOME_LOGRAD_IMOVEL_LAN"    VARCHAR(25),
    "NUMR_IMOVEL_LAN"           VARCHAR(7),
    "INFO_COMPLEM_IMOVEL_LAN"   VARCHAR(15),
    "CODG_BAIRRO_IMOVEL_LAN"    SMALLINT,
    "VALR_VENAL_LAN"            NUMERIC(15,2),
    "VALR_ALIQUOTA_LAN"         NUMERIC(7,5),
    "VALR_IMPOSTO_LAN"          NUMERIC(13,2),
    "VALR_TOTAL_LAN"            NUMERIC(13,2),
    "QTDE_AREA_TERRENO_LAN"     NUMERIC(10,2),
    "QTDE_AREA_EDIFICADA_LAN"   NUMERIC(9,2),
    "CODG_EDIFICIO_LAN"         INTEGER,
    "NUMR_SUBLOTE_PRINC_LAN"    SMALLINT,
    "CODG_INSCR_ENGLOBADO_LAN"  NUMERIC(14,0),
    "CODG_EXERC_ENGLOBADO_LAN"  SMALLINT,
    CONSTRAINT pk_sia_lanciptu_asg PRIMARY KEY ("ISN_SIA_LANCIPTU_ASG")
);

-- Tabela auxiliar de tipo de edificação
-- FK removida: auxiliar contém todos os exercícios históricos
CREATE TABLE "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" (
    "ISN_SIA_LANCIPTU_ASG"    BIGINT    NOT NULL,
    "INFO_TIPO_EDF_LAN_COUNT" SMALLINT,
    "INFO_TIPO_EDF_LAN"       SMALLINT  NOT NULL,
    "cnxarraycolumn"          SMALLINT  NOT NULL,  -- 0=principal, 1=secundário
    CONSTRAINT pk_tipo_edf PRIMARY KEY ("ISN_SIA_LANCIPTU_ASG", "cnxarraycolumn")
);
```

### 8.2 Tabelas do simulador

```sql
CREATE TABLE sim_parametros_anuais (
    exercicio        SMALLINT     PRIMARY KEY,
    ipca_acumulado   NUMERIC(8,6) NOT NULL,
    selic_acumulado  NUMERIC(8,6) NOT NULL,
    obs              TEXT,
    criado_em        TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE sim_faixas_aliquota (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    exercicio        SMALLINT     NOT NULL,
    categoria        VARCHAR(20)  NOT NULL
                         CHECK (categoria IN ('RESIDENCIAL','NAO_RESIDENCIAL','TERRITORIAL')),  -- EM_CONSTRUCAO não existe: usa faixa TERRITORIAL com teto de 1% (Art. 178 IV)
    limite_inferior  NUMERIC(15,2) NOT NULL DEFAULT 0,
    limite_superior  NUMERIC(15,2),
    aliquota         NUMERIC(7,5) NOT NULL,
    origem           VARCHAR(20)  NOT NULL DEFAULT 'MANUAL'
                         CHECK (origem IN ('MANUAL','PROJETADO_SELIC','PROJETADO_IPCA')),
    criado_em        TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE sim_simulacoes (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nome              VARCHAR(100) NOT NULL,
    exercicio_base    SMALLINT    NOT NULL,
    exercicio_destino SMALLINT    NOT NULL,
    cenario_faixa     VARCHAR(10) NOT NULL CHECK (cenario_faixa IN ('SELIC','IPCA')),
    ano_base_faixas   SMALLINT    NOT NULL,
    aplicar_cap_5pct  BOOLEAN     NOT NULL DEFAULT TRUE,
    parametros_json   JSONB,
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
                          CHECK (status IN ('PENDENTE','PROCESSANDO','CONCLUIDO','ERRO')),
    total_imoveis     INTEGER,
    total_processados INTEGER,
    erro_msg          TEXT,
    criado_em         TIMESTAMP   DEFAULT NOW(),
    concluido_em      TIMESTAMP
);

CREATE TABLE sim_lancamentos (
    id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    simulacao_id            UUID          NOT NULL REFERENCES sim_simulacoes(id) ON DELETE CASCADE,
    isn_sia_lanciptu_asg    BIGINT        NOT NULL,
    codg_inscricao_lan      NUMERIC(14,0),
    codg_exercicio_lan      SMALLINT,
    tipo_imposto_lan        SMALLINT,
    tipo_lancamento_lan     SMALLINT,
    info_uso_lan            SMALLINT,
    info_posicao_fiscal_lan SMALLINT,
    categoria_tributacao    VARCHAR(20),
    info_tipo_edf_1         SMALLINT,
    info_tipo_edf_2         SMALLINT,
    valr_venal_base         NUMERIC(15,2),
    valr_venal_simulado     NUMERIC(15,2),
    valr_aliquota_lan       NUMERIC(7,5),
    valr_iptu_bruto         NUMERIC(13,2),
    valr_iptu_cap           NUMERIC(13,2),
    valr_imposto_lan        NUMERIC(13,2),
    valr_imposto_anterior   NUMERIC(13,2),
    faixa_anterior          VARCHAR(60),
    faixa_atual             VARCHAR(60),
    migrou_faixa            BOOLEAN       DEFAULT FALSE,
    sentido_migracao        VARCHAR(10)   CHECK (sentido_migracao IN ('SUBIU','DESCEU','PERMANECEU',NULL)),
    motivo_isencao          VARCHAR(30),
    cpf_contribuinte        VARCHAR(14),
    flag_apt_com_box        BOOLEAN,
    criado_em               TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE sim_cpf_inscricoes (
    cpf                  VARCHAR(14)   NOT NULL,
    isn_sia_lanciptu_asg BIGINT        NOT NULL,
    codg_inscricao_lan   NUMERIC(14,0),
    codg_exercicio_base  SMALLINT      NOT NULL,
    info_tipo_edf_1      SMALLINT,
    info_tipo_edf_2      SMALLINT,
    codg_edificio_lan    INTEGER,
    valr_venal_base      NUMERIC(15,2),
    flag_apt_com_box     BOOLEAN       DEFAULT FALSE,
    PRIMARY KEY (cpf, isn_sia_lanciptu_asg, codg_exercicio_base)
);
```

---

## 9. Arquitetura do sistema

### Stack

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Backend API | FastAPI (Python 3.11+) | Alta produtividade, tipagem com Pydantic, async nativo, excelente integração com Pandas |
| Processamento de dados | Pandas + NumPy | Ideal para manipular centenas de milhares de linhas de lançamento com vetorização |
| ORM / banco | SQLAlchemy + Alembic | ORM maduro para PostgreSQL com suporte a migrations |
| Banco de dados | PostgreSQL 15+ | Suporte nativo a JSONB, funções analíticas, bulk insert via COPY |
| Fila de processamento | Celery + Redis | Equivalente ao BullMQ — filas assíncronas para o motor de simulação |
| Frontend | Next.js (React) | SSR para dashboards, reutilização de componentes |
| Importação de dados | Script Python + Pandas | Leitura e validação dos CSVs com tratamento de encoding e tipos |

### Estrutura de pastas do projeto

```
simlan-iptu/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── api/                 # Routers por módulo
│   │   │   ├── importacao.py
│   │   │   ├── parametros.py
│   │   │   ├── faixas.py
│   │   │   ├── simulacoes.py
│   │   │   └── exportacao.py
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── services/            # Lógica de negócio
│   │   │   ├── motor_simulacao.py   # Motor principal
│   │   │   ├── iptu_social.py       # Verificação IPTU Social
│   │   │   └── faixas_service.py    # Projeção de faixas
│   │   ├── tasks/               # Celery tasks
│   │   │   └── simulacao_task.py
│   │   └── db.py                # Conexão PostgreSQL
│   ├── scripts/
│   │   └── importar_csv.py      # Script de importação dos CSVs
│   ├── requirements.txt
│   └── celeryconfig.py
├── frontend/
│   ├── pages/
│   ├── components/
│   └── ...
├── docker-compose.yml           # PostgreSQL + Redis
└── README.md
```

### Dependências Python principais

```txt
# requirements.txt
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy==2.0.30
alembic==1.13.1
psycopg2-binary==2.9.9
pandas==2.2.2
numpy==1.26.4
celery==5.4.0
redis==5.0.4
pydantic==2.7.1
python-multipart==0.0.9   # upload de CSV
openpyxl==3.1.2           # exportação XLSX
```

### Motor de simulação — exemplo com Pandas

```python
# services/motor_simulacao.py
import pandas as pd
import numpy as np

def simular_exercicio(df_base: pd.DataFrame, faixas: list, ipca: float, selic: float, ano: int) -> pd.DataFrame:
    df = df_base.copy()

    # Etapa 1 — Corrigir valor venal pelo IPCA
    df['valr_venal_simulado'] = df['VALR_VENAL_LAN'] * (1 + ipca)

    # Etapa 2 — Aplicar faixas corrigidas pela SELIC
    faixas_corrigidas = [
        {**f, 'limite_superior': f['limite_superior'] * (1 + selic) if f['limite_superior'] else None}
        for f in faixas
    ]

    def enquadrar_faixa(valor, categoria, em_construcao=False):
        # Imóvel em construção entra na faixa TERRITORIAL com teto de 1% (Art. 178 IV)
        cat = 'TERRITORIAL' if em_construcao else categoria
        faixas_cat = [f for f in faixas_corrigidas if f['categoria'] == cat]
        for f in sorted(faixas_cat, key=lambda x: x['limite_inferior']):
            if f['limite_superior'] is None or valor <= f['limite_superior']:
                aliquota = f['aliquota']
                # Teto de 1% para em construção (Art. 178, inciso IV)
                return min(aliquota, 0.01) if em_construcao else aliquota
        aliquota = faixas_cat[-1]['aliquota']
        return min(aliquota, 0.01) if em_construcao else aliquota

    df['em_construcao'] = (df['TIPO_IMPOSTO_LAN'] == 2) & (df['INFO_OCUPACAO_LAN'] == 4)
    df['valr_aliquota_simulada'] = df.apply(
        lambda r: enquadrar_faixa(
            r['valr_venal_simulado'],
            r['categoria_tributacao'],
            em_construcao=r['em_construcao']
        ), axis=1
    )

    # Etapa 3 — Calcular imposto bruto
    df['valr_iptu_bruto'] = df['valr_venal_simulado'] * df['valr_aliquota_simulada']

    # Etapa 4 — Cap de 5% (Art. 168 §6º)
    df['valr_iptu_cap'] = np.minimum(
        df['valr_iptu_bruto'],
        df['VALR_IMPOSTO_LAN'] * 1.05 * (1 + ipca)
    )

    # Etapa 5 — Imposto mínimo (Art. 179)
    minimo = 100.00 * (1 + selic)  # simplificado — usar SELIC acumulada desde 2022
    df['valr_imposto_final'] = np.maximum(df['valr_iptu_cap'], minimo)

    df['codg_exercicio_lan'] = ano
    return df

```

### Script de importação dos CSVs

```python
# scripts/importar_csv.py
import pandas as pd
from sqlalchemy import create_engine

engine = create_engine('postgresql://user:pass@localhost/lancamento-iptu')

# Lançamento principal
df_lan = pd.read_csv(
    'SIA_LANCIPTU_ASG.csv',
    sep=';',
    encoding='utf-8',
    dtype=str,           # carrega tudo como string primeiro
    keep_default_na=False
)

# Converter tipos
numeric_cols = ['VALR_VENAL_LAN', 'VALR_ALIQUOTA_LAN', 'VALR_IMPOSTO_LAN', 'VALR_TOTAL_LAN']
for col in numeric_cols:
    df_lan[col] = pd.to_numeric(df_lan[col].str.replace(',', '.'), errors='coerce')

smallint_cols = ['CODG_EXERCICIO_LAN', 'TIPO_IMPOSTO_LAN', 'TIPO_LANCAMENTO_LAN',
                 'INFO_USO_LAN', 'INFO_OCUPACAO_LAN', 'INFO_POSICAO_FISCAL_LAN']
for col in smallint_cols:
    df_lan[col] = pd.to_numeric(df_lan[col], errors='coerce').astype('Int16')

# Filtrar ativos
df_lan = df_lan[df_lan['INFO_STATUS_LAN'].isna() | (df_lan['INFO_STATUS_LAN'] == '1')]

# Inserir no PostgreSQL
df_lan.to_sql(
    'SIA_LANCIPTU_ASG',
    engine,
    if_exists='append',
    index=False,
    method='multi',
    chunksize=5000
)
print(f'{len(df_lan)} registros importados')

# Tipo de edificação
df_edf = pd.read_csv('SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN.csv', sep=';', encoding='utf-8')
df_edf.to_sql('SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN', engine, if_exists='append', index=False, chunksize=5000)
print(f'{len(df_edf)} registros de edificação importados')
```

### Fluxo de importação de dados

```
SQL Server (SEFIN.dbo)
    → Query de extração no DBeaver
    → Export CSV (separador ;, encoding UTF-8)
    → python scripts/importar_csv.py
    → Tabelas "SIA_LANCIPTU_ASG" e "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" populadas
```

### Fluxo de processamento de uma simulação

```
Usuário configura simulação (parâmetros + faixas)
    → POST /api/simulacoes → FastAPI cria registro em sim_simulacoes (status: PENDENTE)
    → Celery enfileira task simulacao_task.delay(simulacao_id)
    → Worker carrega DataFrame via Pandas (SELECT * FROM "SIA_LANCIPTU_ASG")
    → Processa exercício por exercício com simular_exercicio()
    → Grava resultados em sim_lancamentos via bulk insert
    → Atualiza status → CONCLUÍDO
    → Frontend polling GET /api/simulacoes/{id} → exibe dashboard
```

---

## 10. Módulos funcionais

### M1 — Importação de dados históricos

- Recebe CSVs exportados do SQL Server via pgAdmin
- Tabelas: `"SIA_LANCIPTU_ASG"` e `"SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN"`
- Geração automática de `sim_cpf_inscricoes` para uso no IPTU Social
- Preview com contagem de registros por exercício e tipo

### M2 — Gestão de faixas de alíquota

- CRUD de faixas para um exercício-base
- Projeção automática para anos seguintes com SELIC ou IPCA
- Visualização em tabela comparativa por ano

### M3 — Gestão de parâmetros macroeconômicos

- Cadastro de IPCA e SELIC por ano (histórico e projetado)
- Importação de série histórica (BACEN/IBGE)

### M4 — Configuração e execução de simulação

- Formulário com todos os parâmetros de entrada
- Dois cenários: SELIC ou IPCA para correção das faixas
- Barra de progresso em tempo real

### M5 — Dashboard analítico

- KPIs: total de imóveis, imposto total, quantidade de IPTU Social, imposto mínimo
- Evolução do imposto por exercício
- Planilha de imóveis por faixa × ano com variação percentual
- Mapa de migração de faixas
- Evolução do IPTU Social por exercício
- Comparativo entre cenários

### M6 — Exportação

- CSV com todos os campos simulados
- XLSX com sumário por exercício
- PDF com indicadores e gráficos

---

## 11. Regras de negócio especiais

### 11.1 Cap de 5% — exceções (Art. 168 §9º)

Imóveis que sofreram alterações cadastrais são calculados sem cap:

- Acréscimo de área de terreno
- Acréscimo de área edificada > 20%
- Alteração de uso residencial → não residencial
- Alteração edificado → não edificado (ou vice-versa)
- Remanejamentos, remembramentos, desmembramentos

Na simulação, o sistema assume que todos os imóveis mantêm características históricas e aplica o cap. O usuário pode marcar inscrições específicas como "sem cap" manualmente.

### 11.2 Isenções não relacionadas ao IPTU Social

Imóveis com `INFO_POSICAO_FISCAL_LAN ≠ 0` são propagados para os exercícios simulados com a mesma posição fiscal. O sistema deve permitir configurar "fim de isenção" por inscrição.

### 11.3 Boxes e escaninhos — agrupamento para IPTU Social

```
1. Carregar todas as inscrições do CPF no exercício base
   (cruzar "SIA_LANCIPTU_ASG" com "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" via ISN_SIA_LANCIPTU_ASG)
2. Para inscrições com mesmo CODG_EDIFICIO_LAN:
   - Identificar: 1 apartamento (INFO_TIPO_EDF_LAN = 2)
                + N garagens (tipo 11) ou escaninhos (tipo 13)
   - Contar como 1 imóvel único
   - Somar VALR_VENAL_LAN de todas as inscrições do grupo
3. Se CPF tem apenas 1 unidade (ou 1 grupo apt+box):
   Verificar valor venal somado vs. Limite_IPTU_Social(ano)
```

### 11.4 Desconto à vista (Art. 187 §único)

O imposto é registrado sem desconto. Nos relatórios exibir coluna opcional: `VALR_IMPOSTO_LAN × 0,90`.

---

## 12. Critérios de aceitação

| # | Critério |
|---|---|
| 1 | Importação dos CSVs sem erros, com contagem correta por exercício |
| 2 | Filtro de ativos correto: `INFO_STATUS_LAN IS NULL OR INFO_STATUS_LAN = 1` |
| 3 | Faixas cadastradas para 2027 e projetadas para 2035 pela SELIC |
| 4 | Simulação de todos os imóveis de um exercício em menos de 10 minutos |
| 5 | IPTU Social identificado corretamente por CPF com valor venal ≤ limite |
| 6 | Apartamento + box do mesmo edifício tratado como 1 imóvel |
| 7 | Imposto mínimo aplicado quando calculado < R$ 100,00 atualizado |
| 8 | Cap de 5% aplicado e registrado separadamente do valor bruto |
| 9 | Dashboard mostra migração de faixas com variação por ano |
| 10 | Comparativo entre cenário SELIC vs. IPCA para faixas disponível |
| 11 | Exportação CSV/XLSX funcional com todos os campos simulados |

---

## 13. Glossário

| Termo | Definição |
|---|---|
| IPCA | Índice de Preços ao Consumidor Amplo (IBGE) — atualiza o valor venal |
| SELIC | Taxa referencial do Banco Central — atualiza os limites das faixas e o imposto mínimo (Art. 381 CTM) |
| ISN | Chave surrogate do SQL Server (`ISN_SIA_LANCIPTU_ASG`) — liga a tabela principal com as auxiliares |
| cnxarraycolumn | Campo da auxiliar de tipo de edificação indicando a ocorrência: `0` = principal, `1` = secundária |
| Valor venal | Valor que o imóvel alcançaria em compra e venda à vista (Art. 168 CTM) |
| Faixa de alíquota | Intervalo de valor venal ao qual corresponde uma alíquota específica (Art. 178 CTM) |
| IPTU Social | Isenção total do IPTU para imóvel residencial único de pessoa física com valor venal ≤ limite (Anexo X, item 14 CTM) |
| Imposto mínimo | Valor mínimo do IPTU (Art. 179 CTM — R$ 100,00 atualizado pela SELIC) |
| Cap de 5% | Limite de acréscimo anual do IPTU para 2026 e seguintes (Art. 168 §6º CTM) |
| INFO_POSICAO_FISCAL_LAN | `0` (ou NULL) = Normal; `1` = Imunidade; `2` a `5` = Isenção |
| TIPO_LANCAMENTO_LAN | `0` Normal; `1` Isento; `2` Imposto Mínimo; `3` IPTU Social; `4` Imunidade |

---

## 14. Referências legais

| Dispositivo | Assunto |
|---|---|
| Art. 164 CTM | Fato gerador do IPTU |
| Art. 165 CTM | Definição de imóvel não edificado |
| Art. 167 CTM | Base de cálculo — valor venal |
| Art. 168 CTM | Determinação do valor venal e limites de acréscimo |
| Art. 168 §2º | Atualização das edificações pelo IPCA |
| Art. 168 §6º | Cap de 5% para 2026 e seguintes |
| Art. 168 §8º e §9º | Exceções ao cap |
| Art. 173 a 175 | Fórmulas de cálculo do valor venal |
| Art. 178 | Tabela de alíquotas por tipo e faixa de valor venal |
| Art. 178 §4º | Atualização dos limites das faixas pela SELIC |
| Art. 179 | Imposto mínimo (R$ 100,00 atualizados) |
| Art. 183 | Lançamento anual de ofício; fato gerador em 01/01 |
| Art. 381 | SELIC como índice de atualização monetária municipal |
| Art. 382 | Planta de Valores atualizada pelo IPCA |
| Anexo X, item 14 | IPTU Social — isenção imóvel residencial único ≤ R$ 140.000 |
