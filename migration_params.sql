ALTER TABLE sim_simulacao_parametros_utilizados 
ADD COLUMN IF NOT EXISTS ipca_ano NUMERIC(10, 6),
ADD COLUMN IF NOT EXISTS selic_ano NUMERIC(10, 6),
ADD COLUMN IF NOT EXISTS tipo_indice_social VARCHAR(10),
ADD COLUMN IF NOT EXISTS tipo_indice_minimo VARCHAR(10),
ADD COLUMN IF NOT EXISTS tipo_indice_faixa VARCHAR(10);
