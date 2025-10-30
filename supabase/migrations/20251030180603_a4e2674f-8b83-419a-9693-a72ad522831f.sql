-- Adicionar novos campos à tabela quality_reports para análise preliminar expandida
ALTER TABLE quality_reports 
ADD COLUMN IF NOT EXISTS portugues_ok boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS documentos_validados boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS erros_portugues jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS problemas_documentos jsonb DEFAULT '[]'::jsonb;