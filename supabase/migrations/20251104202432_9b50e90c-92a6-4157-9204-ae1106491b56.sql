-- Corrigir política RLS de INSERT em cases
-- Remover política restritiva antiga
DROP POLICY IF EXISTS "Allow authenticated users to create cases" ON public.cases;

-- Criar política PERMISSIVA para permitir INSERT de usuários autenticados
CREATE POLICY "Allow authenticated users to create cases"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (true);