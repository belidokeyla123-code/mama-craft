-- Adicionar colunas financeiras na tabela cases
ALTER TABLE cases 
ADD COLUMN IF NOT EXISTS contract_value DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS contract_percentage INTEGER,
ADD COLUMN IF NOT EXISTS payment_type TEXT,
ADD COLUMN IF NOT EXISTS contract_details TEXT,
ADD COLUMN IF NOT EXISTS calculated_honorarios DECIMAL(10,2);

-- Comentários
COMMENT ON COLUMN cases.contract_value IS 'Valor total do contrato de honorários';
COMMENT ON COLUMN cases.contract_percentage IS 'Percentual acordado (ex: 30%)';
COMMENT ON COLUMN cases.payment_type IS 'Forma de pagamento: exito, vista, parcelado';
COMMENT ON COLUMN cases.contract_details IS 'Detalhes do acordo de honorários';
COMMENT ON COLUMN cases.calculated_honorarios IS 'Honorários calculados automaticamente';
