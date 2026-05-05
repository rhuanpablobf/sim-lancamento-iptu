# Dicionário de Dados — Tabela de Lançamento IPTU
**Tabela:** `SIA_LANCIPTU_A2`

---

## Campos Raiz

| Campo | Tipo | Descrição |
|---|---|---|
| `INFO_STATUS_LAN` | N2,0 | Status do lançamento: `NULL` ou `1` = Ativo, `2` = Inativo |
| `TIPO_IMPOSTO_LAN` | N1,0 | Tipo do imposto: `1` = Predial, `2` = Territorial |
| `TIPO_LANCAMENTO_LAN` | N1,0 | Tipo do lançamento: `0` = Normal, `1` = Isento, `2` = Imposto Mínimo, `3` = IPTU Social |
| `DATA_LANCAMENTO_LAN` | N8,0 | Data de lançamento do tributo no formato `AAAAMMDD` |
| `NUMR_PROCESSO_LAN` | N8,0 | Número do processo para efeito de revisão de lançamento |
| `NUMR_CIM_CONTRIBUINTE_LAN` | N7,0 | Número de matrícula do contribuinte no Cadastro de Identidade Municipal |
| `NOME_CONTRIBUINTE_LAN` | A70,0 | Nome do contribuinte para o qual foi feito o lançamento |
| `DATA_VENCIMENTO_LAN` | N8,0 | Data de vencimento da primeira parcela ou parcela única do tributo lançado |
| `NUMR_PARCELAS_LAN` | N2,0 | Número de parcelas em que foram lançados o tributo |
| `NUMR_AGRUPADOS_LAN` | P3,0 | Total de sublotes acumulados nesta inscrição quando do lançamento do tributo |
| `VALR_VENAL_CALC_LAN` | P13,2 | Valor venal calculado para o imóvel, quando substituído pelo valor venal declarado pelo contribuinte |
| `NUMR_SEQUENCIA_LAN` | N2,0 | Sequência de lançamento do tributo para o mesmo imóvel no mesmo ano de exercício. O lançamento original tem sequência `00` |
| `CODG_INSCRICAO_LAN` | N14,0 | Campo descritor de acesso ao arquivo contendo a inscrição cadastral do imóvel |
| `CODG_EXERCICIO_LAN` | N4,0 | Campo descritor de acesso ao arquivo contendo o ano de exercício fiscal referente ao lançamento |
| `INFO_ZONA_LAN` | N1,0 | Informa a zona a que pertencia o imóvel no momento do lançamento |
| `INFO_USO_LAN` | N1,0 | Tipo de uso do imóvel: `1` = Residencial, `2` = Atividade Econômica, `3` = Religioso, `4` = Atividade Pública, `5` = Agro-Pastoril/Horti-Fruti |
| `INFO_GARAGEM_IMOVEL_LAN` | A4,0 *(até 5 ocorrências)* | Faz parte do endereço. Usado quando a mesma inscrição serve para o apartamento e os boxes |
| `VALR_APROVEIT_LAN` | N11,2 | Valor pago e que foi aproveitado |
| `CODG_EDIFICIO_LAN` | N5,0 | Código do edifício do endereço do imóvel, caso a inscrição seja de um edifício |
| `INFO_RENEG_LAN` | N1,0 | Indica se houve renegociação de quantidade de parcelas (programa de parcelamento IPTU ano corrente) |
| `NUMR_PARCELAS_COSIP_LAN` | N2,0 | Número de parcelas COSIP. A COSIP é cobrada na parcela única ou 1ª parcela do imposto territorial |
| `VALR_COSIP_INDEX_LAN` | P7,4 | Valor COSIP a recolher do imóvel convertido para o indexador usado na época do lançamento (UVFG, etc.) |
| `QTDE_AREA_ZPA_LAN` | P8,2 | Área da Zona de Preservação Ambiental |
| `NUMR_PARC_APROVEIT_LAN` | P3,0 | Número de parcelas do aproveitamento de crédito |
| `INFO_TIPO_EDF_LAN` | N2,0 *(até 2 ocorrências)* | Tipo de edificação: `1` = Casa/Sobrado, `2` = Apartamento, `3` = Barracão, `4` = Loja, `5` = Sala/Escritório, `6` = Galpão Comum, `7` = Galpão Industrial, `8` = Telheiro, `9` = Edificação em Altura, `10` = Especial, `11` = Garagem, `12` = Condomínio, `13` = Escaninho, `14` = Sobrado |
| `INFO_ESCANINHO_IMOVEL_LAN` | A3,0 *(até 4 ocorrências)* | Número do escaninho do imóvel |
| `INFO_CRED_DIF_LAN` | N1,0 | Créditos Diferenciados (CCD): `0` = Não existe, `1` = Existe créditos diferenciados |
| `INFO_QUADRA_AV_LAN` | A6,0 | Quadra do endereço para contato |
| `INFO_LOTE_AV_LAN` | A6,0 | Lote do endereço para contato |
| `LIVRE` | N1,0 | Campo livre |
| `QTDE_AREA_EDIF_TOTAL_LAN` | P7,2 | Somatório da área edificada em m² de todos os sublotes *(campo em desuso nesta tabela; usar `QTDE_AREA_EDIFTOTAL_SQL` na tabela `IPT_INFOLOTE_A`)* |
| `VALR_AREA_TERRENO_LAN` | P13,2 | Valor da área do terreno |
| `VALR_AREA_EDIFICADA_LAN` | P13,2 | Valor da área edificada |
| `VALR_DESCONTO_NFGYN_LAN` | P11,2 | Valor do desconto Nota GYN |
| `NUMR_SUBLOTE_PRINC_LAN` | N4,0 | Número do sublote principal (apenas para imóvel englobado) |
| `CODG_INSCR_ENGLOBADO_LAN` | N14,0 | Número da inscrição englobada |
| `CODG_EXERC_ENGLOBADO_LAN` | N4,0 | Ano exercício englobado |
| `CODG_TIPO_CCD_LAN` | N3,0 | Código CCD |
| `VALR_ALIQUOTA_ORIG_LAN` | P2,5 | Valor da alíquota original |
| `VALR_IMPOSTO_ORIG_LAN` | P11,2 | Valor do imposto original |
| `VALR_ALIQUOTA_CCD_LAN` | P2,7 | Valor da alíquota do CCD |

