-- Atribuir role 'lawyer' para usuários existentes que não têm role
-- Problema: usuários criados antes do trigger não receberam role automaticamente

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'lawyer'::app_role
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_roles)
ON CONFLICT (user_id, role) DO NOTHING;