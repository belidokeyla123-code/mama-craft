-- Permitir scores decimais (6.5, 7.5, etc)
ALTER TABLE document_validation 
ALTER COLUMN score TYPE numeric(3,1);

COMMENT ON COLUMN document_validation.score IS 'Score de suficiência (0.0-10.0)';