-- FASE 1: INFRAESTRUTURA COMPLETA - Sistema de Petições em Massa (Corrigido)

-- ==============================================
-- 1. EXTENSÕES E TIPOS
-- ==============================================

-- Tipo enum para perfis de segurada
CREATE TYPE public.perfil_segurada AS ENUM ('especial', 'urbana');

-- Tipo enum para status de casos
CREATE TYPE public.case_status AS ENUM ('intake', 'pending_docs', 'validating', 'analyzing', 'ready', 'drafted', 'exported');

-- Tipo enum para tipos de documentos
CREATE TYPE public.document_type AS ENUM (
  'CNIS', 'CERTIDAO', 'CAF', 'DAP', 'NOTA_PRODUTOR', 
  'ITR', 'CCIR', 'DECL_SINDICAL', 'COMPROV_RESID', 
  'FOTOS', 'OUTROS'
);

-- Tipo enum para tipos de eventos
CREATE TYPE public.event_type AS ENUM ('parto', 'adocao', 'guarda');

-- ==============================================
-- 2. TABELA: cases (expandida)
-- ==============================================

CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação da autora
  author_name TEXT NOT NULL,
  author_cpf TEXT NOT NULL,
  author_birth_date DATE,
  author_address TEXT,
  author_phone TEXT,
  author_whatsapp TEXT,
  author_marital_status TEXT,
  
  -- Evento (parto/adoção/guarda)
  event_type event_type NOT NULL DEFAULT 'parto',
  event_date DATE NOT NULL,
  dum DATE, -- Data da Última Menstruação (para validação gestacional)
  
  -- Perfil e status
  profile perfil_segurada NOT NULL DEFAULT 'especial',
  status case_status NOT NULL DEFAULT 'intake',
  
  -- Requerimento Administrativo (RA)
  has_ra BOOLEAN DEFAULT false,
  ra_protocol TEXT,
  ra_request_date DATE,
  ra_denial_date DATE,
  ra_denial_reason TEXT,
  
  -- RMI e Valor da Causa
  salario_minimo_ref DECIMAL(10,2) DEFAULT 1412.00,
  rmi_calculated DECIMAL(10,2),
  valor_causa DECIMAL(10,2),
  
  -- Controle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_cases_status ON public.cases(status);
CREATE INDEX idx_cases_profile ON public.cases(profile);
CREATE INDEX idx_cases_created_at ON public.cases(created_at DESC);
CREATE INDEX idx_cases_event_date ON public.cases(event_date);

-- RLS (público para MVP)
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.cases FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 3. TABELA: documents
-- ==============================================

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  
  -- Arquivo
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  
  -- Tipo obrigatório
  document_type document_type NOT NULL,
  
  -- Metadados EXIF (para fotos)
  exif_data JSONB,
  
  -- Controle
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_case_id ON public.documents(case_id);
CREATE INDEX idx_documents_type ON public.documents(document_type);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.documents FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 4. TABELA: extractions (dados extraídos)
-- ==============================================

CREATE TABLE public.extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  
  -- Texto bruto extraído
  raw_text TEXT,
  
  -- Entidades estruturadas por tipo de documento
  entities JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Períodos rurais extraídos (se aplicável)
  periodos_rurais JSONB DEFAULT '[]'::jsonb,
  
  -- Observações da IA
  observations TEXT[],
  
  -- Controle
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_extractions_case_id ON public.extractions(case_id);
CREATE INDEX idx_extractions_document_id ON public.extractions(document_id);

ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.extractions FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 5. TABELA: document_validation (matriz de suficiência)
-- ==============================================

CREATE TABLE public.document_validation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  
  -- Pontuação
  score INTEGER NOT NULL DEFAULT 0,
  threshold INTEGER NOT NULL DEFAULT 7,
  is_sufficient BOOLEAN NOT NULL DEFAULT false,
  
  -- Documentos faltantes
  missing_docs JSONB DEFAULT '[]'::jsonb,
  
  -- Checklist personalizado
  checklist JSONB DEFAULT '[]'::jsonb,
  
  -- Detalhamento
  validation_details JSONB,
  
  -- Controle
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_validation_case_id ON public.document_validation(case_id);

ALTER TABLE public.document_validation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.document_validation FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 6. TABELA: timeline_events (linha do tempo probatória)
-- ==============================================

CREATE TABLE public.timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  
  -- Evento
  event_date DATE NOT NULL,
  event_description TEXT NOT NULL,
  
  -- Fonte probatória
  source_document_type document_type,
  source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  
  -- Controle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_timeline_case_id ON public.timeline_events(case_id);
CREATE INDEX idx_timeline_event_date ON public.timeline_events(event_date);

ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.timeline_events FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 7. TABELA: case_analysis (análise jurídica com auditoria)
-- ==============================================

CREATE TABLE public.case_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  
  -- Análise
  qualidade_segurada TEXT,
  carencia JSONB, -- {cumprida: bool, dispensa: bool, fundamento: text}
  vinculo_rural_comprovado BOOLEAN DEFAULT false,
  
  -- RMI e Valor da Causa
  rmi JSONB, -- {tipo: 'sm'|'media', valor: number}
  valor_causa DECIMAL(10,2),
  
  -- Lacunas e pendências
  lacunas TEXT[],
  
  -- Fundamentos normativos
  fundamentos TEXT[],
  
  -- Audit trail (raciocínio passo a passo da IA)
  audit_trail TEXT,
  
  -- Payload para minuta
  draft_payload JSONB,
  
  -- Controle
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_case_id ON public.case_analysis(case_id);

