-- Criar tabela para relatórios de qualidade
CREATE TABLE quality_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  issues JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL,
  jurisdicao_validada JSONB,
  enderecamento_ok BOOLEAN DEFAULT true,
  dados_completos BOOLEAN DEFAULT true,
  campos_faltantes TEXT[] DEFAULT ARRAY[]::TEXT[],
  jurisdicao_confianca TEXT,
  fonte TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quality_reports_case_id ON quality_reports(case_id);
CREATE INDEX idx_quality_reports_document_type ON quality_reports(document_type);

-- Enable RLS
ALTER TABLE quality_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo para todos (MVP)" ON quality_reports
  FOR ALL USING (true) WITH CHECK (true);