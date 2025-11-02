
-- Fase 4: Trigger automático para atribuir novos casos ao criador
CREATE OR REPLACE FUNCTION auto_assign_case_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Criar assignment de 'owner' para o usuário que criou
  INSERT INTO case_assignments (case_id, user_id)
  VALUES (NEW.id, auth.uid())
  ON CONFLICT (case_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger que dispara após inserção de novo caso
CREATE TRIGGER on_case_created
AFTER INSERT ON cases
FOR EACH ROW
EXECUTE FUNCTION auto_assign_case_owner();
