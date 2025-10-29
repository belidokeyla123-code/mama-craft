-- Adicionar coluna parent_document_id para rastrear PDFs originais
ALTER TABLE documents 
ADD COLUMN parent_document_id UUID REFERENCES documents(id) ON DELETE CASCADE;

-- Criar índice para performance
CREATE INDEX idx_documents_parent ON documents(parent_document_id);

-- Adicionar comentário explicativo
COMMENT ON COLUMN documents.parent_document_id IS 'ID do PDF original quando este documento é uma página PNG convertida automaticamente';
