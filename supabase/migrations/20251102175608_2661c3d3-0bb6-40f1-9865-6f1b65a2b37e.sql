-- Adicionar permissões de execução para a função has_role
-- Sem fazer DROP para evitar conflito com as policies existentes

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon;