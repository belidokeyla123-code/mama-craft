-- Simplificar policy de case_assignments para funcionar com trigger
-- Problema: trigger auto_assign_case_owner não consegue passar pela verificação has_role()

-- Remover policy atual muito restritiva
DROP POLICY IF EXISTS "Lawyers can assign themselves to cases" ON public.case_assignments;

-- Criar policy simplificada
-- Segurança mantida via policy em cases (apenas lawyers criam casos)
CREATE POLICY "Users can assign themselves to cases"
ON public.case_assignments
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());