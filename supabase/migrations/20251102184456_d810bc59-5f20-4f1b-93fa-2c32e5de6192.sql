-- Habilitar triggers na tabela cases que estavam desabilitados
ALTER TABLE public.cases ENABLE TRIGGER auto_assign_case_owner_trigger;
ALTER TABLE public.cases ENABLE TRIGGER on_case_created;
ALTER TABLE public.cases ENABLE TRIGGER update_cases_updated_at;

-- Garantir que a policy de INSERT está correta e ativa
DROP POLICY IF EXISTS "Authenticated users can create cases (temporary)" ON public.cases;

CREATE POLICY "Authenticated users can create cases (temporary)"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (true);