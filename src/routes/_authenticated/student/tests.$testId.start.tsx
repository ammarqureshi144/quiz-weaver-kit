import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle, Clock, ListChecks } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/tests/$testId/start")({
  head: () => ({ meta: [{ title: "Test instructions — Examly" }] }),
  component: StartPage,
});

function StartPage() {
  const { testId } = Route.useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [questionCount, setQuestionCount] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("tests").select("*").eq("id", testId).maybeSingle();
      if (!t) { toast.error("Test not found"); return; }
      setTest(t);
      const { data: sections } = await supabase.from("sections").select("id").eq("test_id", testId);
      const ids = (sections ?? []).map((s) => s.id);
      if (ids.length) {
        const { count } = await supabase.from("questions").select("id", { count: "exact", head: true }).in("section_id", ids);
        setQuestionCount(count ?? 0);
      }
    })();
  }, [testId]);

  if (!test) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link to="/student/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="font-display text-2xl">{test.title}</CardTitle>
          <CardDescription>{test.description || "No description provided."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-md border border-border bg-surface p-4">
              <Clock className="size-5 text-accent" />
              <p className="mt-2 text-sm text-muted-foreground">Duration</p>
              <p className="font-display text-lg font-semibold">{test.duration_minutes} minutes</p>
            </div>
            <div className="rounded-md border border-border bg-surface p-4">
              <ListChecks className="size-5 text-accent" />
              <p className="mt-2 text-sm text-muted-foreground">Questions</p>
              <p className="font-display text-lg font-semibold">{questionCount}</p>
            </div>
          </div>

          <div className="rounded-md border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 text-warning-foreground" />
              <div className="text-sm">
                <p className="font-medium text-warning-foreground">Anti-cheat is active</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Switching tabs or windows is detected.</li>
                  <li>Copy, cut and paste are blocked.</li>
                  <li>You have <strong>3 warnings</strong>. The 3rd violation auto-submits your test.</li>
                  <li>The timer is server-recorded and continues if you refresh.</li>
                </ul>
              </div>
            </div>
          </div>

          <Button className="w-full" size="lg" onClick={() => navigate({ to: "/student/tests/$testId/take", params: { testId } })}>
            Begin test
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
