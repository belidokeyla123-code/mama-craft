-- FASE 3: INVALIDAÇÃO INTELIGENTE DE CACHE
-- Adicionar campo is_stale para rastreamento de dados desatualizados
ALTER TABLE case_analysis ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT false;
ALTER TABLE jurisprudence_results ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT false;
ALTER TABLE teses_juridicas ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT false;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT false;

-- Criar função de invalidação automática downstream
CREATE OR REPLACE FUNCTION invalidate_downstream()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Criar triggers para invalidação automática
DROP TRIGGER IF EXISTS invalidate_after_analysis_update ON case_analysis;
CREATE TRIGGER invalidate_after_analysis_update
AFTER UPDATE ON case_analysis
FOR EACH ROW EXECUTE FUNCTION invalidate_downstream();

DROP TRIGGER IF EXISTS invalidate_after_jurisprudence_update ON jurisprudence_results;
CREATE TRIGGER invalidate_after_jurisprudence_update
AFTER UPDATE ON jurisprudence_results
FOR EACH ROW EXECUTE FUNCTION invalidate_downstream();

DROP TRIGGER IF EXISTS invalidate_after_teses_update ON teses_juridicas;
CREATE TRIGGER invalidate_after_teses_update
AFTER UPDATE ON teses_juridicas
FOR EACH ROW EXECUTE FUNCTION invalidate_downstream();