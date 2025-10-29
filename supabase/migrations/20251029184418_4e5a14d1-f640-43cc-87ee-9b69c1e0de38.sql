-- Adicionar novos campos na tabela cases para dados do cônjuge, NIT e local de nascimento
ALTER TABLE cases ADD COLUMN IF NOT EXISTS spouse_name text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS spouse_cpf text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS marriage_date date;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS nit text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS birth_city text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS birth_state text;

-- Criar tabela para histórico de benefícios
CREATE TABLE IF NOT EXISTS benefit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
  nb text NOT NULL,
  benefit_type text NOT NULL,
  start_date date,
  end_date date,
  status text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS na nova tabela
ALTER TABLE benefit_history ENABLE ROW LEVEL SECURITY;

-- Política de acesso para benefit_history
CREATE POLICY "Permitir tudo para todos (MVP)" 
ON benefit_history 
FOR ALL 
USING (true) 
WITH CHECK (true);