import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Returns sanitized test data for a student attempt (no is_correct).
export const startOrResumeAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ testId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles").select("id, full_name, role").eq("id", userId).maybeSingle();
    if (!profile || profile.role !== "student") throw new Error("Only students can start tests");

    const { data: test, error: testErr } = await supabase
      .from("tests").select("*").eq("id", data.testId).maybeSingle();
    if (testErr || !test) throw new Error("Test not found");
    if (test.status !== "published") throw new Error("Test is not available");

    let { data: attempt } = await supabase
      .from("attempts")
      .select("*")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .maybeSingle();

    if (!attempt) {
      const start = new Date();
      const end = new Date(start.getTime() + test.duration_minutes * 60 * 1000);
      const { data: qrows } = await supabase
        .from("questions")
        .select("points, section_id, sections!inner(test_id)")
        .eq("sections.test_id", data.testId);
      const maxScore = (qrows ?? []).reduce((s, q: any) => s + (q.points ?? 0), 0);
      const { data: created, error: createErr } = await supabase
        .from("attempts")
        .insert({
          test_id: data.testId,
          student_id: userId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          max_score: maxScore,
        })
        .select("*")
        .single();
      if (createErr) {
        if ((createErr as any).code === "23505") {
          const { data: existing } = await supabase
            .from("attempts")
            .select("*")
            .eq("test_id", data.testId)
            .eq("student_id", userId)
            .single();
          attempt = existing!;
        } else {
          throw createErr;
        }
      } else {
        attempt = created;
      }
    }

    if (attempt.status === "submitted") {
      return { attempt, test, sections: [], questions: [], options: [], serverNow: new Date().toISOString(), alreadySubmitted: true as const };
    }

    if (new Date(attempt.end_time).getTime() <= Date.now()) {
      const { data: graded } = await supabase.rpc("grade_and_submit_attempt", {
        _attempt_id: attempt.id,
        _reason: "time_over",
      });
      return { attempt: graded ?? attempt, test, sections: [], questions: [], options: [], serverNow: new Date().toISOString(), alreadySubmitted: true as const };
    }

    const { data: sections } = await supabase
      .from("sections").select("id, title, position").eq("test_id", data.testId).order("position");
    const sectionIds = (sections ?? []).map((s) => s.id);
    const { data: questions } = sectionIds.length
      ? await supabase
          .from("questions")
          .select("id, section_id, text, points, position")
          .in("section_id", sectionIds)
          .order("position")
      : { data: [] as any[] };
    const questionIds = (questions ?? []).map((q) => q.id);
    // Do NOT select is_correct — student must not see correct answers.
    const { data: options } = questionIds.length
      ? await supabase
          .from("options")
          .select("id, question_id, text, position")
          .in("question_id", questionIds)
          .order("position")
      : { data: [] as any[] };

    return {
      attempt,
      test,
      sections: sections ?? [],
      questions: questions ?? [],
      options: options ?? [],
      serverNow: new Date().toISOString(),
      alreadySubmitted: false as const,
    };
  });

export const saveResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      attemptId: z.string().uuid(),
      questionId: z.string().uuid(),
      selectedOptionId: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: attempt } = await supabase
      .from("attempts").select("id, student_id, status, end_time")
      .eq("id", data.attemptId).maybeSingle();
    if (!attempt || attempt.student_id !== userId) throw new Error("Forbidden");
    if (attempt.status === "submitted") throw new Error("Attempt already submitted");
    if (new Date(attempt.end_time).getTime() <= Date.now()) throw new Error("Time over");

    const { error } = await supabase
      .from("responses")
      .upsert(
        {
          attempt_id: data.attemptId,
          question_id: data.questionId,
          selected_option_id: data.selectedOptionId,
        },
        { onConflict: "attempt_id,question_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const recordViolation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ attemptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: attempt } = await supabase
      .from("attempts").select("id, student_id, status, warning_count")
      .eq("id", data.attemptId).maybeSingle();
    if (!attempt || attempt.student_id !== userId) throw new Error("Forbidden");
    if (attempt.status === "submitted") return { warningCount: attempt.warning_count, autoSubmitted: true as const };

    const newCount = attempt.warning_count + 1;
    await supabase
      .from("attempts").update({ warning_count: newCount }).eq("id", data.attemptId);

    if (newCount >= 3) {
      await supabase.rpc("grade_and_submit_attempt", {
        _attempt_id: data.attemptId,
        _reason: "violations",
      });
      return { warningCount: newCount, autoSubmitted: true as const };
    }
    return { warningCount: newCount, autoSubmitted: false as const };
  });

export const submitAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      attemptId: z.string().uuid(),
      reason: z.enum(["normal", "time_over", "violations"]).default("normal"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: attempt } = await supabase
      .from("attempts").select("id, student_id, status").eq("id", data.attemptId).maybeSingle();
    if (!attempt || attempt.student_id !== userId) throw new Error("Forbidden");

    const { data: updated, error } = await supabase.rpc("grade_and_submit_attempt", {
      _attempt_id: data.attemptId,
      _reason: data.reason,
    });
    if (error) throw error;
    return updated;
  });

