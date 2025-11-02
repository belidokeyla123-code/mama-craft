-- ============================================
-- COMPREHENSIVE SECURITY FIX MIGRATION
-- Addresses: Missing RLS, User Roles, Storage Security
-- ============================================

-- Step 1: Create user roles system
CREATE TYPE public.app_role AS ENUM ('admin', 'lawyer', 'client');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 2: Create case assignments table (links lawyers to cases)
CREATE TABLE public.case_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(case_id, user_id)
);

ALTER TABLE public.case_assignments ENABLE ROW LEVEL SECURITY;

-- Step 3: Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- Step 4: Drop all insecure "MVP" RLS policies
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Permitir tudo para todos (MVP)" ON public.%I', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "Permitir leitura para todos (MVP)" ON public.%I', r.tablename);
  END LOOP;
END $$;

-- Step 5: Create secure RLS policies for cases table
CREATE POLICY "Assigned lawyers can view cases"
ON public.cases FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = cases.id
    AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Assigned lawyers can update cases"
ON public.cases FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = cases.id
    AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = cases.id
    AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Lawyers can create cases"
ON public.cases FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'lawyer')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Assigned lawyers can delete cases"
ON public.cases FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = cases.id
    AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

-- Step 6: Create secure RLS policies for documents table
CREATE POLICY "View documents from assigned cases"
ON public.documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = documents.case_id
    AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Upload documents to assigned cases"
ON public.documents FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = documents.case_id
    AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Update documents in assigned cases"
ON public.documents FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = documents.case_id
    AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Delete documents from assigned cases"
ON public.documents FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = documents.case_id
    AND user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

-- Step 7: Apply similar policies to all related tables
-- case_analysis
CREATE POLICY "View analysis of assigned cases"
ON public.case_analysis FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.case_assignments WHERE case_id = case_analysis.case_id AND user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Manage analysis of assigned cases"
ON public.case_analysis FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.case_assignments WHERE case_id = case_analysis.case_id AND user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.case_assignments WHERE case_id = case_analysis.case_id AND user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- drafts
CREATE POLICY "View drafts of assigned cases"
ON public.drafts FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.case_assignments WHERE case_id = drafts.case_id AND user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Manage drafts of assigned cases"
ON public.drafts FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.case_assignments WHERE case_id = drafts.case_id AND user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.case_assignments WHERE case_id = drafts.case_id AND user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- Apply to all other case-related tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN 
    SELECT unnest(ARRAY[
      'benefit_history', 'case_exceptions', 'case_financial', 'case_timeline',
      'correction_history', 'document_validation', 'extractions', 
      'jurisprudence_results', 'processing_queue', 'quality_reports',
      'teses_juridicas', 'timeline_events', 'case_jurisprudencias', 'dropbox_sync'
    ])
  LOOP
    EXECUTE format('
      CREATE POLICY "Access %I via case assignment"
      ON public.%I FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.case_assignments WHERE case_id = %I.case_id AND user_id = auth.uid())
        OR public.has_role(auth.uid(), ''admin'')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.case_assignments WHERE case_id = %I.case_id AND user_id = auth.uid())
        OR public.has_role(auth.uid(), ''admin'')
      )', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- Step 8: Policies for user_roles and case_assignments
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their assignments"
ON public.case_assignments FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Lawyers can assign themselves to cases"
ON public.case_assignments FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (public.has_role(auth.uid(), 'lawyer') OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Admins can manage assignments"
ON public.case_assignments FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Step 9: Policies for batch/template tables (admin only)
CREATE POLICY "Admins manage batch jobs"
ON public.batch_jobs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage batch job items"
ON public.batch_job_items FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage templates"
ON public.templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage financial stats"
ON public.financial_statistics FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Step 10: Read-only tables (jurisprudencias, cache)
CREATE POLICY "Authenticated users can read jurisprudencias"
ON public.jurisprudencias FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read cache"
ON public.jurisprudence_cache FOR SELECT TO authenticated
USING (true);

-- Step 11: Fix storage bucket security
UPDATE storage.buckets SET public = false WHERE id = 'case-templates';

-- Drop insecure storage policies
DROP POLICY IF EXISTS "Permitir upload para todos (MVP)" ON storage.objects;
DROP POLICY IF EXISTS "Permitir leitura para todos (MVP)" ON storage.objects;
DROP POLICY IF EXISTS "Permitir delete para todos (MVP)" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own templates" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own templates" ON storage.objects;
DROP POLICY IF EXISTS "Public can view templates" ON storage.objects;

-- Create secure storage policies
CREATE POLICY "Upload to assigned cases only"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('case-documents', 'generated-drafts')
  AND EXISTS (
    SELECT 1 FROM public.cases c
    JOIN public.case_assignments ca ON c.id = ca.case_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND ca.user_id = auth.uid()
  )
);

CREATE POLICY "View files from assigned cases"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('case-documents', 'generated-drafts')
  AND EXISTS (
    SELECT 1 FROM public.cases c
    JOIN public.case_assignments ca ON c.id = ca.case_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND ca.user_id = auth.uid()
  )
);

CREATE POLICY "Delete files from assigned cases"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('case-documents', 'generated-drafts')
  AND EXISTS (
    SELECT 1 FROM public.cases c
    JOIN public.case_assignments ca ON c.id = ca.case_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND ca.user_id = auth.uid()
  )
);

-- Admin storage access
CREATE POLICY "Admins have full storage access"
ON storage.objects FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Templates (admin only)
CREATE POLICY "Admins manage templates"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id IN ('templates', 'case-templates') AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id IN ('templates', 'case-templates') AND public.has_role(auth.uid(), 'admin'));