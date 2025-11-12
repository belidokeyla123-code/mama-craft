-- Criar políticas RLS para o bucket case-documents

-- Política para permitir upload de documentos (usuários autenticados podem fazer upload)
CREATE POLICY "Authenticated users can upload case documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-documents'
);

-- Política para permitir leitura de documentos de casos atribuídos
CREATE POLICY "Users can view documents from assigned cases"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-documents' AND
  (
    EXISTS (
      SELECT 1
      FROM case_assignments ca
      WHERE ca.case_id::text = (storage.foldername(name))[1]
        AND ca.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Política para permitir atualização de documentos
CREATE POLICY "Users can update documents in assigned cases"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'case-documents' AND
  (
    EXISTS (
      SELECT 1
      FROM case_assignments ca
      WHERE ca.case_id::text = (storage.foldername(name))[1]
        AND ca.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Política para permitir exclusão de documentos
CREATE POLICY "Users can delete documents from assigned cases"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-documents' AND
  (
    EXISTS (
      SELECT 1
      FROM case_assignments ca
      WHERE ca.case_id::text = (storage.foldername(name))[1]
        AND ca.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);