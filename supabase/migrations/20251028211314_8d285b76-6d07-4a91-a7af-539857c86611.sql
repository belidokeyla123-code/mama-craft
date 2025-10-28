-- Adicionar campos de CPF da mãe e pai à tabela cases
ALTER TABLE public.cases 
ADD COLUMN IF NOT EXISTS mother_cpf TEXT,
ADD COLUMN IF NOT EXISTS father_cpf TEXT;

COMMENT ON COLUMN public.cases.mother_cpf IS 'CPF da mãe extraído da certidão de nascimento';
COMMENT ON COLUMN public.cases.father_cpf IS 'CPF do pai extraído da certidão de nascimento';