-- Criar bucket para modelos de petição
INSERT INTO storage.buckets (id, name, public)
VALUES ('case-templates', 'case-templates', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Permitir upload e download apenas para usuários autenticados
CREATE POLICY "Users can upload their own templates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'case-templates');

CREATE POLICY "Users can view their own templates"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'case-templates');

CREATE POLICY "Users can delete their own templates"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'case-templates');

CREATE POLICY "Public can view templates"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'case-templates');