---

## GR 1 — `ENDR_IMOVEL_LAN` · Endereço do Imóvel

| Campo | Tipo | Descrição |
|---|---|---|
| `NOME_LOGRAD_IMOVEL_LAN` | A25,0 | Nome do logradouro onde está localizado o imóvel |
| `CODG_LOGRAD_IMOVEL_LAN` | N5,0 | Código do logradouro de localização do imóvel |
| `NUMR_IMOVEL_LAN` | A7,0 | Número oficial do imóvel |
| `INFO_COMPLEM_IMOVEL_LAN` | A15,0 | Complemento do endereço do imóvel (apto, sala, fundos, etc.) |
| `INFO_QUADRA_LOTEAM_LAN` | A6,0 | Código alfanumérico que identifica a quadra |
| `INFO_LOTE_LOTEAM_LAN` | A6,0 | Código alfanumérico que identifica o lote |
| `CODG_BAIRRO_IMOVEL_LAN` | N4,0 | Código do bairro onde se localiza o imóvel |

---

## GR 1 — `ENDR_AVISO_LAN` · Endereço de Contato do Contribuinte

| Campo | Tipo | Descrição |
|---|---|---|
| `INFO_MESMO_IMOVEL_LAN` | N1,0 | Informa se é o mesmo endereço do imóvel: `0` = Outro endereço, `1` = Mesmo endereço |
| `NOME_LOGRAD_AV_LAN` | A25,0 | Nome do logradouro do endereço de contato |
| `CODG_LOGRAD_AV_LAN` | N5,0 | Código do logradouro do endereço de contato |
| `NUMR_IMOVEL_AV_LAN` | A7,0 | Número do imóvel do endereço de contato |
| `CODG_BAIRRO_AV_LAN` | N4,0 | Código do bairro do endereço de contato |
| `NOME_BAIRRO_AV_LAN` | A25,0 | Nome do bairro do endereço de contato |
| `INFO_COMPLEM_AV_LAN` | A15,0 | Complemento do endereço de contato (apto, sala, etc.) |
| `CODG_MUNICIPIO_AV_LAN` | N7,0 | Código do município (c/ dígito) do endereço de contato |
| `NUMR_CEP_AV_LAN` | N8,0 | Número do CEP do endereço de contato |

---

## GR 1 — `INFO_DADOS_CALCULO_LAN` · Dados de Cálculo do Tributo

