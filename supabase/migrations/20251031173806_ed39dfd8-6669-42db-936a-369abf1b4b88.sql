-- Adicionar colunas para armazenar análises na tabela drafts
ALTER TABLE public.drafts 
ADD COLUMN IF NOT EXISTS judge_analysis JSONB,
ADD COLUMN IF NOT EXISTS regional_adaptation JSONB,
ADD COLUMN IF NOT EXISTS appellate_analysis JSONB;

-- Adicionar comentários para documentar as colunas
COMMENT ON COLUMN public.drafts.judge_analysis IS 'Análise do Módulo Juiz com brechas, pontos fortes/fracos, recomendações';
COMMENT ON COLUMN public.drafts.regional_adaptation IS 'Análise de adaptação regional/TRF';
COMMENT ON COLUMN public.drafts.appellate_analysis IS 'Análise para recurso/tribunal de segunda instância';