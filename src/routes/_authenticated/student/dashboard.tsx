import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Clock, Trophy } from "lucide-react";
import { toast } from "sonner";
import { getStudentResult } from "@/lib/test-attempt.functions";

export const Route = createFileRoute("/_authenticated/student/dashboard")({
  head: () => ({ meta: [{ title: "Student dashboard — Examly" }] }),
  component: StudentDashboard,
});

type AvailableTest = {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  results_released: boolean;
  status: "published" | "closed";
};

type AttemptRow = {
  id: string;
  test_id: string;
  status: "in_progress" | "submitted";
  score: number;
  max_score: number;
  submitted_at: string | null;
  submitted_reason: string | null;
};

function StudentDashboard() {
  const { user } = useAuth();
  const [tests, setTests] = useState<AvailableTest[] | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: ts, error: te }, { data: ats, error: ae }] = await Promise.all([
        supabase.from("tests").select("id, title, description, duration_minutes, results_released, status").in("status", ["published", "closed"]).order("created_at", { ascending: false }),
        supabase.from("attempts").select("id, test_id, status, score, max_score, submitted_at, submitted_reason").eq("student_id", user.id),
      ]);
      if (te) toast.error(te.message);
      if (ae) toast.error(ae.message);
      setTests((ts ?? []) as AvailableTest[]);
      setAttempts((ats ?? []) as AttemptRow[]);
    })();
  }, [user]);

  if (!tests) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Available tests</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tests assigned by your instructors.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tests.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3"><CardContent className="flex flex-col items-center py-16 text-center">
            <ClipboardList className="size-10 text-muted-foreground" />
            <p className="mt-3 font-medium">No tests available yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Check back once your instructor publishes a test.</p>
          </CardContent></Card>
        )}
        {tests.map((t) => {
          const att = attempts.find((a) => a.test_id === t.id);
          return <StudentTestCard key={t.id} test={t} attempt={att} />;
        })}
      </div>
    </div>
  );
}

function StudentTestCard({ test, attempt }: { test: AvailableTest; attempt?: AttemptRow }) {
  const status = attempt
    ? attempt.status === "submitted" ? "Submitted" : "In progress"
    : "Not started";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="font-display text-lg">{test.title}</CardTitle>
            <CardDescription className="line-clamp-2">{test.description || "No description"}</CardDescription>
          </div>
          <Badge variant="outline" className={
            status === "Submitted" ? "border-success/40 text-success" :
            status === "In progress" ? "border-warning/40 text-warning-foreground bg-warning/10" : ""
          }>{status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4" /> {test.duration_minutes} minutes
        </p>
        {attempt?.status === "submitted" ? (
          <SubmittedActions testId={test.id} releasedHint={test.results_released} />
        ) : attempt?.status === "in_progress" ? (
          <Link to="/student/tests/$testId/take" params={{ testId: test.id }}>
            <Button className="w-full">Resume test</Button>
          </Link>
        ) : (
          <Link to="/student/tests/$testId/start" params={{ testId: test.id }}>
            <Button className="w-full" disabled={test.status !== "published"}>Start test</Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function SubmittedActions({ testId, releasedHint }: { testId: string; releasedHint: boolean }) {
  const get = useServerFn(getStudentResult);
  const [result, setResult] = useState<Awaited<ReturnType<typeof getStudentResult>> | null>(null);
  const [open, setOpen] = useState(false);

  async function view() {
    setOpen(true);
    try { setResult(await get({ data: { testId } })); } catch (e: any) { toast.error(e.message); }
  }

  if (!releasedHint) {
    return (
      <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        Results will appear once released by your instructor.
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" className="w-full" onClick={view}><Trophy className="mr-2 size-4" /> View result</Button>
      {open && result && (
        <div className="rounded-md border border-border bg-surface p-3 text-sm">
          {!result.released ? (
            <p className="text-muted-foreground">Results not yet released.</p>
          ) : (
            <>
              <p className="font-medium">Score: {result.attempt?.score} / {result.attempt?.max_score}</p>
              {result.rank && <p className="text-muted-foreground">Rank: #{result.rank}</p>}
              <div className="mt-2 space-y-1">
                {result.breakdown.map((b) => (
                  <div key={b.sectionId} className="flex justify-between text-xs">
                    <span>{b.title}</span><span>{b.score} / {b.max}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
