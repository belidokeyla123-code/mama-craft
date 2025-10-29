-- ✅ CORREÇÃO #8 (CORRIGIDA): Remover duplicados e adicionar constraint UNIQUE

-- 1. Deletar registros duplicados, mantendo apenas o mais recente para cada case_id
DELETE FROM jurisprudence_results
WHERE id NOT IN (
  SELECT DISTINCT ON (case_id) id
  FROM jurisprudence_results
  ORDER BY case_id, created_at DESC
);

-- 2. Adicionar constraint UNIQUE (agora vai funcionar)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'jurisprudence_results_case_id_key'
      AND conrelid = 'jurisprudence_results'::regclass
  ) THEN
    ALTER TABLE jurisprudence_results 
    ADD CONSTRAINT jurisprudence_results_case_id_key UNIQUE (case_id);
    
    RAISE NOTICE '✅ Duplicados removidos e constraint UNIQUE adicionada em jurisprudence_results.case_id';
  ELSE
    RAISE NOTICE 'ℹ️ Constraint UNIQUE já existe em jurisprudence_results.case_id';
  END IF;
END $$;