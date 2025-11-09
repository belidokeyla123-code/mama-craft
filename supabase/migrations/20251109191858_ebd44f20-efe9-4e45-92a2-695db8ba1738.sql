-- Corrigir políticas RLS no storage.objects para permitir uploads nos primeiros 10 segundos após criação do caso
-- Isso resolve o race condition entre o upload e o trigger auto_assign_case_owner

-- 1. Política de INSERT (Upload)
DROP POLICY IF EXISTS "Upload to assigned cases only" ON storage.objects;

CREATE POLICY "Upload to assigned cases only"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  (bucket_id = ANY (ARRAY['case-documents'::text, 'generated-drafts'::text]))
  AND (
    -- Usuário está atribuído ao caso
    EXISTS (
      SELECT 1
      FROM cases c
      JOIN case_assignments ca ON c.id = ca.case_id
      WHERE (c.id)::text = (storage.foldername(objects.name))[1]
        AND ca.user_id = auth.uid()
    )
    -- OU caso foi criado nos últimos 10 segundos (janela para o trigger)
    OR EXISTS (
      SELECT 1
      FROM cases c
      WHERE (c.id)::text = (storage.foldername(objects.name))[1]
        AND c.created_at > (now() - interval '10 seconds')
    )
  )
);

-- 2. Política de SELECT (View)
DROP POLICY IF EXISTS "View files from assigned cases" ON storage.objects;

CREATE POLICY "View files from assigned cases"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  (bucket_id = ANY (ARRAY['case-documents'::text, 'generated-drafts'::text]))
  AND (
    EXISTS (
      SELECT 1
      FROM cases c
      JOIN case_assignments ca ON c.id = ca.case_id
      WHERE (c.id)::text = (storage.foldername(objects.name))[1]
        AND ca.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM cases c
      WHERE (c.id)::text = (storage.foldername(objects.name))[1]
        AND c.created_at > (now() - interval '10 seconds')
    )
  )
);

-- 3. Política de DELETE
DROP POLICY IF EXISTS "Delete files from assigned cases" ON storage.objects;

CREATE POLICY "Delete files from assigned cases"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  (bucket_id = ANY (ARRAY['case-documents'::text, 'generated-drafts'::text]))
  AND (
    EXISTS (
      SELECT 1
      FROM cases c
      JOIN case_assignments ca ON c.id = ca.case_id
      WHERE (c.id)::text = (storage.foldername(objects.name))[1]
        AND ca.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM cases c
      WHERE (c.id)::text = (storage.foldername(objects.name))[1]
        AND c.created_at > (now() - interval '10 seconds')
    )
  )
);