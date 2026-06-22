CREATE OR REPLACE FUNCTION public.get_student_section_breakdown(_attempt_id uuid)
RETURNS TABLE (section_id uuid, title text, "position" int, score numeric, max_score numeric)
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
  WITH sec AS (
    SELECT s.id, s.title, s."position",
           COALESCE(SUM(q.points), 0) AS max_pts
    FROM public.sections s
    LEFT JOIN public.questions q ON q.section_id = s.id
    WHERE s.test_id = v_attempt.test_id
    GROUP BY s.id, s.title, s."position"
  ),
  scored AS (
    SELECT q.section_id, COALESCE(SUM(q.points), 0) AS pts
    FROM public.responses r
    JOIN public.questions q ON q.id = r.question_id
    JOIN public.options o ON o.id = r.selected_option_id
    WHERE r.attempt_id = _attempt_id AND o.is_correct = true
    GROUP BY q.section_id
  )
  SELECT sec.id, sec.title, sec."position",
         COALESCE(scored.pts, 0)::numeric AS score,
         sec.max_pts::numeric AS max_score
  FROM sec LEFT JOIN scored ON scored.section_id = sec.id
  ORDER BY sec."position";
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_section_breakdown(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_section_breakdown(uuid) TO authenticated;