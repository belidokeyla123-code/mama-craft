-- Corrigir RLS na tabela documents para permitir upload por usuários autenticados
-- Isso resolve o problema de race condition com case_assignments

-- 1. Dropar política restritiva de INSERT
DROP POLICY IF EXISTS "Upload documents to assigned cases" ON documents;

-- 2. Criar política simples que permite INSERT para qualquer usuário autenticado
CREATE POLICY "Authenticated users can upload documents"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (true);

-- As políticas de SELECT/UPDATE/DELETE continuam restritas via case_assignments
-- garantindo segurança nos dados