DROP POLICY IF EXISTS "options_student_view" ON public.options;

CREATE OR REPLACE FUNCTION public.get_student_test_options(_test_id uuid)
RETURNS TABLE (id uuid, question_id uuid, text text, "position" int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tests t
    WHERE t.id = _test_id AND t.status IN ('published','closed')
  ) THEN
    RAISE EXCEPTION 'Test not available';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.attempts a
    WHERE a.test_id = _test_id AND a.student_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.tests t WHERE t.id = _test_id AND t.instructor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT o.id, o.question_id, o.text, o."position"
  FROM public.options o
  JOIN public.questions q ON q.id = o.question_id
  JOIN public.sections s ON s.id = q.section_id
  WHERE s.test_id = _test_id
  ORDER BY o."position";
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_test_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_test_options(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_student_rank(_attempt_id uuid)
RETURNS TABLE ("rank" int, total int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.attempts;
  v_test public.tests;
BEGIN
  SELECT * INTO v_attempt FROM public.attempts WHERE id = _attempt_id;
  IF v_attempt.id IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  SELECT * INTO v_test FROM public.tests WHERE id = v_attempt.test_id;

  IF v_attempt.student_id <> auth.uid() AND v_test.instructor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_attempt.status <> 'submitted' THEN RAISE EXCEPTION 'Not submitted'; END IF;
  IF v_test.instructor_id <> auth.uid() AND NOT v_test.results_released THEN
    RAISE EXCEPTION 'Results not released';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT a.id,
           RANK() OVER (ORDER BY a.score DESC NULLS LAST) AS r,
           COUNT(*) OVER () AS c
    FROM public.attempts a
    WHERE a.test_id = v_attempt.test_id AND a.status = 'submitted'
  )
  SELECT r::int, c::int FROM ranked WHERE id = _attempt_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_rank(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_rank(uuid) TO authenticated;