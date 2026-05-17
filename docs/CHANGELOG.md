# CHANGELOG — SimLan IPTU

Todas as alterações significativas deste projeto são documentadas neste arquivo.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [Não lançado] — Em desenvolvimento

---

## [2.5.2] — 2026-05-16

### ⚡ Performance — Otimização ClickHouse-First do Dashboard Real

#### Descoberta
Após a limpeza do banco e reimportação dos dados, o tempo de carregamento inicial do Dashboard Histórico (Base Real) era extremamente alto (~25 segundos por carga de página).

#### Diagnóstico
O diagnóstico revelou os seguintes gargalos de infraestrutura e banco de dados:
1. **Self-Join Massivo em Postgres (`migracao_trava`)**: Uma query complexa com self-join utilizando string-matching sobre 3.7+ milhões de registros era executada a cada requisição de `/api/importacao/dashboard`, levando **~19.7 segundos** em estado frio (cold start) ou sem buffers aquecidos.
2. **Aggregations e Joins de Edificações**: O endpoint `/dashboard/distribuicao-edificacao` realizava um `LEFT JOIN` e agregações de string em Postgres (`SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN`), levando **~6.2 segundos** por execução.
3. **Varreduras Sequenciais (Seq Scans)**: Os endpoints `/dashboard/anos` e `/dashboard/consolidado-faixas` varriam tabelas PostgreSQL gigantes sem índice aproveitável, adicionando latência significativa.

#### Soluções e Arquitetura Implementada
Migramos todo o dashboard histórico para uma arquitetura **ClickHouse-First com Fallback Automático para Postgres**:
1. **Cache Auto-Populado em ClickHouse (`cache_migracao_trava`)**: Criamos uma tabela dedicada no ClickHouse para armazenar o resultado consolidado e estático de `migracao_trava`.
   - Na primeira requisição, a query pesada roda no Postgres, os dados são retornados e **imediatamente inseridos** no ClickHouse.
   - Nas requisições subsequentes, o ClickHouse entrega o resultado em **~5ms**, gerando uma redução de latência de 99.9%.
   - Invalidação automática integrada: o cache é automaticamente limpo (`TRUNCATE TABLE`) sempre que a sincronização do histórico do ClickHouse é executada.
2. **Consultas Analíticas Diretas em ClickHouse**: 
   - Refatorado `/dashboard/anos` para consultar ClickHouse (latência reduzida para **~5ms**).
   - Refatorado `/dashboard/distribuicao-edificacao` para agregar no ClickHouse (latência reduzida para **~30ms**).
   - Refatorado `/dashboard/consolidado-faixas` para agregar no ClickHouse (latência reduzida para **~50ms**).

#### Resultados Obtidos (Tempo de Resposta Local)
- **dashboard_anos**: De ~1.2s para **0.017s** (70x mais rápido)
- **distribuicao_edificacao_base**: De ~6.2s para **0.028s** (220x mais rápido)
- **consolidado_faixas_base**: De ~4.5s para **0.052s** (85x mais rápido)
- **dashboard_metricas (cached)**: De ~19.7s para **0.131s** (150x mais rápido)

---

## [2.5.1] — 2026-05-11

### 🐛 Corrigido — Faixas Territoriais Históricas (2022 vs Lei Atual)

#### Descoberta

Após a correção da lógica de enquadramento (v2.5.0), o diagnóstico revelou que
**~120.000 imóveis territoriais de 2022** permaneciam sem classificação.

#### Causa

O Código Tributário Municipal passou por revisão entre 2022 e 2023.  
As alíquotas territoriais foram **reduzidas em 1% por faixa** na nova redação:

| Faixa | Valor Venal | Alíquota 2022 (lei anterior) | Alíquota 2023+ (lei atual) |
|---|---|---|---|
| Faixa 1 | Até R$ 40.000 | **2,00%** | 1,00% |
| Faixa 2 | R$ 40k a R$ 60k | **2,30%** | 1,30% |
| Faixa 3 | R$ 60k a R$ 80k | **2,60%** | 1,60% |
| Faixa 4 | R$ 80k a R$ 100k | **2,90%** | 1,90% |
| Faixa 5 | R$ 100k a R$ 150k | **3,20%** | 2,20% |
| Faixa 6 | R$ 150k a R$ 300k | **3,50%** | 2,50% |
| Faixa 7 | Acima de R$ 300k | **3,80%** | 2,80% |