ALTER TABLE public.case_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.case_analysis FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 8. TABELA: jurisprudencias (RAG - sem embedding por ora)
-- ==============================================

CREATE TABLE public.jurisprudencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  tribunal TEXT NOT NULL, -- STJ, TNU, TRF1, etc.
  processo_numero TEXT,
  
  -- Conteúdo
  tese TEXT NOT NULL,
  ementa TEXT,
  trecho_chave TEXT, -- até 60 palavras
  
  -- Metadados
  data_decisao DATE,
  link TEXT,
  tags TEXT[],
  tema TEXT,
  
  -- Controle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_juris_tribunal ON public.jurisprudencias(tribunal);
CREATE INDEX idx_juris_tema ON public.jurisprudencias(tema);
CREATE INDEX idx_juris_tags ON public.jurisprudencias USING GIN(tags);

ALTER TABLE public.jurisprudencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura para todos (MVP)" ON public.jurisprudencias FOR SELECT USING (true);

-- Tabela de relação: casos x jurisprudências selecionadas
CREATE TABLE public.case_jurisprudencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  jurisprudencia_id UUID NOT NULL REFERENCES public.jurisprudencias(id) ON DELETE CASCADE,
  relevance_score DECIMAL(3,2), -- 0.00 a 1.00
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, jurisprudencia_id)
);

CREATE INDEX idx_case_juris_case_id ON public.case_jurisprudencias(case_id);

ALTER TABLE public.case_jurisprudencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.case_jurisprudencias FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 9. TABELA: drafts (minutas)
-- ==============================================

CREATE TABLE public.drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  
  -- Conteúdo
  markdown_content TEXT, -- preview para copiar/colar
  html_content TEXT, -- preview renderizado
  
  -- Payload completo para DOCX
  payload JSONB NOT NULL,
  
  -- Arquivo DOCX gerado
  docx_path TEXT,
  
  -- Versão
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Controle
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drafts_case_id ON public.drafts(case_id);

ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.drafts FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 10. TABELA: templates (modelos DOCX)
-- ==============================================

CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  name TEXT NOT NULL,
  description TEXT,
  
  -- Arquivo
  template_path TEXT NOT NULL,
  
  -- Mapeamento de placeholders
  placeholder_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Controle de versão
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  
  -- Controle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_templates_active ON public.templates(is_active);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.templates FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 11. TABELA: batch_jobs (processamento em lote)
-- ==============================================

CREATE TABLE public.batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  name TEXT NOT NULL,
  total_cases INTEGER NOT NULL DEFAULT 0,
  processed_cases INTEGER NOT NULL DEFAULT 0,
  successful_cases INTEGER NOT NULL DEFAULT 0,
  failed_cases INTEGER NOT NULL DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  
  -- Origem
  source TEXT, -- dropbox, zip, manual
  
  -- Controle
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_batch_jobs_status ON public.batch_jobs(status);
CREATE INDEX idx_batch_jobs_created_at ON public.batch_jobs(created_at DESC);

ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.batch_jobs FOR ALL USING (true) WITH CHECK (true);

-- Tabela de itens do batch
CREATE TABLE public.batch_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_job_id UUID NOT NULL REFERENCES public.batch_jobs(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  
  -- Status individual
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,
  
  -- Controle
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_batch_items_job_id ON public.batch_job_items(batch_job_id);
CREATE INDEX idx_batch_items_status ON public.batch_job_items(status);

ALTER TABLE public.batch_job_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.batch_job_items FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 12. TABELA: dropbox_sync (integração Dropbox)
-- ==============================================

CREATE TABLE public.dropbox_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dropbox
  dropbox_path TEXT NOT NULL,
  dropbox_file_id TEXT,
  last_sync_at TIMESTAMPTZ,
  
  -- Caso vinculado
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  
  -- Status
  sync_status TEXT NOT NULL DEFAULT 'pending', -- pending, syncing, completed, failed
  error_message TEXT,
  
  -- Controle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dropbox_sync_case_id ON public.dropbox_sync(case_id);
CREATE INDEX idx_dropbox_sync_status ON public.dropbox_sync(sync_status);

ALTER TABLE public.dropbox_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo para todos (MVP)" ON public.dropbox_sync FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 13. STORAGE BUCKETS
-- ==============================================

-- Bucket para documentos de casos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('case-documents', 'case-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket para minutas geradas (DOCX)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('generated-drafts', 'generated-drafts', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket para templates DOCX
INSERT INTO storage.buckets (id, name, public) 
VALUES ('templates', 'templates', false)
ON CONFLICT (id) DO NOTHING;

-- RLS para storage (público para MVP)
CREATE POLICY "Permitir upload para todos (MVP)" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id IN ('case-documents', 'generated-drafts', 'templates'));

CREATE POLICY "Permitir leitura para todos (MVP)" 
ON storage.objects FOR SELECT 
USING (bucket_id IN ('case-documents', 'generated-drafts', 'templates'));

CREATE POLICY "Permitir delete para todos (MVP)" 
ON storage.objects FOR DELETE 
USING (bucket_id IN ('case-documents', 'generated-drafts', 'templates'));

-- ==============================================
-- 14. TRIGGERS PARA updated_at
-- ==============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();