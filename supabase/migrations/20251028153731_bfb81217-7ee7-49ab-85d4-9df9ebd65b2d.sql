-- Criar trigger para chamar process-queue-worker automaticamente quando item é adicionado à fila
CREATE OR REPLACE FUNCTION public.trigger_process_queue_worker()
RETURNS trigger AS $$
BEGIN
  -- Chamar edge function via pg_net quando status for 'queued'
  IF NEW.status = 'queued' THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/process-queue-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := jsonb_build_object('queue_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para novos inserts e updates
DROP TRIGGER IF EXISTS on_queue_change ON processing_queue;
CREATE TRIGGER on_queue_change
AFTER INSERT OR UPDATE ON processing_queue
FOR EACH ROW
EXECUTE FUNCTION trigger_process_queue_worker();