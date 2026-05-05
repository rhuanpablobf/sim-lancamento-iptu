# Fluxo de Cálculo do Imposto (Motor de Simulação)

Este documento descreve a lógica sequencial utilizada pelo `motor_simulacao.py` para calcular o IPTU projetado de cada imóvel durante uma simulação.

## 1. Entrada de Dados
O motor recebe:
- **Dados do Imóvel**: Inscrição, Valor Venal Base, Alíquota Base, Tipo de Lançamento Base.
- **Configuração da Simulação**: Ano Destino, Indexador Escolhido (SELIC ou IPCA), Aplicação de Cap.
- **Configurações Base**: Valor Mínimo (2022) e Limite Venal Social (2022).

---

## 2. Processamento por Exercício (Ano a Ano)
O cálculo é iterativo. Se a simulação vai de 2026 até 2030, o motor processa cada ano sequencialmente, usando o resultado do ano anterior como base para o próximo.

### Passo A: Atualização de Parâmetros Fiscais (Auditados)
Para o exercício `T`, o motor calcula os novos thresholds:
1. **Indexador Acumulado**: Busca o índice (SELIC ou IPCA) cadastrado para o ano `T`.
2. **Imposto Mínimo Atualizado**: `Minimo(T) = Minimo(Base) * (1 + Indice)`.
3. **Limite IPTU Social Atualizado**: `Social(T) = Social(Base) * (1 + Indice)`.
*Estes valores são salvos na tabela de auditoria `sim_simulacao_parametros_utilizados`.*

### Passo B: Atualização do Valor Venal do Imóvel
O valor venal do imóvel é corrigido anualmente pelo mesmo índice aplicado aos parâmetros:
`Venal(T) = Venal(T-1) * (1 + Indice)`.

### Passo C: Determinação da Alíquota (Faixas)
O sistema consulta a tabela de faixas para o `Ano Base das Faixas` escolhido:
1. Localiza em qual faixa o `Venal(T)` se enquadra.
2. Extrai a alíquota correspondente.

### Passo D: Cálculo do Imposto Bruto
`Imposto_Bruto(T) = Venal(T) * Aliquota(T)`.

---

## 3. Aplicação de Regras de Negócio (Enquadramento)

O motor aplica as regras na seguinte ordem de prioridade:

### 1ª Regra: IPTU Social (Isenção)
- **Condição**: Se `Venal(T) <= Limite_Social(T)`.
- **Resultado**: O imóvel é classificado como **IPTU Social**.
- **Valor Final**: R$ 0,00 (Isento).

### 2ª Regra: Imposto Mínimo
- **Condição**: Se `Imposto_Bruto(T) < Imposto_Minimo(T)` (e não for IPTU Social).
- **Resultado**: O imóvel é classificado como **Imposto Mínimo**.
- **Valor Final**: O valor é elevado para o `Imposto_Minimo(T)`.

### 3ª Regra: Lançamento Normal
- **Condição**: Se não se enquadrar nas anteriores.
- **Resultado**: O imóvel segue o cálculo da alíquota padrão.
- **Valor Final**: `Imposto_Bruto(T)`.

---

## 4. Cap de Transição (Opcional)
Se a opção "Aplicar Cap" estiver ativa:
- O sistema compara o `Imposto_Final(T)` com o `Imposto_Final(T-1)`.
- Se o aumento for superior ao limite definido (ex: 20%), o valor é limitado ao teto do Cap.

---

## 5. Persistência e Auditoria
Ao final de cada exercício:
1. Os dados são gravados em `sim_lancamentos`.
2. Os parâmetros de threshold usados são gravados em `sim_simulacao_parametros_utilizados`.
3. O progresso é atualizado para o frontend via JSON na tabela `sim_simulacoes`.