| Campo | Tipo | Descrição |
|---|---|---|
| `INFO_POSICAO_FISCAL_LAN` | N1,0 | Posição fiscal do imóvel na época do lançamento: `0` = Normal, `1` = Imunidade, `2` = Isento IPTU/Taxas, `3` = Isento de Contribuição de Melhoria, `4` = Isenção Total, `5` = Não Incidente |
| `QTDE_AREA_TERRENO_LAN` | P8,2 | Área do terreno onde se situa o imóvel |
| `QTDE_AREA_EDIFICADA_LAN` | P7,2 | Área edificada do imóvel na época do lançamento |
| `NUMR_FRACAO_IDEAL_LAN` | P3,5 | Fração ideal do terreno calculada para os sublotes |
| `VALR_VENAL_LAN` | P13,2 | Valor venal do imóvel usado para o cálculo do tributo |
| `VALR_ALIQUOTA_LAN` | P2,5 | Valor da alíquota aplicada sobre o valor venal para cálculo do imposto |

---

## GR 1 — `INFO_VALORES_CALCULO_LAN` · Resultados do Cálculo do Tributo

| Campo | Tipo | Descrição |
|---|---|---|
| `VALR_TOTAL_LAN` | P11,2 | Valor total do tributo a recolher para o imóvel |
| `TIPO_INDICE_LAN` | N2,0 | Código do indexador usado para converter o valor total do tributo |
| `VALR_TOTAL_INDEX_LAN` | P7,4 | Valor total do tributo convertido para o indexador usado na época do lançamento (UVFG, etc.) |
| `VALR_IMPOSTO_LAN` | P11,2 | Valor do imposto calculado para o imóvel |
| `VALR_TAXA_SERVICOS_LAN` | P7,2 | Valor da taxa de serviços urbanos lançada para o imóvel |
| `VALR_TAXA_ILUMINAC_LAN` | P7,2 | Valor da taxa de iluminação pública lançada para o imóvel |
| `VALR_TAXA_EXPED_LAN` | P5,2 | Valor da taxa de expediente cobrada no lançamento do tributo |

---

## GR 1 — `INFO_CONTRIBUINTE_LAN` · Informações do Contribuinte

| Campo | Tipo | Descrição |
|---|---|---|
| `INFO_CPF_CGC_LAN` | N14,0 | CPF/CGC do contribuinte |
| `DATA_NASCIMENTO_LAN` | N8,0 | Data de nascimento do proprietário |
| `NOME_MAE_LAN` | A70,0 | Nome da mãe do proprietário |

---

## GR 1 — `INFO_IMOVEL_LAN` · Informações sobre o Imóvel

| Campo | Tipo | Descrição |
|---|---|---|
| `INFO_OCUPACAO_LAN` | N1,0 | Forma de ocupação: `1` = Edificado, `2` = Vago, `3` = Edificação Temporária, `4` = Em Construção, `5` = Construção Paralisada, `6` = Em Demolição, `7` = Ruínas, `8` = Praça |
| `INFO_PROPRIEDADE_LAN` | N1,0 | Propriedade do imóvel: `1` = Particular, `2` = Religioso, `3` = Municipal, `4` = Estadual, `5` = Federal |

---

## GR 1 — `INFO_EDF_LAN` · Características da Edificação

