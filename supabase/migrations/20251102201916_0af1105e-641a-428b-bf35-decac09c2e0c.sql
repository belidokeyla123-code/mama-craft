-- Reabilitar RLS na tabela cases e criar políticas corretas
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

-- 1. Permitir que usuários autenticados criem casos
DROP POLICY IF EXISTS "Allow authenticated users to create cases" ON cases;
CREATE POLICY "Allow authenticated users to create cases"
ON cases
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 2. Manter políticas de SELECT/UPDATE/DELETE via case_assignments
-- (já existem e funcionam corretamente)