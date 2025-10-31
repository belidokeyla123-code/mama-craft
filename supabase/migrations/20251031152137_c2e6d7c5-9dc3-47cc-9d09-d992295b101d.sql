-- Add unique constraints only if they don't exist
-- Using DO blocks to handle existing constraints gracefully

DO $$ 
BEGIN
  -- 1. extractions table: unique constraint on document_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'extractions_document_id_key'
  ) THEN
    -- Remove duplicates first
    DELETE FROM public.extractions 
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY extracted_at DESC) as rn
        FROM public.extractions
      ) t WHERE rn > 1
    );
    
    ALTER TABLE public.extractions 
    ADD CONSTRAINT extractions_document_id_key UNIQUE (document_id);
    
    RAISE NOTICE 'Added unique constraint to extractions.document_id';
  END IF;

  -- 2. case_analysis table: unique constraint on case_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_analysis_case_id_key'
  ) THEN
    DELETE FROM public.case_analysis 
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY analyzed_at DESC) as rn
        FROM public.case_analysis
      ) t WHERE rn > 1
    );
    
    ALTER TABLE public.case_analysis 
    ADD CONSTRAINT case_analysis_case_id_key UNIQUE (case_id);
    
    RAISE NOTICE 'Added unique constraint to case_analysis.case_id';
  END IF;

  -- 3. teses_juridicas table: unique constraint on case_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teses_juridicas_case_id_key'
  ) THEN
    DELETE FROM public.teses_juridicas 
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY created_at DESC) as rn
        FROM public.teses_juridicas
      ) t WHERE rn > 1
    );
    
    ALTER TABLE public.teses_juridicas 
    ADD CONSTRAINT teses_juridicas_case_id_key UNIQUE (case_id);
    
    RAISE NOTICE 'Added unique constraint to teses_juridicas.case_id';
  END IF;

  -- 4. processing_queue table: unique constraint on case_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'processing_queue_case_id_key'
  ) THEN
    DELETE FROM public.processing_queue 
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY created_at DESC) as rn
        FROM public.processing_queue
      ) t WHERE rn > 1
    );
    
    ALTER TABLE public.processing_queue 
    ADD CONSTRAINT processing_queue_case_id_key UNIQUE (case_id);
    
    RAISE NOTICE 'Added unique constraint to processing_queue.case_id';
  END IF;

  -- 5. document_validation table: unique constraint on case_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_validation_case_id_key'
  ) THEN
    DELETE FROM public.document_validation 
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY validated_at DESC) as rn
        FROM public.document_validation
      ) t WHERE rn > 1
    );
    
    ALTER TABLE public.document_validation 
    ADD CONSTRAINT document_validation_case_id_key UNIQUE (case_id);
    
    RAISE NOTICE 'Added unique constraint to document_validation.case_id';
  END IF;

  -- Note: jurisprudence_results already has this constraint
END $$;