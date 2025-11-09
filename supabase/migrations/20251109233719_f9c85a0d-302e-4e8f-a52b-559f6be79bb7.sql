-- Create chat_history table for storing conversation history
CREATE TABLE IF NOT EXISTS public.chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL,
  assistant_message TEXT NOT NULL,
  context_snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_chat_history_case_id ON public.chat_history(case_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON public.chat_history(created_at DESC);

-- Enable RLS
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view chat history from their assigned cases
CREATE POLICY "View chat history from assigned cases"
ON public.chat_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_assignments.case_id = chat_history.case_id
    AND case_assignments.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- RLS Policy: Service role can insert chat history
CREATE POLICY "Service role can insert chat history"
ON public.chat_history
FOR INSERT
WITH CHECK (true);