-- Remover trigger completamente
DROP TRIGGER IF EXISTS on_case_created ON cases;

-- Remover todas as políticas de INSERT em cases
DROP POLICY IF EXISTS "Authenticated users can create cases (temporary)" ON cases;
DROP POLICY IF EXISTS "Users can create cases" ON cases;

-- Criar política permissiva simples para INSERT
CREATE POLICY "Allow authenticated users to create cases"
ON cases
FOR INSERT
TO authenticated
WITH CHECK (true);