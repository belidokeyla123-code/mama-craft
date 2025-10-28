-- Corrigir search_path na função trigger
CREATE OR REPLACE FUNCTION public.trigger_process_queue_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  -- Chamar edge function via pg_net quando status for 'queued'
  IF NEW.status = 'queued' THEN
    PERFORM extensions.net.http_post(
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
$$;