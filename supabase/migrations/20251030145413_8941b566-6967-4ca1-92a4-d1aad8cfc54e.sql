-- Adicionar colunas de validação financeira na tabela quality_reports
ALTER TABLE quality_reports 
ADD COLUMN IF NOT EXISTS jurisdicao_ok boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS competencia text,
ADD COLUMN IF NOT EXISTS valor_causa_validado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS valor_causa_referencia numeric;

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_quality_reports_case_id ON quality_reports(case_id);