-- ============================================
-- MIGRAÇÃO DEFINITIVA: Recriação completa do sistema de permissões
-- Versão 2 - com DROP IF EXISTS para cada policy
-- ============================================

-- 1. REMOVER função has_role e TODAS as policies que dependem dela
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;

-- 2. REMOVER policies existentes individualmente
DROP POLICY IF EXISTS "Lawyers can create cases" ON public.cases;
DROP POLICY IF EXISTS "Assigned lawyers can view cases" ON public.cases;
DROP POLICY IF EXISTS "Assigned lawyers can update cases" ON public.cases;
DROP POLICY IF EXISTS "Assigned lawyers can delete cases" ON public.cases;
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.case_assignments;
DROP POLICY IF EXISTS "Users can view their assignments" ON public.case_assignments;
DROP POLICY IF EXISTS "Users can assign themselves to cases" ON public.case_assignments;
DROP POLICY IF EXISTS "Admins manage batch jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "Admins manage batch job items" ON public.batch_job_items;
DROP POLICY IF EXISTS "Admins manage templates" ON public.templates;
DROP POLICY IF EXISTS "Admins manage financial stats" ON public.financial_statistics;
DROP POLICY IF EXISTS "Access benefit_history via case assignment" ON public.benefit_history;
DROP POLICY IF EXISTS "Manage analysis of assigned cases" ON public.case_analysis;
DROP POLICY IF EXISTS "View analysis of assigned cases" ON public.case_analysis;
DROP POLICY IF EXISTS "Access case_exceptions via case assignment" ON public.case_exceptions;
DROP POLICY IF EXISTS "Access case_financial via case assignment" ON public.case_financial;
DROP POLICY IF EXISTS "Access case_jurisprudencias via case assignment" ON public.case_jurisprudencias;
DROP POLICY IF EXISTS "Access case_timeline via case assignment" ON public.case_timeline;
DROP POLICY IF EXISTS "Access correction_history via case assignment" ON public.correction_history;
DROP POLICY IF EXISTS "Access document_validation via case assignment" ON public.document_validation;
DROP POLICY IF EXISTS "View documents from assigned cases" ON public.documents;
DROP POLICY IF EXISTS "Upload documents to assigned cases" ON public.documents;
DROP POLICY IF EXISTS "Update documents in assigned cases" ON public.documents;
DROP POLICY IF EXISTS "Delete documents from assigned cases" ON public.documents;
DROP POLICY IF EXISTS "Manage drafts of assigned cases" ON public.drafts;
DROP POLICY IF EXISTS "View drafts of assigned cases" ON public.drafts;
DROP POLICY IF EXISTS "Access dropbox_sync via case assignment" ON public.dropbox_sync;
DROP POLICY IF EXISTS "Access extractions via case assignment" ON public.extractions;
DROP POLICY IF EXISTS "Access jurisprudence_results via case assignment" ON public.jurisprudence_results;
DROP POLICY IF EXISTS "Access processing_queue via case assignment" ON public.processing_queue;
DROP POLICY IF EXISTS "Access quality_reports via case assignment" ON public.quality_reports;
DROP POLICY IF EXISTS "Access teses_juridicas via case assignment" ON public.teses_juridicas;
DROP POLICY IF EXISTS "Access timeline_events via case assignment" ON public.timeline_events;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Lawyers can assign themselves" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can read cache" ON public.jurisprudence_cache;
DROP POLICY IF EXISTS "Authenticated users can read jurisprudencias" ON public.jurisprudencias;

-- 3. RECRIAR a função has_role com configuração correta
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
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

-- 4. CONFIGURAR permissões da função
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon;

-- ============================================
-- 5. RECRIAR TODAS AS RLS POLICIES
-- ============================================

-- CASES TABLE
CREATE POLICY "Lawyers can create cases"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'lawyer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Assigned lawyers can view cases"
ON public.cases
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = cases.id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Assigned lawyers can update cases"
ON public.cases
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = cases.id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = cases.id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Assigned lawyers can delete cases"
ON public.cases
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = cases.id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

-- CASE_ASSIGNMENTS TABLE
CREATE POLICY "Admins can manage assignments"
ON public.case_assignments
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their assignments"
ON public.case_assignments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can assign themselves to cases"
ON public.case_assignments
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- BATCH_JOBS TABLE
CREATE POLICY "Admins manage batch jobs"
ON public.batch_jobs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- BATCH_JOB_ITEMS TABLE
CREATE POLICY "Admins manage batch job items"
ON public.batch_job_items
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- TEMPLATES TABLE
CREATE POLICY "Admins manage templates"
ON public.templates
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- FINANCIAL_STATISTICS TABLE
CREATE POLICY "Admins manage financial stats"
ON public.financial_statistics
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- POLICIES PARA TABELAS RELACIONADAS A CASES
CREATE POLICY "Access benefit_history via case assignment"
ON public.benefit_history
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = benefit_history.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = benefit_history.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Manage analysis of assigned cases"
ON public.case_analysis
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_analysis.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_analysis.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "View analysis of assigned cases"
ON public.case_analysis
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_analysis.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access case_exceptions via case assignment"
ON public.case_exceptions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_exceptions.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_exceptions.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access case_financial via case assignment"
ON public.case_financial
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_financial.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_financial.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access case_jurisprudencias via case assignment"
ON public.case_jurisprudencias
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_jurisprudencias.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_jurisprudencias.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access case_timeline via case assignment"
ON public.case_timeline
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_timeline.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = case_timeline.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access correction_history via case assignment"
ON public.correction_history
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = correction_history.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = correction_history.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access document_validation via case assignment"
ON public.document_validation
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = document_validation.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = document_validation.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "View documents from assigned cases"
ON public.documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = documents.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Upload documents to assigned cases"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = documents.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Update documents in assigned cases"
ON public.documents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = documents.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Delete documents from assigned cases"
ON public.documents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = documents.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Manage drafts of assigned cases"
ON public.drafts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = drafts.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = drafts.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "View drafts of assigned cases"
ON public.drafts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = drafts.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access dropbox_sync via case assignment"
ON public.dropbox_sync
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = dropbox_sync.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = dropbox_sync.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access extractions via case assignment"
ON public.extractions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = extractions.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = extractions.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access jurisprudence_results via case assignment"
ON public.jurisprudence_results
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = jurisprudence_results.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = jurisprudence_results.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access processing_queue via case assignment"
ON public.processing_queue
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = processing_queue.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = processing_queue.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access quality_reports via case assignment"
ON public.quality_reports
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = quality_reports.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = quality_reports.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access teses_juridicas via case assignment"
ON public.teses_juridicas
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = teses_juridicas.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = teses_juridicas.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Access timeline_events via case assignment"
ON public.timeline_events
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = timeline_events.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = timeline_events.case_id
      AND case_assignments.user_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

-- USER_ROLES TABLE
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Lawyers can assign themselves"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND 
  role = 'lawyer'::app_role
);

-- JURISPRUDENCE_CACHE TABLE
CREATE POLICY "Authenticated users can read cache"
ON public.jurisprudence_cache
FOR SELECT
TO authenticated
USING (true);

-- JURISPRUDENCIAS TABLE
CREATE POLICY "Authenticated users can read jurisprudencias"
ON public.jurisprudencias
FOR SELECT
TO authenticated
USING (true);