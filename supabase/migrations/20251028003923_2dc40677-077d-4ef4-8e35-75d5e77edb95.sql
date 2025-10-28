-- PARTE 1: Adicionar novos valores ao enum document_type
-- Estes valores serão usados pela próxima migration

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'procuracao';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'certidao_nascimento';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'identificacao';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'comprovante_residencia';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'autodeclaracao_rural';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'documento_terra';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'processo_administrativo';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'outro';