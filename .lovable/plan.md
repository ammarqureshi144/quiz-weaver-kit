
# MCQ Testing Platform — Implementation Plan

A serious, exam-grade online testing app for Instructors and Students. Built on TanStack Start + Lovable Cloud (Supabase Auth, Postgres, RLS).

## Scope (v1)

**Auth & roles**
- Email/password signup with role selection (Instructor / Student)
- `profiles` table linked to `auth.users`, role-based redirect after login
- `/instructor/*` and `/student/*` route groups, gated by role

**Instructor**
- Dashboard: list tests with status (Draft / Published / Closed)
- Test builder: title, description, duration (min), shuffle toggle, display mode (one-at-a-time / all-on-page)
- Sections (title + order) and MCQ questions (text, 2+ options, mark correct, points default 1)
- Edit/delete sections & questions while Draft; Publish / Close actions
- Results page per test: student, score, rank, time taken, submission reason
- "Release results" toggle (off by default) and "Download CSV" with section breakdown

**Student**
- Dashboard: published tests with status (Not Started / In Progress / Submitted)
- Instructions screen → "Begin" → creates attempt with server `start_time`
- Test interface respects display mode + shuffle (seeded by `attempt_id` for stable order on reload)
- Server-authoritative countdown (`start_time + duration` from DB); auto-submit on zero
- Auto-save every answer change to `responses`
- Submit confirmation with answered/unanswered count
- Post-submit screen: "Results will be available once released"
- Once released: score, rank, section-wise breakdown

**Anti-cheat**
- Track `visibilitychange` + `blur` (tab switch) and `copy`/`cut`/`paste` (blocked)
- Server-persisted `warning_count` on attempt; modal shows "Warning X of 3"
- 3rd violation → auto-submit with reason `violations`
- Survives refresh

**Submission & grading**
- Reasons: `normal`, `time_over`, `violations`
- Lock attempt on submit; auto-grade by summing points where selected = correct
- Rank computed by score desc per test

## Data Model (Supabase, RLS on)

```text
profiles(id PK→auth.users, role enum[instructor,student], full_name, created_at)
tests(id, instructor_id→profiles, title, description, duration_minutes,
      shuffle_questions, display_mode enum[one,all],
      status enum[draft,published,closed], results_released bool, created_at)
sections(id, test_id, title, position)
questions(id, section_id, text, points int default 1, position)
options(id, question_id, text, is_correct bool, position)
attempts(id, test_id, student_id, start_time, end_time, submitted_at,
         submitted_reason enum[normal,time_over,violations],
         warning_count int default 0, score numeric, status enum[in_progress,submitted])
responses(id, attempt_id, question_id, selected_option_id, updated_at; unique(attempt_id,question_id))
```

RLS:
- Instructors: full CRUD on their own tests/sections/questions/options; read attempts/responses for their tests
- Students: read published tests + their own attempts/responses; insert/update only their own in-progress attempt; cannot read `is_correct` or scores until `results_released`
- Correct-answer hiding done via a view (`questions_public` w/o `is_correct`) and policies that gate `options.is_correct` by released-or-instructor

Server functions handle: start attempt, save response, submit attempt (grade), record warning, list results with rank.

## Tech Notes (technical section)

- TanStack Start + file-based routing; `_authenticated/` layout for all gated routes; nested `_authenticated/instructor/` and `_authenticated/student/` with role guards in `beforeLoad`
- Lovable Cloud for Supabase; `requireSupabaseAuth` middleware on all server fns
- Timer: server returns `server_now` + `end_time`; client computes offset once and ticks locally
- Shuffle: deterministic Fisher-Yates seeded by `attempt_id` hash
- CSV export: client-side from results query
- Design: calm academic palette (deep slate + muted accent), Inter for UI, generous spacing, no gradients/playful motion

## Out of scope (v1)

- Question types beyond single-select MCQ (no multi-select, no short answer)
- Image uploads in questions
- Re-attempts / multiple attempts per test
- Proctoring beyond tab-switch + copy/paste
- Email notifications

Approve to start building, or tell me what to change (e.g., allow multi-select, add image questions, different anti-cheat rules).
