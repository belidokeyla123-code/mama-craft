-- Adicionar campo manual_benefits na tabela cases
ALTER TABLE public.cases 
ADD COLUMN IF NOT EXISTS manual_benefits jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.cases.manual_benefits IS 'Benefícios recebidos adicionados manualmente pelo usuário (não detectados no CNIS)';