#### Correção

Inseridas 7 novas faixas (`TER-H1` a `TER-H7`) em `sim_faixas_referencia` com
as alíquotas da lei anterior, usando os mesmos limites de valor venal da lei atual.

Script de correção: `docs/sql/corrigir_faixas_territoriais.sql`

#### Casos Residuais (2023-2026, impacto baixo)

Identificados ~2.800 imóveis por ano sem classificação por causas diversas:

| Alíquota | Tipo | Situação | Ação |
|---|---|---|---|
| `0.00990` | 2 (Territorial) | Arredondamento de 1% | Inserida faixa `TER-F1B` |
| `NULL` | 1 ou 2 | Sem alíquota no dado fonte | Não classificável |
| `0.02800` / `0.02500` | 1 (Predial) | Taxa territorial em imóvel predial | Erro no dado fonte |
| `0.00500` | 2 (Territorial) | 0,5% não previsto no CTM | Verificar dado fonte |
| `0.01400` | 2 (Territorial) | 1,4% não previsto no CTM | Verificar dado fonte |

### ➕ Adicionado — Diagnóstico no Motor de Enquadramento

- Após a classificação de cada ano, o sistema exibe as alíquotas sem correspondência
  em `sim_faixas_referencia`, com quantidade de imóveis afetados.
- Facilita a identificação de faixas faltantes ou erros no dado fonte.

### ➕ Adicionado — Documentação SQL

- Criada pasta `docs/sql/` para scripts de manutenção do banco de dados.
- Arquivo `docs/sql/corrigir_faixas_territoriais.sql` com os INSERTs documentados e comentados.

---

## [2.5.0] — 2026-05-11

### 🐛 Corrigido — Motor de Enquadramento de Faixas (Refatoração Crítica)

#### Problema raiz identificado

O campo `faixa_codigo`, `faixa_label` e `faixa_ordem` ficavam `NULL` após importação, impedindo a visualização correta do gráfico **"Distribuição de Imóveis por Faixa de Alíquota"** no Dashboard Analítico.

#### Causa 1 — Comparação de categoria com casing errado

- **Arquivo:** `backend/app/services/enquadramento_service.py`
- **Bug:** O código comparava `cat_nome == "Residencial"` mas o banco armazenava `"RESIDENCIAL"`.  
  O `filtro_uso` ficava sempre vazio `""`, fazendo o `UPDATE` rodar sem filtro de categoria — a última categoria processada (Territorial) sobrescrevia **todos** os imóveis.
- **Correção:** Comparações ajustadas para `"RESIDENCIAL"`, `"NAO_RESIDENCIAL"`, `"TERRITORIAL"`.
- **Commit:** `b415494`

#### Causa 2 — Leitura de coluna inexistente na query

- **Bug:** O código tentava acessar `f["faixa_ordem"]` mas a query `SELECT` não incluía essa coluna.
- **Correção:** Adicionado `faixa_ordem` ao `SELECT` e adicionado guard `else: continue` para categorias desconhecidas.
- **Commit:** `ba35cc9`

#### Causa 3 — Lógica de classificação completamente errada (ranges vs alíquota)

- **Bug:** A classificação usava faixas de valor venal (`limite_inferior` / `limite_superior`) para enquadrar imóveis históricos. O problema: os dados históricos já possuem a alíquota aplicada (`VALR_ALIQUOTA_LAN`), que identifica unicamente a faixa.
- **Correção:** Reescrita completa do motor de classificação usando `JOIN` direto:

  ```sql
  VALR_ALIQUOTA_LAN = fr.aliquota
  ```

  Categoria determinada por `TIPO_IMPOSTO_LAN` + `INFO_USO_LAN`:
  - `TIPO_IMPOSTO_LAN = 2` → `TERRITORIAL`
  - `TIPO_IMPOSTO_LAN = 1` + `INFO_USO_LAN = 1` → `RESIDENCIAL`
  - `TIPO_IMPOSTO_LAN = 1` + `INFO_USO_LAN > 1` → `NAO_RESIDENCIAL`
- **Commits:** `2ac82b9`, `76be4d1`

#### Causa 4 — Tabela fonte errada para histórico

