-- Adicionar campo para armazenar URL do modelo personalizado
ALTER TABLE cases 
ADD COLUMN IF NOT EXISTS template_url TEXT;

COMMENT ON COLUMN cases.template_url IS 'URL do modelo .docx personalizado do escritório no Storage';