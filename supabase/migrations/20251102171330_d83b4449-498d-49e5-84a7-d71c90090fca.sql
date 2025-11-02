-- Parte 1: Atribuir role 'lawyer' aos usuários existentes que não têm role
INSERT INTO user_roles (user_id, role)
SELECT DISTINCT u.id, 'lawyer'::app_role
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles ur 
  WHERE ur.user_id = u.id
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Criar assignments para todos os casos existentes que não têm assignments
-- Atribui cada caso ao primeiro usuário com role 'lawyer'
INSERT INTO case_assignments (case_id, user_id)
SELECT c.id, (SELECT user_id FROM user_roles WHERE role = 'lawyer'::app_role LIMIT 1)
FROM cases c
WHERE NOT EXISTS (
  SELECT 1 FROM case_assignments ca 
  WHERE ca.case_id = c.id
)
AND EXISTS (SELECT 1 FROM user_roles WHERE role = 'lawyer'::app_role);

-- Parte 2: Criar/atualizar função e trigger para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atribuir role 'lawyer' automaticamente a todo novo usuário
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'lawyer'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Criar trigger para novos usuários
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();