-- FASE 1: Adicionar campos de controle para congelamento de versões

-- Tabela drafts: campos para versão final
ALTER TABLE drafts 
  ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS finalized_by TEXT;

-- Tabela case_analysis: campo de bloqueio
ALTER TABLE case_analysis 
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- Tabela jurisprudence_results: campo de bloqueio
ALTER TABLE jurisprudence_results 
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- Tabela teses_juridicas: campo de bloqueio
ALTER TABLE teses_juridicas 
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_drafts_is_final ON drafts(case_id, is_final);
CREATE INDEX IF NOT EXISTS idx_analysis_locked ON case_analysis(case_id, is_locked);
CREATE INDEX IF NOT EXISTS idx_jurisprudence_locked ON jurisprudence_results(case_id, is_locked);
CREATE INDEX IF NOT EXISTS idx_teses_locked ON teses_juridicas(case_id, is_locked);

-- FASE 2: Modificar trigger para respeitar locks
CREATE OR REPLACE FUNCTION public.invalidate_downstream()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- ⚠️ NOVA REGRA: Não invalidar se dados estão locked ou finalized
  
  -- Se análise mudou → invalidar jurisprudência, teses, petição (se não locked)
  IF TG_TABLE_NAME = 'case_analysis' THEN
    IF NOT COALESCE(NEW.is_locked, false) THEN
      UPDATE jurisprudence_results 
      SET is_stale = true 
      WHERE case_id = NEW.case_id AND NOT COALESCE(is_locked, false);
      
      UPDATE teses_juridicas 
      SET is_stale = true 
      WHERE case_id = NEW.case_id AND NOT COALESCE(is_locked, false);
      
      UPDATE drafts 
      SET is_stale = true 
      WHERE case_id = NEW.case_id AND NOT COALESCE(is_final, false);
    END IF;
  END IF;
  
  -- Se jurisprudência mudou → invalidar teses, petição (se não locked)
  IF TG_TABLE_NAME = 'jurisprudence_results' THEN
    IF NOT COALESCE(NEW.is_locked, false) THEN
      UPDATE teses_juridicas 
      SET is_stale = true 
      WHERE case_id = NEW.case_id AND NOT COALESCE(is_locked, false);
      
      UPDATE drafts 
      SET is_stale = true 
      WHERE case_id = NEW.case_id AND NOT COALESCE(is_final, false);
    END IF;
  END IF;
  
  -- Se teses mudaram → invalidar petição (se não final)
  IF TG_TABLE_NAME = 'teses_juridicas' THEN
    IF NOT COALESCE(NEW.is_locked, false) THEN
      UPDATE drafts 
      SET is_stale = true 
      WHERE case_id = NEW.case_id AND NOT COALESCE(is_final, false);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;