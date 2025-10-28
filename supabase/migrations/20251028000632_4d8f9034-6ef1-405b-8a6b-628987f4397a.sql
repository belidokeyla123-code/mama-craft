-- FASE 1: Adicionar constraint UNIQUE ao case_id da processing_queue
-- Isso corrige o erro "no unique or exclusion constraint matching the ON CONFLICT"

ALTER TABLE processing_queue
ADD CONSTRAINT processing_queue_case_id_unique UNIQUE (case_id);