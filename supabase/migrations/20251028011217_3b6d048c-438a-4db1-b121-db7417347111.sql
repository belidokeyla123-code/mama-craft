-- PARTE 2: Reclassificar documentos do caso Val Benício
-- Agora que os novos valores do enum foram commitados, podemos usá-los

UPDATE documents 
SET document_type = CASE
  -- Procuração
  WHEN file_name LIKE '1-PROC~1%' THEN 'procuracao'::document_type
  
  -- Identificação (RG/CPF)
  WHEN file_name LIKE '2-RGEC~1%' THEN 'identificacao'::document_type
  
  -- Comprovante de residência
  WHEN file_name LIKE '3-COMP~1%' THEN 'comprovante_residencia'::document_type
  
  -- Certidões de nascimento
  WHEN file_name LIKE '7-CERT~1%' THEN 'certidao_nascimento'::document_type
  WHEN file_name LIKE '13-CER~1%' THEN 'certidao_nascimento'::document_type
  
  -- Documentos de terra (cartório)
  WHEN file_name LIKE '8-CART~1%' THEN 'documento_terra'::document_type
  WHEN file_name LIKE '9-CART~1%' THEN 'documento_terra'::document_type
  
  -- Autodeclaração rural
  WHEN file_name LIKE '10-AUT~1%' THEN 'autodeclaracao_rural'::document_type
  
  -- CNIS
  WHEN file_name LIKE '14-CNI~1%' THEN 'CNIS'::document_type
  
  -- Processo administrativo (INSS)
  WHEN file_name LIKE '17-PRO~1%' THEN 'processo_administrativo'::document_type
  WHEN file_name LIKE '18-IND~1%' THEN 'processo_administrativo'::document_type
  
  -- Mantém tipo original para outros casos
  ELSE document_type
END
WHERE case_id = '9be1fd4a-be1b-49bc-a304-287cbda4f48b';

-- Criar índice para otimizar buscas por case_id e document_type
CREATE INDEX IF NOT EXISTS idx_documents_case_type ON documents(case_id, document_type);