-- Adicionar valores faltantes ao enum document_type
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'ficha_atendimento';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'carteira_pescador';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'comprovante_residencia';