-- Adicionar novos campos para dados detalhados da terra e atividades rurais
ALTER TABLE cases
ADD COLUMN IF NOT EXISTS land_area NUMERIC,
ADD COLUMN IF NOT EXISTS land_total_area NUMERIC,
ADD COLUMN IF NOT EXISTS land_exploited_area NUMERIC,
ADD COLUMN IF NOT EXISTS land_itr TEXT,
ADD COLUMN IF NOT EXISTS land_property_name TEXT,
ADD COLUMN IF NOT EXISTS land_municipality TEXT,
ADD COLUMN IF NOT EXISTS land_cession_type TEXT,
ADD COLUMN IF NOT EXISTS rural_activities_planting TEXT,
ADD COLUMN IF NOT EXISTS rural_activities_breeding TEXT;

COMMENT ON COLUMN cases.land_area IS 'Área cedida em hectares (campo ÁREA CEDIDA da autodeclaração)';
COMMENT ON COLUMN cases.land_total_area IS 'Área total do imóvel em hectares';
COMMENT ON COLUMN cases.land_exploited_area IS 'Área explorada pelo requerente em hectares';
COMMENT ON COLUMN cases.land_itr IS 'Registro ITR da propriedade';
COMMENT ON COLUMN cases.land_property_name IS 'Nome da propriedade (sítio, fazenda, etc)';
COMMENT ON COLUMN cases.land_municipality IS 'Município/UF onde fica o imóvel';
COMMENT ON COLUMN cases.land_cession_type IS 'Forma de cessão (COMODATO, arrendamento, parceria, etc)';
COMMENT ON COLUMN cases.rural_activities_planting IS 'Atividades de plantio (café, banana, mandioca, etc)';
COMMENT ON COLUMN cases.rural_activities_breeding IS 'Atividades de criação (galinha, porco, gado, etc)';