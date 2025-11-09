-- Criar função para atribuir automaticamente o caso ao usuário que o criou
CREATE OR REPLACE FUNCTION public.auto_assign_case_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NOT NULL THEN
    -- Desabilitar RLS temporariamente para este INSERT específico
    SET LOCAL row_security = off;
    
    INSERT INTO case_assignments (case_id, user_id)
    VALUES (NEW.id, current_user_id)
    ON CONFLICT (case_id, user_id) DO NOTHING;
    
    -- RLS será reativado automaticamente no fim da transação
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger que executa após inserção na tabela cases
DROP TRIGGER IF EXISTS trigger_auto_assign_case_owner ON public.cases;
CREATE TRIGGER trigger_auto_assign_case_owner
  AFTER INSERT ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_case_owner();