-- ✅ FASE 6: Índices para garantir performance <3 segundos

-- Índice para consultas de documentos por case_id (usado em TODAS as abas)
CREATE INDEX IF NOT EXISTS idx_documents_case_id 
ON documents(case_id);

-- Índice para consultas de extractions por case_id (usado em StepBasicInfo, StepAnalysis)
CREATE INDEX IF NOT EXISTS idx_extractions_case_id 
ON extractions(case_id);

-- Índice para consultas de processing_queue por case_id e status (usado para verificar progresso)
CREATE INDEX IF NOT EXISTS idx_processing_queue_case_id_status 
ON processing_queue(case_id, status);

-- Índice para consultas de case_analysis por case_id (usado em StepAnalysis)
CREATE INDEX IF NOT EXISTS idx_case_analysis_case_id 
ON case_analysis(case_id);

-- Índice para consultas de jurisprudence_results por case_id (usado em StepJurisprudence)
CREATE INDEX IF NOT EXISTS idx_jurisprudence_results_case_id 
ON jurisprudence_results(case_id);

-- Índice para consultas de teses_juridicas por case_id (usado em StepTeseJuridica)
CREATE INDEX IF NOT EXISTS idx_teses_juridicas_case_id 
ON teses_juridicas(case_id);

-- Índice para consultas de drafts por case_id (usado em StepDraft)
CREATE INDEX IF NOT EXISTS idx_drafts_case_id 
ON drafts(case_id);

-- Índice para consultas de document_validation por case_id (usado em StepValidation)
CREATE INDEX IF NOT EXISTS idx_document_validation_case_id 
ON document_validation(case_id);

-- Índice para consultas de benefit_history por case_id (usado em StepBasicInfo, StepAnalysis)
CREATE INDEX IF NOT EXISTS idx_benefit_history_case_id 
ON benefit_history(case_id);

-- Índice para consultas de case_timeline por case_id (usado para linha do tempo)
CREATE INDEX IF NOT EXISTS idx_case_timeline_case_id 
ON case_timeline(case_id);