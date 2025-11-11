-- Criar tabela para histórico de conversas do chat
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL,
  assistant_message TEXT NOT NULL,
  context_snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_chat_history_case_id ON chat_history(case_id);
CREATE INDEX idx_chat_history_created_at ON chat_history(created_at DESC);

-- RLS (Row Level Security)
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver apenas conversas dos seus casos
CREATE POLICY "Users can view their own chat history"
  ON chat_history
  FOR SELECT
  USING (
    case_id IN (
      SELECT id FROM cases WHERE user_id = auth.uid()
    )
  );

-- Política: Sistema pode inserir conversas
CREATE POLICY "Service role can insert chat history"
  ON chat_history
  FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE chat_history IS 'Histórico de conversas do chat assistente com IA';
COMMENT ON COLUMN chat_history.context_snapshot IS 'Snapshot do contexto do caso no momento da conversa';
