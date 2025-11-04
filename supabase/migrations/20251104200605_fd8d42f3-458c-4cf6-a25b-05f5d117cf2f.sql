-- Corrigir função auto_assign_case_owner para usar SECURITY DEFINER
-- Isso garante que o trigger possa criar case_assignment atomicamente
-- evitando condição de corrida com o SELECT do RLS

CREATE OR REPLACE FUNCTION public.auto_assign_case_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- ← Voltar para SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Capturar o user_id do contexto atual
  current_user_id := auth.uid();
  
  -- Só criar assignment se houver usuário autenticado
  IF current_user_id IS NOT NULL THEN
    INSERT INTO case_assignments (case_id, user_id)
    VALUES (NEW.id, current_user_id)
    ON CONFLICT (case_id, user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;