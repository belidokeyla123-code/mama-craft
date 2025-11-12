-- Criar tabela de log de conversões de PDFs
CREATE TABLE IF NOT EXISTS document_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  pages_converted INT DEFAULT 0,
  images_created INT DEFAULT 0,
  error_message TEXT,
  processing_time_ms INT,
  original_size_bytes BIGINT,
  converted_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_conversions_case_id ON document_conversions(case_id);
CREATE INDEX idx_conversions_document_id ON document_conversions(document_id);
CREATE INDEX idx_conversions_status ON document_conversions(status);

-- RLS Policies
ALTER TABLE document_conversions ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver logs de casos atribuídos a eles
CREATE POLICY "Users can view their own conversion logs"
  ON document_conversions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM case_assignments
      WHERE case_assignments.case_id = document_conversions.case_id
      AND case_assignments.user_id = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Usuários podem inserir logs para casos atribuídos a eles
CREATE POLICY "Users can insert their own conversion logs"
  ON document_conversions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM case_assignments
      WHERE case_assignments.case_id = document_conversions.case_id
      AND case_assignments.user_id = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Usuários podem atualizar logs de casos atribuídos a eles
CREATE POLICY "Users can update their own conversion logs"
  ON document_conversions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM case_assignments
      WHERE case_assignments.case_id = document_conversions.case_id
      AND case_assignments.user_id = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );