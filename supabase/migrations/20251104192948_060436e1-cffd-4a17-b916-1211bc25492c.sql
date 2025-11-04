-- Corrigir RLS em extractions para permitir processamento de documentos
-- Remover política restritiva atual
DROP POLICY IF EXISTS "Access extractions via case assignment" ON extractions;

-- Permitir INSERT para usuários autenticados (validando que documento existe e pertence ao caso)
CREATE POLICY "Authenticated users can insert extractions"
ON extractions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents 
    WHERE documents.id = extractions.document_id 
    AND documents.case_id = extractions.case_id
  )
);

-- Permitir UPDATE para usuários autenticados (validando que documento existe e pertence ao caso)
CREATE POLICY "Authenticated users can update extractions"
ON extractions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM documents 
    WHERE documents.id = extractions.document_id 
    AND documents.case_id = extractions.case_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents 
    WHERE documents.id = extractions.document_id 
    AND documents.case_id = extractions.case_id
  )
);

-- Manter SELECT restrito a casos atribuídos ou admins
CREATE POLICY "View extractions from assigned cases"
ON extractions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = extractions.case_id 
    AND case_assignments.user_id = auth.uid()
  ) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Manter DELETE restrito a casos atribuídos ou admins
CREATE POLICY "Delete extractions from assigned cases"
ON extractions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = extractions.case_id 
    AND case_assignments.user_id = auth.uid()
  ) 
  OR has_role(auth.uid(), 'admin'::app_role)
);