-- ============================================================
-- SCRIPT: Corrigir faixas territoriais em sim_faixas_referencia
-- DATA: 2026-05-11 (Atualizado: Unificação de Códigos)
-- MOTIVO: Unificar faixas de 2022 com 2023+ para exibição em linha única no dashboard.
-- ============================================================

-- PASSO 1: Inserir faixas territoriais da lei anterior (vigente em 2022)
-- Usamos os MESMOS códigos (TER-F1 a TER-F7) das faixas atuais para que o
-- dashboard agrupe os imóveis na mesma linha, mesmo com alíquotas diferentes.

INSERT INTO sim_faixas_referencia
  (categoria, faixa_codigo, faixa_label, faixa_ordem, aliquota, tipo_imposto, limite_inferior, limite_superior)
VALUES
  ('TERRITORIAL', 'TER-F1', 'Faixa 1 — Até R$ 40.000',  1, 0.02000, 2,      0.00,  40000.00),
  ('TERRITORIAL', 'TER-F2', 'Faixa 2 — R$ 40k a R$ 60k', 2, 0.02300, 2,  40000.01,  60000.00),
  ('TERRITORIAL', 'TER-F3', 'Faixa 3 — R$ 60k a R$ 80k', 3, 0.02600, 2,  60000.01,  80000.00),
  ('TERRITORIAL', 'TER-F4', 'Faixa 4 — R$ 80k a R$ 100k',4, 0.02900, 2,  80000.01, 100000.00),
  ('TERRITORIAL', 'TER-F5', 'Faixa 5 — R$ 100k a R$ 150k',5, 0.03200, 2, 100000.01, 150000.00),
  ('TERRITORIAL', 'TER-F6', 'Faixa 6 — R$ 150k a R$ 300k',6, 0.03500, 2, 150000.01, 300000.00),
  ('TERRITORIAL', 'TER-F7', 'Faixa 7 — Acima de R$ 300k', 7, 0.03800, 2, 300000.01,      NULL);


-- PASSO 2: Inserir variação de arredondamento (0.00990 ≈ 1%)
-- Também unificado no código TER-F1

INSERT INTO sim_faixas_referencia
  (categoria, faixa_codigo, faixa_label, faixa_ordem, aliquota, tipo_imposto, limite_inferior, limite_superior)
VALUES
  ('TERRITORIAL', 'TER-F1', 'Faixa 1 — Até R$ 40.000', 1, 0.00990, 2, 0.00, 40000.00);


-- VERIFICAÇÃO: Execute após os INSERTs para confirmar o estado da tabela
-- SELECT categoria, faixa_codigo, faixa_label, aliquota
-- FROM sim_faixas_referencia
-- ORDER BY categoria, faixa_codigo, aliquota;
