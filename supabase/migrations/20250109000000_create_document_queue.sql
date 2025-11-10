-- Create document processing queue table
CREATE TABLE IF NOT EXISTS document_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_queue_case_id ON document_processing_queue(case_id);
CREATE INDEX idx_queue_status ON document_processing_queue(status);
CREATE INDEX idx_queue_created_at ON document_processing_queue(created_at);

-- Add RLS policies
ALTER TABLE document_processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own queue items"
  ON document_processing_queue
  FOR SELECT
  USING (
    case_id IN (
      SELECT id FROM cases WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert queue items for their cases"
  ON document_processing_queue
  FOR INSERT
  WITH CHECK (
    case_id IN (
      SELECT id FROM cases WHERE user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_document_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_queue_timestamp
  BEFORE UPDATE ON document_processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_document_queue_updated_at();

-- Add processing_status column to cases table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cases' AND column_name = 'processing_status'
  ) THEN
    ALTER TABLE cases ADD COLUMN processing_status TEXT DEFAULT 'idle' CHECK (processing_status IN ('idle', 'processing', 'completed', 'failed'));
    ALTER TABLE cases ADD COLUMN processing_progress INTEGER DEFAULT 0 CHECK (processing_progress >= 0 AND processing_progress <= 100);
    ALTER TABLE cases ADD COLUMN total_documents INTEGER DEFAULT 0;
    ALTER TABLE cases ADD COLUMN processed_documents INTEGER DEFAULT 0;
  END IF;
END $$;
