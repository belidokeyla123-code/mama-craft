-- Corrigir search_path da função invalidate_downstream
CREATE OR REPLACE FUNCTION invalidate_downstream()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se análise mudou → invalidar jurisprudência, teses, petição
  IF TG_TABLE_NAME = 'case_analysis' THEN
    UPDATE jurisprudence_results SET is_stale = true WHERE case_id = NEW.case_id;
    UPDATE teses_juridicas SET is_stale = true WHERE case_id = NEW.case_id;
    UPDATE drafts SET is_stale = true WHERE case_id = NEW.case_id;
  END IF;
  
  -- Se jurisprudência mudou → invalidar teses, petição
  IF TG_TABLE_NAME = 'jurisprudence_results' THEN
    UPDATE teses_juridicas SET is_stale = true WHERE case_id = NEW.case_id;
    UPDATE drafts SET is_stale = true WHERE case_id = NEW.case_id;
  END IF;
  
  -- Se teses mudaram → invalidar petição
  IF TG_TABLE_NAME = 'teses_juridicas' THEN
    UPDATE drafts SET is_stale = true WHERE case_id = NEW.case_id;
  END IF;
  
  RETURN NEW;
END;
$$;