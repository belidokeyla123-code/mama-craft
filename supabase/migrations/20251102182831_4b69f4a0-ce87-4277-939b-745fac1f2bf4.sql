-- Temporariamente simplificar a policy de INSERT para diagnóstico
-- Permitir que qualquer usuário autenticado possa criar casos
DROP POLICY IF EXISTS "Lawyers can create cases" ON public.cases;

CREATE POLICY "Authenticated users can create cases (temporary)" 
ON public.cases 
FOR INSERT 
TO authenticated
WITH CHECK (true);