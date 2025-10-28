-- Adicionar novos tipos de documento ao enum
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'historico_escolar';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'declaracao_saude_ubs';

-- Adicionar campos para histórico escolar e declaração de saúde
ALTER TABLE cases ADD COLUMN IF NOT EXISTS school_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS health_declaration_ubs JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN cases.school_history IS 'Array de períodos escolares: [{"instituicao": "Escola Rural X", "periodo_inicio": "2010-01-01", "periodo_fim": "2015-12-31", "serie_ano": "1º ao 5º ano", "localizacao": "Zona Rural", "observacoes": "Comprovante de matrícula"}]';

COMMENT ON COLUMN cases.health_declaration_ubs IS 'Dados da declaração de saúde UBS: {"unidade_saude": "UBS Rural X", "tratamento_desde": "2015-01-01", "tipo_tratamento": "Pré-natal e acompanhamento", "localizacao_ubs": "Zona Rural", "observacoes": "Declaração oficial"}';