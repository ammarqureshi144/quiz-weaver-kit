
-- Allow students to view options for published/closed tests (text/position only used client-side).
-- is_correct is filtered out in server functions; for stricter hiding, the client never selects it.
CREATE POLICY "options_student_view" ON public.options FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.questions q
      JOIN public.sections s ON s.id = q.section_id
      JOIN public.tests t ON t.id = s.test_id
      WHERE q.id = question_id AND t.status IN ('published','closed')
    )
    AND public.has_role(auth.uid(), 'student')
  );

-- Security-definer grading function: student calls it on their own attempt.
CREATE OR REPLACE FUNCTION public.grade_and_submit_attempt(_attempt_id UUID, _reason public.submitted_reason)
RETURNS public.attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.attempts;
  v_score NUMERIC := 0;
BEGIN
  SELECT * INTO v_attempt FROM public.attempts WHERE id = _attempt_id;
  IF v_attempt.id IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF v_attempt.student_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.tests t WHERE t.id = v_attempt.test_id AND t.instructor_id = auth.uid())
  THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_attempt.status = 'submitted' THEN RETURN v_attempt; END IF;

  SELECT COALESCE(SUM(q.points), 0) INTO v_score
  FROM public.responses r
  JOIN public.options o ON o.id = r.selected_option_id
  JOIN public.questions q ON q.id = r.question_id
  WHERE r.attempt_id = _attempt_id AND o.is_correct = true;

  UPDATE public.attempts
  SET status = 'submitted',
      submitted_at = now(),
      submitted_reason = _reason,
      score = v_score
  WHERE id = _attempt_id
  RETURNING * INTO v_attempt;

  RETURN v_attempt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grade_and_submit_attempt(UUID, public.submitted_reason) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_and_submit_attempt(UUID, public.submitted_reason) TO authenticated;
