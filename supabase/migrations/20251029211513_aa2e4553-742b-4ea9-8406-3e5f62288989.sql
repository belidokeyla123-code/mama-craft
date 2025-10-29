-- Remover trigger problemático que causa erro de cross-database reference
DROP TRIGGER IF EXISTS on_processing_queue_insert ON processing_queue CASCADE;
DROP TRIGGER IF EXISTS on_queue_change ON processing_queue CASCADE;

-- Remover funções que usam pg_net com configurações inexistentes (usando CASCADE)
DROP FUNCTION IF EXISTS public.trigger_process_queue_worker() CASCADE;
DROP FUNCTION IF EXISTS public.invoke_process_queue_worker() CASCADE;

-- Comentário: A chamada ao worker agora será feita diretamente do frontend
-- quando documentos forem adicionados, evitando dependência de configurações inexistentes