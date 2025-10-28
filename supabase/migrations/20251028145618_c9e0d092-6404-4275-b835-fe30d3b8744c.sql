-- Fase 1: Adicionar campos de hash tracking
ALTER TABLE case_analysis ADD COLUMN IF NOT EXISTS last_document_hash text;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS last_analysis_hash text;

-- Fase 2: Criar tabela de resultados de jurisprudência
CREATE TABLE IF NOT EXISTS jurisprudence_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES cases(id) NOT NULL,
  results jsonb NOT NULL,
  selected_ids jsonb DEFAULT '[]'::jsonb,
  last_case_hash text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_juris_results_case_id ON jurisprudence_results(case_id);

-- Fase 3: Criar tabela de teses jurídicas
CREATE TABLE IF NOT EXISTS teses_juridicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES cases(id) NOT NULL,
  teses jsonb NOT NULL,
  selected_ids text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teses_case_id ON teses_juridicas(case_id);

-- Habilitar RLS
ALTER TABLE jurisprudence_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE teses_juridicas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (MVP - permitir tudo)
CREATE POLICY "Permitir tudo para todos (MVP)" ON jurisprudence_results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo para todos (MVP)" ON teses_juridicas FOR ALL USING (true) WITH CHECK (true);