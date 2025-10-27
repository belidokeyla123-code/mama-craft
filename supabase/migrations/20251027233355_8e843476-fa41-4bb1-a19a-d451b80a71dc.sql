-- Habilitar extensões necessárias para cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Criar função para chamar o worker via HTTP
CREATE OR REPLACE FUNCTION invoke_process_queue_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  -- Obter configurações do ambiente
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.supabase_service_role_key', true);
  
  -- Chamar a edge function via pg_net
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/process-queue-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Agendar execução a cada 30 segundos
SELECT cron.schedule(
  'process-queue-worker',
  '*/30 * * * * *',
  $$SELECT invoke_process_queue_worker();$$
);