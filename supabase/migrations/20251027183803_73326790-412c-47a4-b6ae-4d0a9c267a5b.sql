-- Adicionar novos status ao enum case_status
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'protocolada';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'em_audiencia';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'acordo';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'sentenca';

-- Tabela para controle financeiro
CREATE TABLE IF NOT EXISTS public.case_financial (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  valor_causa NUMERIC(12,2),
  valor_recebido NUMERIC(12,2),
  data_protocolo DATE,
  data_recebimento DATE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para timeline processual
CREATE TABLE IF NOT EXISTS public.case_timeline (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  fase TEXT NOT NULL,
  data_fase DATE NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para cache de jurisprudências
CREATE TABLE IF NOT EXISTS public.jurisprudence_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_hash TEXT UNIQUE NOT NULL,
  profile perfil_segurada NOT NULL,
  event_type event_type NOT NULL,
  results JSONB NOT NULL,
  hits INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar campos de chat à tabela extractions
ALTER TABLE public.extractions 
ADD COLUMN IF NOT EXISTS chat_messages JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS auto_filled_fields JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS missing_fields TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Enable RLS
ALTER TABLE public.case_financial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurisprudence_cache ENABLE ROW LEVEL SECURITY;

-- Políticas RLS simples para MVP (permitir tudo)
CREATE POLICY "Permitir tudo para todos (MVP)"
ON public.case_financial FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir tudo para todos (MVP)"
ON public.case_timeline FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir leitura para todos (MVP)"
ON public.jurisprudence_cache FOR SELECT
USING (true);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_case_financial_case_id ON public.case_financial(case_id);
CREATE INDEX IF NOT EXISTS idx_case_financial_status ON public.case_financial(status);
CREATE INDEX IF NOT EXISTS idx_case_timeline_case_id ON public.case_timeline(case_id);
CREATE INDEX IF NOT EXISTS idx_case_timeline_fase ON public.case_timeline(fase);
CREATE INDEX IF NOT EXISTS idx_jur_cache_hash ON public.jurisprudence_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_jur_cache_profile_event ON public.jurisprudence_cache(profile, event_type);

-- Triggers para updated_at
CREATE TRIGGER update_case_financial_updated_at
BEFORE UPDATE ON public.case_financial
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar campo para indicar se caso foi iniciado pelo chat
ALTER TABLE public.cases 
ADD COLUMN IF NOT EXISTS started_with_chat BOOLEAN DEFAULT false;