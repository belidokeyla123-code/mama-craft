-- FASE 4 e 6: Tabela de histórico de correções com auditoria completa
CREATE TABLE IF NOT EXISTS public.correction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  correction_type TEXT NOT NULL, -- 'quality_report', 'judge', 'regional', 'appellate'
  module TEXT NOT NULL, -- 'enderecamento', 'valor_causa', 'jurisdicao', 'brecha', etc
  before_content TEXT,
  after_content TEXT,
  changes_summary JSONB, -- Resumo estruturado das mudanças
  applied_by TEXT, -- Sistema ou usuário
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reverted_at TIMESTAMP WITH TIME ZONE,
  confidence_score NUMERIC, -- 0-100
  auto_applied BOOLEAN DEFAULT true,
  validation_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.correction_history ENABLE ROW LEVEL SECURITY;

-- Política permissiva (MVP)
CREATE POLICY "Permitir tudo para todos (MVP)"
  ON public.correction_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_correction_history_case_id ON public.correction_history(case_id);
CREATE INDEX IF NOT EXISTS idx_correction_history_applied_at ON public.correction_history(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_correction_history_type ON public.correction_history(correction_type);

-- FASE 5: Adicionar campos de retry e monitoramento na processing_queue
ALTER TABLE public.processing_queue 
  ADD COLUMN IF NOT EXISTS auto_correction_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_correction_error TEXT,
  ADD COLUMN IF NOT EXISTS correction_stage TEXT, -- 'quality', 'judge', 'regional', 'appellate'
  ADD COLUMN IF NOT EXISTS total_corrections_applied INTEGER DEFAULT 0;

-- Comentários para documentação
COMMENT ON TABLE public.correction_history IS 'Rastreia todas as correções automáticas e manuais aplicadas nas petições';
COMMENT ON COLUMN public.correction_history.confidence_score IS 'Score de confiança da correção aplicada (0-100)';
COMMENT ON COLUMN public.correction_history.changes_summary IS 'Resumo estruturado: { issue_type, severity, action_taken, metrics }';
COMMENT ON COLUMN public.correction_history.validation_status IS 'Status de validação: pending (aguardando), approved (aprovada), rejected (revertida)';