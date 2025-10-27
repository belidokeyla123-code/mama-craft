-- Adicionar novos campos à tabela cases para dados da criança, proprietário da terra e atividade rural
ALTER TABLE cases ADD COLUMN IF NOT EXISTS child_name TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS child_birth_date DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS land_owner_name TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS land_owner_cpf TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS land_owner_rg TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS land_ownership_type TEXT CHECK (land_ownership_type IN ('propria', 'terceiro'));
ALTER TABLE cases ADD COLUMN IF NOT EXISTS rural_activity_since DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS family_members JSONB DEFAULT '[]'::jsonb;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS special_notes TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS has_special_situation BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS author_rg TEXT;

-- Criar tabela para exceções/situações especiais
CREATE TABLE IF NOT EXISTS case_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  exception_type TEXT NOT NULL,
  description TEXT NOT NULL,
  voice_transcribed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_exceptions_case_id ON case_exceptions(case_id);

-- Adicionar RLS para case_exceptions
ALTER TABLE case_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo para todos (MVP)" ON case_exceptions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Adicionar comentários para documentação
COMMENT ON COLUMN cases.child_name IS 'Nome do filho/filha da autora';
COMMENT ON COLUMN cases.child_birth_date IS 'Data de nascimento da criança';
COMMENT ON COLUMN cases.father_name IS 'Nome do pai da criança';
COMMENT ON COLUMN cases.land_owner_name IS 'Nome do proprietário da terra (se terceiro)';
COMMENT ON COLUMN cases.land_ownership_type IS 'Tipo de propriedade: propria ou terceiro';
COMMENT ON COLUMN cases.rural_activity_since IS 'Desde quando desenvolve atividade rural';
COMMENT ON COLUMN cases.family_members IS 'Array JSON com membros da família que moram junto';
COMMENT ON COLUMN cases.special_notes IS 'Notas sobre situações especiais (óbito, gêmeos, etc.)';
COMMENT ON COLUMN cases.has_special_situation IS 'Flag indicando se há situação especial no caso';
COMMENT ON TABLE case_exceptions IS 'Registra exceções e situações especiais narradas pelo usuário';