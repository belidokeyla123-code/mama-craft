-- Limpar documentos duplicados mantendo apenas a versão mais recente
-- Esta limpeza resolve o problema de PDFs duplicados no sistema

WITH ranked_docs AS (
  SELECT 
    id,
    file_name,
    case_id,
    uploaded_at,
    ROW_NUMBER() OVER (
      PARTITION BY case_id, file_name 
      ORDER BY uploaded_at DESC
    ) as rn
  FROM documents
)
DELETE FROM documents 
WHERE id IN (
  SELECT id FROM ranked_docs WHERE rn > 1
);

-- Criar índice para prevenir duplicatas futuras
CREATE INDEX IF NOT EXISTS idx_documents_case_filename 
ON documents(case_id, file_name);