-- Adicionar ON DELETE CASCADE nas foreign keys para permitir exclusão em cascata

-- 1. Corrigir constraint de jurisprudence_results
ALTER TABLE jurisprudence_results 
  DROP CONSTRAINT IF EXISTS jurisprudence_results_case_id_fkey;

ALTER TABLE jurisprudence_results 
  ADD CONSTRAINT jurisprudence_results_case_id_fkey 
  FOREIGN KEY (case_id) 
  REFERENCES cases(id) 
  ON DELETE CASCADE;

-- 2. Corrigir constraint de teses_juridicas
ALTER TABLE teses_juridicas 
  DROP CONSTRAINT IF EXISTS teses_juridicas_case_id_fkey;

ALTER TABLE teses_juridicas 
  ADD CONSTRAINT teses_juridicas_case_id_fkey 
  FOREIGN KEY (case_id) 
  REFERENCES cases(id) 
  ON DELETE CASCADE;