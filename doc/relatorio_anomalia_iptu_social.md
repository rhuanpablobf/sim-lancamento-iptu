# Relatório de Análise: Anomalia no Crescimento do IPTU Social

## 1. Descrição do Problema
Durante as simulações de longo prazo (2027-2035), observou-se um crescimento contínuo e linear no número de imóveis enquadrados como **IPTU Social**, mesmo sem a inclusão de novos cadastros na base de dados. Este comportamento é inesperado, visto que tanto os valores venais quanto os limites de enquadramento social são atualizados pelo mesmo índice (IPCA).

## 2. Diagnóstico Técnico
A análise profunda do motor de simulação (`motor_simulacao.py`) e dos dados no PostgreSQL identificou um erro de lógica no loop de execução plurianual.

### Causa Raiz: Bug de Duplicidade de Colunas
No arquivo `backend/app/services/motor_simulacao.py`, dentro da função `executar_motor_completo`, o código prepara a base para o "próximo ano" renomeando as colunas de resultado para colunas de base.

O bug ocorre nas linhas 464-469:
```python
# O código atual dropa apenas VALR_VENAL_LAN e VALR_IMPOSTO_LAN
cols_base_antigas = ["VALR_VENAL_LAN", "VALR_IMPOSTO_LAN"]
df_corrente = df_resultado.drop(columns=[c for c in cols_base_antigas if c in df_resultado.columns])

df_corrente = df_corrente.rename(columns={
    "valr_venal_simulado": "VALR_VENAL_LAN",
    "valr_imposto_final": "VALR_IMPOSTO_LAN",
    "valr_venal_social_simulado": "valr_venal_social_base" # <-- AQUI ESTÁ O PROBLEMA
}).reset_index(drop=True)
```

**O que acontece:**
1. A coluna `valr_venal_social_base` (que existia na rodada anterior) **não é removida** antes do rename.
2. O pandas, ao renomear `valr_venal_social_simulado` para `valr_venal_social_base`, cria uma **coluna duplicada** com o mesmo nome em vez de sobrescrever a existente.
3. Na rodada seguinte, a função `simular_exercicio` utiliza o método `~df.columns.duplicated()` (linha 184) para limpar duplicatas, mas este método mantém a **primeira** ocorrência encontrada.
4. A primeira ocorrência é o valor **antigo** (desatualizado).

### Efeito Prático
Isso faz com que o valor venal utilizado para a comparação social (`valr_venal_social_base`) fique "congelado" ou sofra um atraso sistemático em relação ao limite social, que continua crescendo corretamente pelo IPCA. Como o limite cresce e o valor de comparação do imóvel fica estagnado (ou cresce menos), mais imóveis acabam entrando na faixa social a cada ano.

## 3. Exemplo Prático (Imóvel 19941931)
Analisamos o rastro do imóvel `19941931` na simulação `71d6df3d-0b9e-416e-bdef-0fd45002c591`:

| Ano | Valor Venal (Simulado) | Limite Social | Tipo Lançamento | Motivo |
| :--- | :--- | :--- | :--- | :--- |
| **2026 (Base)** | R$ 179.455,47 | R$ 181.600,88 | **3 (Social)** | Abaixo do limite base. |
| **2027** | R$ 187.459,18 | R$ 181.600,88 | **0 (Normal)** | Valor saltou 4,46%, mas limite 2027 usou índice 2026 (0%). |
| **2028** | R$ 195.819,86 | R$ 189.700,28 | **3 (Social)** | **BUG:** O motor usou R$ 187.459 (valor de 2027) para comparar com o limite de R$ 189.700. |

No ano de 2028, o imóvel deveria continuar como **Normal**, pois seu valor real simulado era R$ 195 mil. Porém, devido ao erro de atualização da coluna de base, ele foi comparado usando o valor defasado do ano anterior, resultando em um enquadramento social indevido.

## 4. Correção Sugerida
Para resolver o problema, deve-se incluir a coluna `valr_venal_social_base` na lista de colunas a serem removidas antes do rename no loop principal.

**Alteração em `motor_simulacao.py`:**
```python
# Mudar linha 463 de:
cols_base_antigas = ["VALR_VENAL_LAN", "VALR_IMPOSTO_LAN"]
# Para:
cols_base_antigas = ["VALR_VENAL_LAN", "VALR_IMPOSTO_LAN", "valr_venal_social_base"]
```

## 5. Conclusão
O aumento no número de imóveis sociais é um **artefato técnico** da simulação e não reflete a realidade da regra de negócio. Uma vez corrigido o bug de atualização das colunas entre os ciclos anuais, a quantidade de benefícios deve permanecer estável (ou sofrer apenas pequenas variações decorrentes de arredondamentos decimais).

---
**Relatório gerado por:** Antigravity (Arquiteto de Software Sênior)
**Data:** 12 de Maio de 2026
