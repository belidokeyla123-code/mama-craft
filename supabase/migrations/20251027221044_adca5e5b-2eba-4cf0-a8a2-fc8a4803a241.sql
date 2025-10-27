-- Adicionar colunas para períodos rurais, urbanos e histórico de salário mínimo
ALTER TABLE cases ADD COLUMN IF NOT EXISTS rural_periods jsonb DEFAULT '[]'::jsonb;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS urban_periods jsonb DEFAULT '[]'::jsonb;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS salario_minimo_history jsonb DEFAULT '[]'::jsonb;