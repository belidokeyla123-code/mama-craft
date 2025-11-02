-- Aplicar GRANTs sem dropar a função
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO postgres;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO PUBLIC;