- **Bug:** O código usava `sim_faixas_aliquota` como fonte principal. Essa tabela é usada apenas como base para projeção de anos futuros (2027+).
- **Correção:** A fonte de verdade para dados históricos reais é **exclusivamente `sim_faixas_referencia`**, que contém as alíquotas oficiais do Código Tributário Municipal.
- **Commit:** `76be4d1`

### ✅ Comportamento final correto

```
Imóvel 2022 com VALR_ALIQUOTA_LAN = 0.00400
  → TIPO_IMPOSTO_LAN = 1, INFO_USO_LAN = 1 → categoria: RESIDENCIAL
  → 0.00400 = RES-F4 em sim_faixas_referencia
  → faixa_codigo = "RES-F4", faixa_label = "Faixa 4 — R$ 300k a R$ 500k", faixa_ordem = 4
```

### ➕ Adicionado

- Diagnóstico automático pós-classificação: exibe alíquotas sem correspondência em `sim_faixas_referencia` com quantidade de imóveis afetados.
- Guard `else: continue` para categorias desconhecidas no loop de processamento.

---

## [2.4.0] — 2026-05-09 a 2026-05-10

### 🐛 Corrigido — Sincronização ClickHouse e Nomes de Tabelas

- **Problema:** Erro `UNKNOWN_TABLE` ao sincronizar o histórico com o ClickHouse após renomeação de tabelas.
- **Correção:** Nomes das tabelas atualizados para `historico_lancamentos_analitico` e `sim_lancamentos_analitico`.
- **Arquivo:** `backend/app/clickhouse.py`

### 🐛 Corrigido — Categorização no ClickHouse

- **Problema:** A query de sincronização do histórico usava o status fiscal ao invés do tipo de uso do imóvel.
- **Correção:** Padronização das categorias para `Residencial`, `Não Residencial`, `Territorial` — consistente com os dados de simulação.
- **Arquivo:** `backend/app/clickhouse.py` (linhas 123–136)

### ➕ Adicionado — Classificação Automática no Fluxo de Importação

- A tarefa `importar_csv_task` agora chama automaticamente `classificar_faixas_base_real()` e `sincronizar_historico_para_clickhouse()` após cada importação bem-sucedida.
- **Arquivo:** `backend/app/tasks/importacao_task.py` (linhas 161–185)
- **Commit:** `bc1e2fb`, `e2c1690`

### ➕ Adicionado — Motor de Classificação de Faixas (versão inicial)

- Criação do serviço `enquadramento_service.py` com a função `classificar_faixas_base_real()`.
- Primeira implementação (substituída na v2.5.0 pela lógica correta por alíquota).

---

## [2.3.0] — 2026-05-08

### ➕ Adicionado — Dashboard Analítico com ClickHouse

- Motor de performance migrado para ClickHouse para suportar consultas analíticas em milhões de registros.
- KPIs em tempo real: total de imóveis, valor venal total, imposto total, ticket médio.
- Gráficos de evolução histórica por categoria (Residencial, Não Residencial, Territorial).
- **Distribuição por Faixa de Alíquota** — gráfico de barras que exibe quantidade de imóveis por faixa.
- **Commits:** `fe30f8c`, `77a2b28`, `ac1ab1a`

### ⚡ Performance

- Sincronização em lotes para evitar estouro de RAM em bases com milhões de registros.
- **Commit:** `77a2b28`

### 🐛 Corrigido

- Métricas zeradas no dashboard corrigidas (`f696eaf`).
- `KeyError` no dashboard tratado com fallback seguro (`cee850f`).
- Serialização e sintaxe em queries UNION do dashboard de simulação (`7a106be`, `00dc4ba`).

---

## [2.2.0] — 2026-05-07 a 2026-05-08

### ➕ Adicionado — Modo VPS (Importação por Volume)

- Implementado endpoint e UI para carga direta de arquivos via volume Docker `/opt/dados_iptu`.
- Permite importar arquivos de grande volume (centenas de MB) sem upload HTTP.
- **Commit:** `47d96f4`

### ➕ Adicionado — Progresso Granular na Importação

- Barra de progresso com etapas detalhadas: Postgres → Classificação → ClickHouse.
- **Commits:** `155bef7`, `4077d03`

### 🐛 Corrigido — Importação CSV

