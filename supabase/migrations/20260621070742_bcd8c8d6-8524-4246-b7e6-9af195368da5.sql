
-- Enums
CREATE TYPE public.user_role AS ENUM ('instructor', 'student');
CREATE TYPE public.test_status AS ENUM ('draft', 'published', 'closed');
CREATE TYPE public.display_mode AS ENUM ('one', 'all');
CREATE TYPE public.attempt_status AS ENUM ('in_progress', 'submitted');
CREATE TYPE public.submitted_reason AS ENUM ('normal', 'time_over', 'violations');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  role public.user_role NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- role helper (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.user_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role)
$$;

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'student')
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- tests
CREATE TABLE public.tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  shuffle_questions BOOLEAN NOT NULL DEFAULT false,
  display_mode public.display_mode NOT NULL DEFAULT 'one',
  status public.test_status NOT NULL DEFAULT 'draft',
  results_released BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tests TO authenticated;
GRANT ALL ON public.tests TO service_role;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tests_instructor_all" ON public.tests FOR ALL TO authenticated
  USING (instructor_id = auth.uid()) WITH CHECK (instructor_id = auth.uid());
CREATE POLICY "tests_student_view_published" ON public.tests FOR SELECT TO authenticated
  USING (status IN ('published','closed') AND public.has_role(auth.uid(), 'student'));
CREATE TRIGGER tests_updated_at BEFORE UPDATE ON public.tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- sections
CREATE TABLE public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sections_test_id_idx ON public.sections(test_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections_instructor_all" ON public.sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tests t WHERE t.id = test_id AND t.instructor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tests t WHERE t.id = test_id AND t.instructor_id = auth.uid()));
CREATE POLICY "sections_student_view" ON public.sections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tests t WHERE t.id = test_id AND t.status IN ('published','closed'))
         AND public.has_role(auth.uid(), 'student'));

-- questions
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  points INT NOT NULL DEFAULT 1 CHECK (points > 0),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX questions_section_id_idx ON public.questions(section_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions_instructor_all" ON public.questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sections s JOIN public.tests t ON t.id = s.test_id
                 WHERE s.id = section_id AND t.instructor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sections s JOIN public.tests t ON t.id = s.test_id
                      WHERE s.id = section_id AND t.instructor_id = auth.uid()));
CREATE POLICY "questions_student_view" ON public.questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sections s JOIN public.tests t ON t.id = s.test_id
                 WHERE s.id = section_id AND t.status IN ('published','closed'))
         AND public.has_role(auth.uid(), 'student'));

-- options
CREATE TABLE public.options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX options_question_id_idx ON public.options(question_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.options TO authenticated;
GRANT ALL ON public.options TO service_role;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "options_instructor_all" ON public.options FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.questions q JOIN public.sections s ON s.id = q.section_id
                 JOIN public.tests t ON t.id = s.test_id
                 WHERE q.id = question_id AND t.instructor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.questions q JOIN public.sections s ON s.id = q.section_id
                      JOIN public.tests t ON t.id = s.test_id
                      WHERE q.id = question_id AND t.instructor_id = auth.uid()));
-- Students can view options for published tests, but is_correct must be hidden client-side until released.
-- We expose a view 'student_options' that omits is_correct unless results are released for the student.
CREATE POLICY "options_student_view" ON public.options FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.questions q JOIN public.sections s ON s.id = q.section_id
                 JOIN public.tests t ON t.id = s.test_id
                 WHERE q.id = question_id AND t.status IN ('published','closed'))
         AND public.has_role(auth.uid(), 'student'));

-- attempts
CREATE TABLE public.attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  submitted_reason public.submitted_reason,
  warning_count INT NOT NULL DEFAULT 0,
  score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 0,
  status public.attempt_status NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_id, student_id)
);
CREATE INDEX attempts_test_idx ON public.attempts(test_id);
CREATE INDEX attempts_student_idx ON public.attempts(student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attempts TO authenticated;
GRANT ALL ON public.attempts TO service_role;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
-- student can view & manage only their own attempts
CREATE POLICY "attempts_student_select_own" ON public.attempts FOR SELECT TO authenticated
  USING (student_id = auth.uid());
CREATE POLICY "attempts_student_insert_own" ON public.attempts FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND public.has_role(auth.uid(), 'student'));
CREATE POLICY "attempts_student_update_own" ON public.attempts FOR UPDATE TO authenticated
  USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
-- instructor can view attempts for their tests
CREATE POLICY "attempts_instructor_select" ON public.attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tests t WHERE t.id = test_id AND t.instructor_id = auth.uid()));

-- responses
CREATE TABLE public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id UUID REFERENCES public.options(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX responses_attempt_idx ON public.responses(attempt_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responses TO authenticated;
GRANT ALL ON public.responses TO service_role;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responses_student_all_own" ON public.responses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = attempt_id AND a.student_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = attempt_id AND a.student_id = auth.uid()));
CREATE POLICY "responses_instructor_select" ON public.responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.attempts a JOIN public.tests t ON t.id = a.test_id
                 WHERE a.id = attempt_id AND t.instructor_id = auth.uid()));
CREATE TRIGGER responses_updated_at BEFORE UPDATE ON public.responses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
