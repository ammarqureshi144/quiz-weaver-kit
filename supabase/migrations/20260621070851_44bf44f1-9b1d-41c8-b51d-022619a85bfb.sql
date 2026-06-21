
DROP POLICY IF EXISTS "options_student_view" ON public.options;
-- Students will fetch options via a server function. No direct SELECT for them.
