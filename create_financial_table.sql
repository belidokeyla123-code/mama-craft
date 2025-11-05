-- ═══════════════════════════════════════════════════════════════
-- CRIAR TABELA CASE_FINANCIAL
-- Armazena dados financeiros completos de cada caso
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.case_financial (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE UNIQUE,
  
  -- Status e Datas
  status text DEFAULT 'protocolada',
  data_protocolo date,
  data_conclusao date,
  tipo_conclusao text, -- acordo, sentenca_procedente, sentenca_improcedente
  
  -- Valores Principais
  valor_causa numeric(12,2),
  percentual_honorarios numeric(5,2) DEFAULT 30.0,
  valor_honorarios numeric(12,2),
  valor_cliente numeric(12,2),
  
  -- Receita
  valor_recebido numeric(12,2),
  data_recebimento date,
  forma_pagamento text, -- pix, ted, doc, boleto, cheque, dinheiro
  banco text,
  agencia text,
  conta text,
  
  -- Custeio
  custas_processuais numeric(12,2) DEFAULT 0,
  pericias numeric(12,2) DEFAULT 0,
  diligencias numeric(12,2) DEFAULT 0,
  outros_custos numeric(12,2) DEFAULT 0,
  descricao_outros text,
  total_custeio numeric(12,2) DEFAULT 0,
  
  -- Resultado Financeiro
  lucro_liquido numeric(12,2),
  margem_lucro numeric(5,2),
  
  -- Observações
  observacoes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_case_financial_case_id ON public.case_financial(case_id);
CREATE INDEX IF NOT EXISTS idx_case_financial_status ON public.case_financial(status);
CREATE INDEX IF NOT EXISTS idx_case_financial_data_protocolo ON public.case_financial(data_protocolo);
CREATE INDEX IF NOT EXISTS idx_case_financial_tipo_conclusao ON public.case_financial(tipo_conclusao);

-- Desabilitar RLS temporariamente
ALTER TABLE public.case_financial DISABLE ROW LEVEL SECURITY;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_case_financial_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_case_financial_updated_at ON public.case_financial;
CREATE TRIGGER trigger_update_case_financial_updated_at
  BEFORE UPDATE ON public.case_financial
  FOR EACH ROW
  EXECUTE FUNCTION update_case_financial_updated_at();

-- Comentários
COMMENT ON TABLE public.case_financial IS 'Armazena dados financeiros completos de cada caso protocolado';
COMMENT ON COLUMN public.case_financial.valor_causa IS 'Valor total da causa';
COMMENT ON COLUMN public.case_financial.valor_honorarios IS 'Valor dos honorários advocatícios';
COMMENT ON COLUMN public.case_financial.valor_cliente IS 'Valor destinado ao cliente';
COMMENT ON COLUMN public.case_financial.total_custeio IS 'Soma de todos os custos do processo';
COMMENT ON COLUMN public.case_financial.lucro_liquido IS 'Valor recebido menos custeio total';
COMMENT ON COLUMN public.case_financial.margem_lucro IS 'Percentual de lucro em relação ao valor recebido';

SELECT 'Tabela case_financial criada com sucesso!' as resultado;
