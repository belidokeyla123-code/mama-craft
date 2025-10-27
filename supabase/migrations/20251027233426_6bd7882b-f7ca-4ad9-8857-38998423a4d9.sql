-- Corrigir problema de segurança: definir search_path para a função
CREATE OR REPLACE FUNCTION invoke_process_queue_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  -- Obter configurações do ambiente
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.supabase_service_role_key', true);
  
  -- Chamar a edge function via pg_net
  PERFORM extensions.net.http_post(
    url := supabase_url || '/functions/v1/process-queue-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;