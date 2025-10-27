-- Expandir tabela processing_queue para trackear análises individuais
ALTER TABLE processing_queue
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS jurisprudence_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS validation_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS jurisprudence_completed_at TIMESTAMP WITH TIME ZONE;

-- Criar índice para melhorar performance de queries
CREATE INDEX IF NOT EXISTS idx_queue_statuses 
ON processing_queue(validation_status, analysis_status, jurisprudence_status);

-- Criar índice para busca por case_id (evitar duplicatas)
CREATE INDEX IF NOT EXISTS idx_queue_case_id
ON processing_queue(case_id);