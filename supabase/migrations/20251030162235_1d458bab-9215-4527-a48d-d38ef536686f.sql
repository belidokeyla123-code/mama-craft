-- Adicionar coluna petition_type à tabela cases
ALTER TABLE cases 
ADD COLUMN petition_type TEXT DEFAULT 'peticao_inicial' 
CHECK (petition_type IN ('peticao_inicial', 'recurso_apelacao', 'embargos', 'pilf'));

-- Criar índice para melhorar performance de queries
CREATE INDEX idx_cases_petition_type ON cases(petition_type);

-- Comentário para documentar
COMMENT ON COLUMN cases.petition_type IS 'Tipo de peça processual: peticao_inicial, recurso_apelacao, embargos, pilf';

-- Atualizar casos existentes para terem um valor padrão
UPDATE cases 
SET petition_type = 'peticao_inicial' 
WHERE petition_type IS NULL;