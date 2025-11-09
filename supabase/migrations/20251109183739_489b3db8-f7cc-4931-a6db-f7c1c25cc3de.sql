-- Modificar política de SELECT para resolver race condition do trigger
-- Permite visualização de casos nos primeiros 5 segundos após criação

DROP POLICY IF EXISTS "Assigned lawyers can view cases" ON public.cases;

CREATE POLICY "Assigned lawyers can view cases"
ON public.cases
FOR SELECT
TO authenticated
USING (
  -- Caso já tem assignment (regra normal)
  (EXISTS (
    SELECT 1 FROM case_assignments 
    WHERE case_id = cases.id 
    AND user_id = auth.uid()
  ))
  OR
  -- OU é admin
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- OU foi criado há menos de 5 segundos (janela para trigger completar)
  (created_at > (now() - interval '5 seconds'))
);