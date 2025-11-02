-- Garantir permissões na função has_role
-- Isso é necessário para que as RLS policies possam usar a função

-- Revogar permissões existentes para começar limpo
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;

-- Grant execute para authenticated (usuários logados)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- Grant execute para anon (necessário em alguns casos)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon;

-- Grant execute para service_role (admin operations)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

-- Garantir que a função pode acessar a tabela user_roles
GRANT SELECT ON TABLE public.user_roles TO authenticated;

-- Verificação: Testar se as permissões estão corretas
-- (Este comentário é só para documentação, não é executado)
-- SELECT has_role(auth.uid(), 'lawyer'::app_role);