-- Criar ENUM para fases processuais
CREATE TYPE fase_processual AS ENUM (
  'distribuida',
  'citacao_inss',
  'contestacao',
  'impugnacao',
  'despacho_saneador',
  'especificacao_provas',
  'juntada_documentos',
  'audiencia_instrucao',
  'alegacoes_finais',
  'acordo',
  'sentenca'
);

-- Atualizar tabela case_financial
ALTER TABLE case_financial 
ADD COLUMN tipo_conclusao TEXT CHECK (tipo_conclusao IN ('acordo', 'sentenca_procedente', 'sentenca_improcedente')),
ADD COLUMN valor_cliente NUMERIC DEFAULT 0,
ADD COLUMN valor_honorarios NUMERIC DEFAULT 0,
ADD COLUMN percentual_honorarios NUMERIC DEFAULT 30.0;

-- Atualizar tabela case_timeline
ALTER TABLE case_timeline 
ALTER COLUMN fase TYPE fase_processual USING fase::fase_processual,
ADD COLUMN concluida BOOLEAN DEFAULT FALSE,
ADD COLUMN ordem INTEGER;

-- Criar tabela financial_statistics
CREATE TABLE financial_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_tipo TEXT NOT NULL CHECK (periodo_tipo IN ('dia', 'semana', 'mes', 'ano')),
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  total_protocoladas INTEGER DEFAULT 0,
  total_acordos INTEGER DEFAULT 0,
  total_sentencas_procedentes INTEGER DEFAULT 0,
  total_sentencas_improcedentes INTEGER DEFAULT 0,
  valor_total_recebido NUMERIC DEFAULT 0,
  valor_total_cliente NUMERIC DEFAULT 0,
  valor_total_honorarios NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE financial_statistics ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS (MVP - permitir tudo)
CREATE POLICY "Permitir tudo para todos (MVP)" ON financial_statistics
FOR ALL USING (true) WITH CHECK (true);

-- Índices para busca rápida
CREATE INDEX idx_financial_stats_periodo ON financial_statistics(periodo_tipo, periodo_inicio);
CREATE INDEX idx_case_timeline_concluida ON case_timeline(concluida);

-- Trigger para atualizar updated_at em financial_statistics
CREATE TRIGGER update_financial_statistics_updated_at
BEFORE UPDATE ON financial_statistics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();