| Campo | Tipo | Descrição |
|---|---|---|
| `INFO_POSICAO_EDF_LAN` | N1,0 | Posição da edificação: `1` = Isolada, `2` = Semi-isolada, `3` = Conjugada, `4` = Geminada, `5` = Coletiva |
| `INFO_ESTRUTURA_LAN` | N1,0 | Estrutura: `1` = Alvenaria, `2` = Concreto, `3` = Mista, `4` = Madeira, `5` = Metálica, `6` = Adobe, `7` = Taipa |
| `INFO_ESQUADRIA_LAN` | N1,0 | Tipo de esquadrias: `1` = Ferro, `2` = Alumínio, `3` = Madeira, `4` = Rústica, `5` = Especial, `6` = Sem |
| `INFO_PISO_LAN` | N1,0 | Tipo de piso: `1` = Cerâmica, `2` = Cimento, `3` = Taco, `4` = Tijolo, `5` = Terra, `6` = Especial |
| `INFO_FORRO_LAN` | N1,0 | Tipo de forro: `1` = Cerâmica, `2` = Cimento, `3` = Taco, `4` = Tijolo, `5` = Terra, `6` = Especial |
| `INFO_INST_ELET_LAN` | N1,0 | Instalação elétrica: `1` = Embutida, `2` = Semi-embutida, `3` = Externa, `4` = Sem |
| `INFO_INST_SANIT_LAN` | N1,0 | Instalação sanitária: `1` = Interna, `2` = Completa, `3` = Mais de uma, `4` = Externa, `5` = Sem |
| `INFO_REV_INTERNO_LAN` | N1,0 | Revestimento interno: `1` = Reboco, `2` = Massa, `3` = Material Cerâmico, `4` = Especial, `5` = Sem |
| `INFO_AC_INTERNO_LAN` | N1,0 | Acabamento interno: `1` = Pintura Lavável, `2` = Pintura Simples, `3` = Caiação, `4` = Especial, `5` = Sem |
| `INFO_REV_EXTERNO_LAN` | N1,0 | Revestimento externo: `1` = Reboco, `2` = Massa, `3` = Material Cerâmico, `4` = Especial, `5` = Sem |
| `INFO_AC_EXTERNO_LAN` | N1,0 | Acabamento externo: `1` = Pintura Lavável, `2` = Pintura Simples, `3` = Caiação, `4` = Especial, `5` = Sem |
| `INFO_COBERTURA_LAN` | N1,0 | Cobertura: `1` = Telha de Barro, `2` = Fibro-cimento, `3` = Alumínio, `4` = Zinco, `5` = Laje, `6` = Palha, `7` = Especial |
| `INFO_CONSERVACAO_LAN` | N1,0 | Estado de conservação: `1` = Boa, `2` = Regular, `3` = Ruim, `4` = Péssima |
| `QTDE_PONTOS_EDF_LAN` | N3,0 | Quantidade de pontos da edificação |
| `VALR_M2_EDF_LAN` | N7,2 | Valor do metro quadrado (m²) da edificação |

---

## GR 1 — `INFO_TERRENO_LAN` · Características do Terreno

| Campo | Tipo | Descrição |
|---|---|---|
| `INFO_SITUACAO_LAN` | N1,0 | Situação do imóvel: `1` = Meio de Quadra, `2` = Esquina, `3` = Toda a Quadra, `4` = Encravado, `5` = Gleba |
| `VALR_FC_SITUACAO_LAN` | N1,2 | Fator de correção da situação do imóvel |
| `INFO_TOPOGRAFIA_LAN` | N1,0 | Topografia do terreno: `1` = Horizontal, `2` = Aclive, `3` = Declive |
| `VALR_FC_TOPOGRAFIA_LAN` | N1,2 | Fator de correção da topografia do terreno |
| `INFO_NIVEL_LAN` | N1,0 | Nível do terreno: `1` = Ao nível, `2` = Acima, `3` = Abaixo |
| `VALR_FC_NIVEL_LAN` | N1,2 | Fator de correção do nível do terreno |
| `INFO_SOLO_LAN` | N1,0 | Tipo de solo: `1` = Normal, `2` = Rochoso, `3` = Arenoso, `4` = Alagadiço |
| `VALR_FC_SOLO_LAN` | N1,2 | Fator de correção do solo |
| `NUMR_FRENTES_LAN` | P1,0 | Número de frentes do imóvel |
| `VALR_FC_FRENTES_LAN` | N1,2 | Fator de correção de frente do imóvel |
| `VALR_FC_GLEBA_LAN` | N2,4 | Fator de correção gleba |
| `VALR_M2_TERRENO_LAN` | P7,2 | Valor do m² do terreno |
| `VALR_M2_ZPA_LAN` | P7,2 | Valor do m² da ZPA (Planta de Valores) |

---

## PE 1 — `INFO_REVISAO_LAN` · Revisões do Lançamento *(grupo periódico)*

> O número da ocorrência indica o número da revisão. Sem nenhuma ocorrência = lançamento original.

| Campo | Tipo | Descrição |
|---|---|---|
| `NUMR_MATRICULA_REV_LAN` | N9,0 | Número da matrícula do responsável pela revisão do lançamento |
| `DATA_REVISAO_LAN` | N8,0 | Data da revisão no formato `AAAAMMDD` |
| `INFO_NOTIFICACAO_LAN` | N1,0 | `1` = Isento, `2` = Normal |

---

## PE 1 — `INFO_ABERTURA_DATA_LAN` · Abertura das Datas de Vencimento *(grupo periódico)*

| Campo | Tipo | Descrição |
|---|---|---|
| `NUMR_MATRICULA_ABERT_LAN` | N9,0 | Número da matrícula do responsável pela abertura das datas de vencimento |
| `DATA_ABERTURA_LAN` | N8,0 | Data da abertura das datas de vencimento no formato `AAAAMMDD` |
