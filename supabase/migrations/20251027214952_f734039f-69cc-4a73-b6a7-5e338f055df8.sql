-- Adicionar constraints UNIQUE para permitir upsert
ALTER TABLE document_validation ADD CONSTRAINT document_validation_case_id_unique UNIQUE (case_id);
ALTER TABLE case_analysis ADD CONSTRAINT case_analysis_case_id_unique UNIQUE (case_id);