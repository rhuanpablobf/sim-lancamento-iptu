# CHANGELOG

## [Unreleased]
### Correções (Fix)
- **Motor de Simulação (IPTU)**:
  - Corrigido problema em `motor_simulacao.py` que causava a alocação de todos os imóveis projetados para 2027+ na categoria tributária errada (`RESIDENCIAL`) devido a falha de tipagem do Pandas. Implementado `pd.to_numeric` para normalizar strings SQL antes de aplicar as condições vetorizadas.
  - Corrigido o descasamento e agrupamento com "Faixa None" (exibido na categoria `TERRITORIAL` da distribuição no dashboard). Agora, faixas sem código de categoria (como no Territorial da base de Goiânia) são alocadas de forma blindada no fallback de string via `"UNICA"`, além de inserção consistente do `faixa_label`.
  - Corrigido bug de loop plurianual de simulação que causava explosão no valor do "IPTU Social" devido à não limpeza de colunas antigas (`valr_venal_social_base`), resultando em duplicidade e reuso do valor defasado em cálculos futuros.

### Documentação
- Elaborado e adicionado `doc/relatorio_anomalia_iptu_social.md` e `doc/relatorio_anomalia_faixas_aliquota.md` com as evidências de solução.
