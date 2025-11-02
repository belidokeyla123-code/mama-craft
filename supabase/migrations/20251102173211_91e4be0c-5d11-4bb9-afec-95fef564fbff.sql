-- Corrigir recursão nas policies de user_roles
-- Problema: policies de user_roles fazendo SELECT em user_roles = loop infinito

-- 1. Dropar TODAS as policies existentes de user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- 2. Criar apenas UMA policy simples e não-recursiva
-- Usuários podem ver apenas seus próprios roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 3. NÃO criar policies de admin em user_roles
-- A função has_role() usa SECURITY DEFINER e consegue ler user_roles
-- sem ser bloqueada por RLS, então não precisa de policy de admin aqui

-- 4. Para operações de INSERT/UPDATE/DELETE em user_roles,
-- criar policies que NÃO dependem de has_role ou subqueries recursivas
CREATE POLICY "Lawyers can assign themselves"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND role = 'lawyer'::app_role
);