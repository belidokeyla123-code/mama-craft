-- Criar tabela de fila de processamento para gerenciar múltiplos casos
CREATE TABLE processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_queue_status ON processing_queue(status);
CREATE INDEX idx_queue_case ON processing_queue(case_id);
CREATE INDEX idx_queue_created ON processing_queue(created_at);

-- RLS policies
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo para todos (MVP)"
  ON processing_queue FOR ALL
  USING (true)
  WITH CHECK (true);