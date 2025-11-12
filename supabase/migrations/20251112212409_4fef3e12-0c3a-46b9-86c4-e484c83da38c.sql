-- Fix auto_assign_case_owner function to remove RLS bypass
-- This addresses the security warning about SECURITY DEFINER bypassing RLS

-- Step 1: Update the function to remove row_security bypass
CREATE OR REPLACE FUNCTION public.auto_assign_case_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NOT NULL THEN
    -- No longer disabling RLS - use proper policy instead
    INSERT INTO case_assignments (case_id, user_id)
    VALUES (NEW.id, current_user_id)
    ON CONFLICT (case_id, user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 2: Ensure proper policy exists to allow the trigger to insert
-- This policy allows users to assign themselves (which is what the trigger does)
DROP POLICY IF EXISTS "Allow self-assignment via trigger" ON public.case_assignments;

CREATE POLICY "Allow self-assignment via trigger"
ON public.case_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);