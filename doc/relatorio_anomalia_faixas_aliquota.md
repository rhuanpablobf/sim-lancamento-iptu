# Relatório de Anomalia: Falha no Enquadramento de Faixas de Alíquota nas Simulações

## Diagnóstico do Problema

O painel analítico da plataforma apresentou um erro onde a "Distribuição de imóveis por faixa de alíquota" exibia apenas "`-`" para as faixas projetadas nos anos de simulação (ex: 2027 a 2035) para as categorias Residenciais, e aglomerava mais de 112.000 imóveis na categoria `TERRITORIAL` com o rótulo "Faixa None".

A análise de arquitetura indicou que esse comportamento não era decorrente de uma falha da UI ou do ClickHouse, mas sim de dois problemas intrínsecos de tipagem durante o processamento vetorizado em memória via Pandas no arquivo `motor_simulacao.py`:

### 1. Incompatibilidade de Tipos de Dados (String vs Integer)
A base de dados (SIA_LANCIPTU_ASG) armazena os códigos de enquadramento original como tipo de caracteres (Ex: `VARCHAR`). O Pandas, ao importar essa tabela no formato Dataframe via SQLAlchemy, atribui o tipo genérico (`object` / string) às colunas `TIPO_IMPOSTO_LAN` e `INFO_USO_LAN`.

A lógica original de classificação tributária utilizava:
```python
condicoes_cat = [
    df["TIPO_IMPOSTO_LAN"] == 2,
    (df["TIPO_IMPOSTO_LAN"] == 1) & (df["INFO_USO_LAN"] == 1),
    (df["TIPO_IMPOSTO_LAN"] == 1) & (df["INFO_USO_LAN"] != 1),
]
```
Ao avaliar `'2' == 2`, o Pandas retornava `False` para **toda a base**. Isso forçava 100% dos imóveis simulados a caírem na condição `default="RESIDENCIAL"`. Ao se tornarem todos residenciais, o sistema tentava enquadrá-los apenas nas faixas residenciais. No entanto, muitos desses imóveis possuíam características e valores atípicos (pois eram de fato territoriais) e descasavam totalmente das lógicas, ou caíam num vácuo de categorização se as strings do BD ficassem soltas. 

### 2. Conversão da String Nula ("None") e "Faixa None"
A categoria Territorial oficial de Goiânia não usa progressividade. A faixa para os dados em `sim_faixas_referencia` e na projeção é salva com `faixa_codigo = NULL`.
Quando o motor Numpy processava a máscara, a linha `df.loc[mask_enquadrar, "faixa_atual"] = str(faixa["faixa_codigo"])` convertia o valor nulo do Python (None) em uma literal de string `'None'`. Ao inserir no banco, a simulação registrava a string "None", e o fallback da UI exibia "Faixa None".

## Correções Implementadas

Foram implementadas proteções em `backend/app/services/motor_simulacao.py`:

1. **Cast Explícito de Tipos:** Foram convertidas as colunas `TIPO_IMPOSTO_LAN` e `INFO_USO_LAN` utilizando `pd.to_numeric(..., errors="coerce").fillna(0).astype(int)` antes de processar as condições vetorizadas. Isso garante que as flags do banco de dados sejam corretamente comparadas com os inteiros da lógica de enquadramento, normalizando as distribuições para Residencial e Territorial.
   
2. **Fallback para Faixas sem Código:** O processamento em vetor adicionou um fallback. Caso a faixa base esteja sem código (`None`), é alocado o código `"UNICA"`. Dessa forma a string literal `"None"` foi abolida do sistema.
```python
codigo_seguro = str(faixa["faixa_codigo"]) if faixa["faixa_codigo"] is not None else "UNICA"
```

## Próximos Passos
- Executar novas simulações no dashboard para validar a re-classificação correta.
- O histórico não requer intervenção, pois no Postgres (dashboard base) a agregação ocorre via Join SQL numérico, imune ao bug de tipagem do Pandas.