- Remoção de duplicatas no CSV auxiliar para evitar `UniqueViolation` (`baa4a80`).
- Suporte a múltiplos tipos de edificação com chave composta (`fe0ce2e`).
- Preservação de arquivos na VPS após importação — não remove arquivos fora da pasta `uploads` (`15d7fef`).

---

## [2.1.0] — 2026-05-04 a 2026-05-07

### ➕ Adicionado — Motor de Simulação

- Motor de cálculo de imposto com suporte a cenários IPCA e SELIC.
- Criação de simulações com parâmetros configuráveis por categoria.
- Dashboard de simulação com variação percentual em relação à base real.
- **Commits:** `c21ea0e`, `26c3d39`, `3ed4a27`

### ➕ Adicionado — Faixas de Alíquota (CRUD)

- Interface para cadastro e edição de faixas de alíquota por categoria e exercício.
- Projeção automática de faixas para anos futuros com base em índices (IPCA/SELIC).
- Seleção dinâmica de "Ano-base das faixas" listando apenas anos com dados cadastrados.

### 🐛 Corrigido

- Erro 404 na busca de imóvel na auditoria com campos numeric (`02c4f73`).
- Lógica de categorização de lançamentos baseada em `TIPO_IMPOSTO_LAN` e `INFO_USO_LAN` (`02c4f73`).

---

## [2.0.0] — 2026-05-03 a 2026-05-04

### ➕ Adicionado — Infraestrutura de Produção

- `docker-compose.prod.yml` configurado para deploy com Traefik + Docker Swarm.
- CI/CD com GitHub Actions: build, push para GHCR e deploy automático por SSH.
- Banco de dados externo PostgreSQL 15 separado do stack da aplicação.
- Volumes persistentes em `/opt/dados_iptu` na VPS.
- **Commits:** `3a43ef9`, `20b2aff`, `26617a9`

### ➕ Adicionado — Schema do Banco de Dados

- Tabela `SIA_LANCIPTU_ASG`: base de dados histórica dos lançamentos IPTU.
  - Colunas de classificação adicionadas: `faixa_codigo`, `faixa_label`, `faixa_ordem`.
- Tabela `SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN`: dados auxiliares de edificação.
- Tabela `sim_faixas_referencia`: alíquotas oficiais do Código Tributário Municipal.
- Tabela `sim_faixas_aliquota`: base para projeção de faixas de anos futuros.
- Tabelas ClickHouse: `historico_lancamentos_analitico`, `sim_lancamentos_analitico`.

### ➕ Adicionado — Frontend

- Dashboard Analítico com gráficos interativos (Recharts).
- Página de Importação com suporte a Upload e Modo VPS.
- Página de Faixas de Alíquota com editor inline.
- Página de Estudos de Impacto e Auditoria do Imóvel.

---

## Tabela de Responsabilidades por Tabela

| Tabela | Responsabilidade |
|---|---|
| `SIA_LANCIPTU_ASG` | Dados históricos reais dos lançamentos IPTU |
| `sim_faixas_referencia` | Alíquotas oficiais do CTM — fonte para classificação histórica |
| `sim_faixas_aliquota` | Base para projeção de faixas de anos futuros (2027+) |
| `sim_simulacoes` | Cabeçalho das simulações criadas pelo usuário |
| `sim_lancamentos` | Resultados calculados de cada simulação |
| `historico_lancamentos_analitico` | Dados históricos sincronizados no ClickHouse |
| `sim_lancamentos_analitico` | Dados de simulação sincronizados no ClickHouse |

---

## Lógica de Classificação de Faixas (Referência)

```
Para cada imóvel em SIA_LANCIPTU_ASG:

  1. Determinar categoria:
     TIPO_IMPOSTO_LAN = 2              → TERRITORIAL
     TIPO_IMPOSTO_LAN = 1, USO = 1    → RESIDENCIAL
     TIPO_IMPOSTO_LAN = 1, USO > 1    → NAO_RESIDENCIAL

  2. Cruzar com sim_faixas_referencia:
     WHERE VALR_ALIQUOTA_LAN = fr.aliquota AND categoria = <categoria acima>

  3. Resultado: faixa_codigo, faixa_label, faixa_ordem preenchidos.
```

> **Nota:** A alíquota 1% (0.01000) existe em TERRITORIAL e NAO_RESIDENCIAL,  
> mas o filtro por `TIPO_IMPOSTO_LAN` garante o cruzamento correto sem ambiguidade.
