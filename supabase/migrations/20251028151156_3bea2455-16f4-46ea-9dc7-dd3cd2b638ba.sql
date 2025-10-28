-- ABORDAGEM SIMPLIFICADA: Adicionar campo video_analysis e garantir que o enum tenha todos os valores

-- 1. Adicionar campo video_analysis
ALTER TABLE public.cases 
  ADD COLUMN IF NOT EXISTS video_analysis JSONB DEFAULT NULL;

COMMENT ON COLUMN public.cases.video_analysis IS 'Análise de vídeos/depoimentos feita pela IA';

-- 2. Para o enum document_type, vamos adicionar os valores que possam estar faltando
-- OBS: Isso só funciona se o enum ainda não tiver esses valores. Se já tiver, vai dar erro mas podemos ignorar.

-- Adicionar valores ao enum existente (se não existirem)
DO $$
BEGIN
  -- Tentar adicionar cada valor, ignorando erro se já existir
  BEGIN
    ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'cnis';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'ficha_atendimento';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'carteira_pescador';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'historico_escolar';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'declaracao_saude_ubs';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END$$;