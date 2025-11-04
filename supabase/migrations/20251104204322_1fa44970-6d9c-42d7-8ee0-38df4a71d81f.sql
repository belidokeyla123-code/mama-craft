-- Remover política RLS de INSERT incorreta
DROP POLICY IF EXISTS "Allow authenticated users to create cases" ON public.cases;

-- Criar política RLS de INSERT correta
-- Permite que qualquer usuário autenticado crie casos
CREATE POLICY "Authenticated users can insert cases"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Garantir que a política de SELECT também está correta
DROP POLICY IF EXISTS "Assigned lawyers can view cases" ON public.cases;

CREATE POLICY "Assigned lawyers can view cases"
ON public.cases
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM case_assignments
    WHERE case_assignments.case_id = cases.id
    AND case_assignments.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);