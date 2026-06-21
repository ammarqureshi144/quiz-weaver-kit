import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  startOrResumeAttempt, saveResponse, recordViolation, submitAttempt,
} from "@/lib/test-attempt.functions";
import { seededShuffle } from "@/lib/shuffle";
import { useServerCountdown, formatDuration } from "@/hooks/use-server-countdown";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/student/tests/$testId/take")({
  head: () => ({ meta: [{ title: "Taking test — Examly" }] }),
  component: TakeTest,
});

type StartData = Awaited<ReturnType<typeof startOrResumeAttempt>>;

function TakeTest() {
  const { testId } = Route.useParams();
  const navigate = useNavigate();
  const start = useServerFn(startOrResumeAttempt);
  const save = useServerFn(saveResponse);
  const violate = useServerFn(recordViolation);
  const submit = useServerFn(submitAttempt);

  const [state, setState] = useState<StartData | null>(null);
  const [responses, setResponses] = useState<Record<string, string | null>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [warningOpen, setWarningOpen] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submittingRef = useRef(false);

  // Bootstrap
  useEffect(() => {
    (async () => {
      try {
        const data = await start({ data: { testId } });
        if (data.alreadySubmitted) {
          navigate({ to: "/student/tests/$testId/submitted", params: { testId }, search: { reason: data.attempt.submitted_reason } as any });
          return;
        }
        setState(data);
        setWarningCount(data.attempt.warning_count);
        // Load saved responses
        const { data: existing } = await supabase
          .from("responses").select("question_id, selected_option_id").eq("attempt_id", data.attempt.id);
        const map: Record<string, string | null> = {};
        for (const r of existing ?? []) map[r.question_id] = r.selected_option_id;
        setResponses(map);
      } catch (e: any) { toast.error(e.message ?? "Failed to start test"); navigate({ to: "/student/dashboard" }); }
    })();
  }, [testId, start, navigate]);

  // Build ordered question list (with section grouping). Shuffle deterministically by attempt id.
  const ordered = useMemo(() => {
    if (!state) return [];
    const seed = state.attempt.id;
    const sections = state.sections;
    const out: Array<{ section: typeof sections[number]; question: (typeof state.questions)[number]; options: (typeof state.options) }> = [];
    for (const sec of sections) {
      let qs = state.questions.filter((q) => q.section_id === sec.id);
      if (state.test.shuffle_questions) qs = seededShuffle(qs, `${seed}:q:${sec.id}`);
      for (const q of qs) {
        let opts = state.options.filter((o) => o.question_id === q.id);
        if (state.test.shuffle_questions) opts = seededShuffle(opts, `${seed}:o:${q.id}`);
        out.push({ section: sec, question: q, options: opts });
      }
    }
    return out;
  }, [state]);

  const remaining = useServerCountdown(state?.serverNow ?? null, state?.attempt.end_time ?? null);

  // Auto-submit when timer hits zero
  useEffect(() => {
    if (!state || submittingRef.current) return;
    if (remaining === 0 && state.serverNow) {
      submittingRef.current = true;
      submit({ data: { attemptId: state.attempt.id, reason: "time_over" } })
        .then(() => navigate({ to: "/student/tests/$testId/submitted", params: { testId }, search: { reason: "time_over" } as any }))
        .catch((e) => toast.error(e.message));
    }
  }, [remaining, state, submit, navigate, testId]);

  // Anti-cheat handlers
  const triggerViolation = useCallback(async (kind: string) => {
    if (!state || submittingRef.current) return;
    try {
      const res = await violate({ data: { attemptId: state.attempt.id } });
      setWarningCount(res.warningCount);
      setWarningOpen(true);
      if (res.autoSubmitted) {
        submittingRef.current = true;
        setTimeout(() => navigate({ to: "/student/tests/$testId/submitted", params: { testId }, search: { reason: "violations" } as any }), 1500);
      }
    } catch (e: any) { console.error(e); }
  }, [state, violate, navigate, testId]);

  useEffect(() => {
    if (!state) return;
    const onVisibility = () => { if (document.hidden) triggerViolation("tab"); };
    const onBlur = () => triggerViolation("blur");
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); triggerViolation("copy"); };
    const onCut = (e: ClipboardEvent) => { e.preventDefault(); triggerViolation("cut"); };
    const onPaste = (e: ClipboardEvent) => { e.preventDefault(); triggerViolation("paste"); };
    const onContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContext);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContext);
    };
  }, [state, triggerViolation]);

  async function selectAnswer(questionId: string, optionId: string) {
    if (!state) return;
    setResponses((r) => ({ ...r, [questionId]: optionId }));
    try { await save({ data: { attemptId: state.attempt.id, questionId, selectedOptionId: optionId } }); }
    catch (e: any) { toast.error("Failed to save: " + e.message); }
  }

  async function doSubmit() {
    if (!state || submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submit({ data: { attemptId: state.attempt.id, reason: "normal" } });
      navigate({ to: "/student/tests/$testId/submitted", params: { testId }, search: { reason: "normal" } as any });
    } catch (e: any) { toast.error(e.message); submittingRef.current = false; }
  }

  if (!state) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading test…</div>;

  const answered = ordered.filter((o) => responses[o.question.id]).length;
  const total = ordered.length;
  const oneAtTime = state.test.display_mode === "one";

  return (
    <div className="min-h-screen bg-background select-none">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div>
            <p className="font-display text-base font-semibold">{state.test.title}</p>
            <p className="text-xs text-muted-foreground">{answered} of {total} answered · Warnings: {warningCount}/3</p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-base font-semibold ${remaining < 60 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-background"}`}>
              <Clock className="size-4" /> {formatDuration(remaining)}
            </div>
            <Button onClick={() => setConfirmOpen(true)} variant="default">Submit test</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[1fr_240px]">
        <div className="space-y-6">
          {oneAtTime ? (
            <OneAtATimeView
              item={ordered[currentIdx]}
              index={currentIdx}
              total={ordered.length}
              value={responses[ordered[currentIdx]?.question.id] ?? null}
              onChange={selectAnswer}
              onPrev={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              onNext={() => setCurrentIdx((i) => Math.min(ordered.length - 1, i + 1))}
            />
          ) : (
            <AllAtOnceView ordered={ordered} responses={responses} onChange={selectAnswer} />
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Question palette</p>
              <div className="grid grid-cols-6 gap-2 lg:grid-cols-5">
                {ordered.map((o, i) => {
                  const answered = !!responses[o.question.id];
                  const current = oneAtTime && i === currentIdx;
                  return (
                    <button
                      key={o.question.id}
                      onClick={() => oneAtTime ? setCurrentIdx(i) : document.getElementById(`q-${o.question.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      className={`flex h-9 w-9 items-center justify-center rounded-md border text-xs font-medium ${
                        current ? "border-accent bg-accent text-accent-foreground" :
                        answered ? "border-success/40 bg-success/10 text-success" :
                        "border-border bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >{i + 1}</button>
                  );
                })}
              </div>
              <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><span className="inline-block size-3 rounded-sm bg-success/20 ring-1 ring-success/40" /> Answered</div>
                <div className="flex items-center gap-2"><span className="inline-block size-3 rounded-sm bg-background ring-1 ring-border" /> Unanswered</div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <AlertDialog open={warningOpen} onOpenChange={setWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" /> Warning {warningCount} of 3
            </AlertDialogTitle>
            <AlertDialogDescription>
              {warningCount >= 3
                ? "You exceeded the warning limit. Your test is being submitted automatically."
                : "Switching tabs, leaving the window, or copying/pasting is not allowed during the test. Further violations will auto-submit your test."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>I understand</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your test?</AlertDialogTitle>
            <AlertDialogDescription>
              You have answered <strong>{answered}</strong> of <strong>{total}</strong> questions.
              {answered < total && <> {total - answered} unanswered question(s) will be marked as not attempted.</>} This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit}>Submit now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OneAtATimeView({ item, index, total, value, onChange, onPrev, onNext }: {
  item: { section: any; question: any; options: any[] };
  index: number; total: number;
  value: string | null;
  onChange: (qid: string, oid: string) => void;
  onPrev: () => void; onNext: () => void;
}) {
  if (!item) return null;
  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <Badge variant="outline">{item.section.title}</Badge>
          <p className="text-sm text-muted-foreground">Question {index + 1} of {total} · {item.question.points} pt{item.question.points > 1 ? "s" : ""}</p>
        </div>
        <h2 className="font-display text-xl font-semibold leading-snug">{item.question.text}</h2>
        <RadioGroup value={value ?? ""} onValueChange={(v) => onChange(item.question.id, v)} className="space-y-2">
          {item.options.map((opt: any) => (
            <label key={opt.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent/10">
              <RadioGroupItem value={opt.id} />
              <span>{opt.text}</span>
            </label>
          ))}
        </RadioGroup>
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onPrev} disabled={index === 0}><ChevronLeft className="mr-1 size-4" /> Previous</Button>
          <Button onClick={onNext} disabled={index === total - 1}>Next <ChevronRight className="ml-1 size-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AllAtOnceView({ ordered, responses, onChange }: {
  ordered: Array<{ section: any; question: any; options: any[] }>;
  responses: Record<string, string | null>;
  onChange: (qid: string, oid: string) => void;
}) {
  let lastSection: string | null = null;
  return (
    <div className="space-y-6">
      {ordered.map((item, i) => {
        const showSection = item.section.id !== lastSection;
        lastSection = item.section.id;
        return (
          <div key={item.question.id}>
            {showSection && <h2 className="mb-3 font-display text-lg font-semibold">{item.section.title}</h2>}
            <Card id={`q-${item.question.id}`}>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Q{i + 1}</p>
                  <p className="text-xs text-muted-foreground">{item.question.points} pt{item.question.points > 1 ? "s" : ""}</p>
                </div>
                <p className="font-display text-base leading-snug">{item.question.text}</p>
                <RadioGroup value={responses[item.question.id] ?? ""} onValueChange={(v) => onChange(item.question.id, v)} className="space-y-2">
                  {item.options.map((opt: any) => (
                    <label key={opt.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                      <RadioGroupItem value={opt.id} />
                      <span>{opt.text}</span>
                    </label>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