// Instructor results — also includes section-wise breakdown.
export const getInstructorResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ testId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test } = await supabase.from("tests").select("*").eq("id", data.testId).maybeSingle();
    if (!test || test.instructor_id !== userId) throw new Error("Forbidden");

    const { data: attempts } = await supabase
      .from("attempts")
      .select("id, student_id, score, max_score, start_time, submitted_at, submitted_reason, status, warning_count")
      .eq("test_id", data.testId)
      .order("score", { ascending: false });

    const studentIds = (attempts ?? []).map((a) => a.student_id);
    const { data: profiles } = studentIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", studentIds)
      : { data: [] as any[] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "(no name)"] as const));

    const { data: sections } = await supabase
      .from("sections").select("id, title, position").eq("test_id", data.testId).order("position");
    const sectionIds = (sections ?? []).map((s) => s.id);
    const { data: questions } = sectionIds.length
      ? await supabase.from("questions").select("id, section_id, points").in("section_id", sectionIds)
      : { data: [] as any[] };
    const sectionByQ = new Map((questions ?? []).map((q) => [q.id, q.section_id] as const));
    const pointsByQ = new Map((questions ?? []).map((q) => [q.id, q.points] as const));

    const attemptIds = (attempts ?? []).map((a) => a.id);
    const { data: responses } = attemptIds.length
      ? await supabase
          .from("responses")
          .select("attempt_id, question_id, selected_option_id")
          .in("attempt_id", attemptIds)
      : { data: [] as any[] };
    const optIds = (responses ?? []).map((r) => r.selected_option_id).filter(Boolean) as string[];
    const { data: opts } = optIds.length
      ? await supabase.from("options").select("id, is_correct").in("id", optIds)
      : { data: [] as any[] };
    const correctById = new Map((opts ?? []).map((o) => [o.id, o.is_correct] as const));

    const breakdown: Record<string, Record<string, number>> = {};
    for (const r of responses ?? []) {
      if (!r.selected_option_id) continue;
      if (!correctById.get(r.selected_option_id)) continue;
      const secId = sectionByQ.get(r.question_id);
      if (!secId) continue;
      const points = pointsByQ.get(r.question_id) ?? 0;
      breakdown[r.attempt_id] ??= {};
      breakdown[r.attempt_id][secId] = (breakdown[r.attempt_id][secId] ?? 0) + points;
    }

    const rows = (attempts ?? []).map((a, idx) => {
      const start = new Date(a.start_time).getTime();
      const end = a.submitted_at ? new Date(a.submitted_at).getTime() : start;
      return {
        rank: idx + 1,
        attemptId: a.id,
        studentName: nameById.get(a.student_id) ?? "(unknown)",
        score: Number(a.score),
        maxScore: Number(a.max_score),
        timeTakenSec: Math.max(0, Math.round((end - start) / 1000)),
        submittedReason: a.submitted_reason ?? (a.status === "in_progress" ? "in_progress" : "normal"),
        status: a.status,
        warningCount: a.warning_count,
        sectionScores: breakdown[a.id] ?? {},
      };
    });

    return { test, sections: sections ?? [], rows };
  });

export const setResultsReleased = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ testId: z.string().uuid(), released: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test } = await supabase
      .from("tests").select("id, instructor_id").eq("id", data.testId).maybeSingle();
    if (!test || test.instructor_id !== userId) throw new Error("Forbidden");
    const { error } = await supabase
      .from("tests").update({ results_released: data.released }).eq("id", data.testId);
    if (error) throw error;
    return { ok: true };
  });

// Student fetches their own released result with breakdown.
export const getStudentResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ testId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test } = await supabase
      .from("tests").select("id, title, results_released").eq("id", data.testId).maybeSingle();
    if (!test) throw new Error("Test not found");

    const { data: attempt } = await supabase
      .from("attempts").select("*").eq("test_id", data.testId).eq("student_id", userId).maybeSingle();
    if (!attempt) return { test, attempt: null, rank: null, breakdown: [], released: test.results_released };

    if (!test.results_released) {
      return { test, attempt, rank: null, breakdown: [], released: false };
    }

    // Rank from student's own attempts row is not visible across students under RLS;
    // expose only this student's rank vs their own attempt position is N/A. Skip rank.
    const rank: number | null = null;

    const { data: sections } = await supabase
      .from("sections").select("id, title, position").eq("test_id", data.testId).order("position");
    const sectionIds = (sections ?? []).map((s) => s.id);
    const { data: questions } = sectionIds.length
      ? await supabase.from("questions").select("id, section_id, points").in("section_id", sectionIds)
      : { data: [] as any[] };
    const sectionByQ = new Map((questions ?? []).map((q) => [q.id, q.section_id] as const));
    const pointsByQ = new Map((questions ?? []).map((q) => [q.id, q.points] as const));
    const maxBySection = new Map<string, number>();
    for (const q of questions ?? []) {
      maxBySection.set(q.section_id, (maxBySection.get(q.section_id) ?? 0) + q.points);
    }
    const { data: responses } = await supabase
      .from("responses").select("question_id, selected_option_id").eq("attempt_id", attempt.id);
    const optIds = (responses ?? []).map((r) => r.selected_option_id).filter(Boolean) as string[];
    const { data: opts } = optIds.length
      ? await supabase.from("options").select("id, is_correct").in("id", optIds)
      : { data: [] as any[] };
    const correctById = new Map((opts ?? []).map((o) => [o.id, o.is_correct] as const));
    const scoreBySection = new Map<string, number>();
    for (const r of responses ?? []) {
      if (!r.selected_option_id) continue;
      if (!correctById.get(r.selected_option_id)) continue;
      const sid = sectionByQ.get(r.question_id);
      if (!sid) continue;
      scoreBySection.set(sid, (scoreBySection.get(sid) ?? 0) + (pointsByQ.get(r.question_id) ?? 0));
    }
    const breakdown = (sections ?? []).map((s) => ({
      sectionId: s.id,
      title: s.title,
      score: scoreBySection.get(s.id) ?? 0,
      max: maxBySection.get(s.id) ?? 0,
    }));

    return { test, attempt, rank, breakdown, released: true };
  });
