import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { getInstructorResults, setResultsReleased } from "@/lib/test-attempt.functions";
import { downloadCSV, toCSV } from "@/lib/csv";
import { formatDuration } from "@/hooks/use-server-countdown";

export const Route = createFileRoute("/_authenticated/instructor/tests/$testId/results")({
  head: () => ({ meta: [{ title: "Results — Examly" }] }),
  component: ResultsPage,
});

function ResultsPage() {
  const { testId } = Route.useParams();
  const getResults = useServerFn(getInstructorResults);
  const releaseFn = useServerFn(setResultsReleased);
  const [data, setData] = useState<Awaited<ReturnType<typeof getInstructorResults>> | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setData(await getResults({ data: { testId } })); }
    catch (e: any) { toast.error(e.message ?? "Failed to load"); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [testId]);

  async function toggleRelease(v: boolean) {
    setBusy(true);
    try { await releaseFn({ data: { testId, released: v } }); toast.success(v ? "Results released" : "Results held"); await load(); }
    catch (e: any) { toast.error(e.message); }
    setBusy(false);
  }

  function exportCsv() {
    if (!data) return;
    const rows = data.rows.map((r) => {
      const base: Record<string, unknown> = {
        rank: r.rank,
        student: r.studentName,
        score: r.score,
        max_score: r.maxScore,
        time_taken: formatDuration(r.timeTakenSec),
        submission: r.submittedReason,
        warnings: r.warningCount,
      };
      for (const sec of data.sections) base[`section: ${sec.title}`] = r.sectionScores[sec.id] ?? 0;
      return base;
    });
    downloadCSV(`${data.test.title.replace(/\s+/g, "_")}_results.csv`, toCSV(rows));
  }

  if (!data) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;

  const reasonLabel = (r: string) => ({
    normal: "Submitted",
    time_over: "Auto: time over",
    violations: "Auto: violations",
    in_progress: "In progress",
  }[r] ?? r);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link to="/instructor/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{data.test.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data.rows.length} attempt(s)</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
            <Label htmlFor="release" className="cursor-pointer">Release results to students</Label>
            <Switch id="release" checked={data.test.results_released} disabled={busy} onCheckedChange={toggleRelease} />
          </div>
          <Button variant="outline" onClick={exportCsv}><Download className="mr-2 size-4" /> Download CSV</Button>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="font-display">Leaderboard</CardTitle></CardHeader>
        <CardContent className="px-0">
          {data.rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No attempts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Score</TableHead>
                    {data.sections.map((s) => <TableHead key={s.id}>{s.title}</TableHead>)}
                    <TableHead>Time taken</TableHead>
                    <TableHead>Submission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.attemptId}>
                      <TableCell className="font-medium">{r.status === "submitted" ? r.rank : "—"}</TableCell>
                      <TableCell>{r.studentName}</TableCell>
                      <TableCell>{r.status === "submitted" ? `${r.score} / ${r.maxScore}` : "—"}</TableCell>
                      {data.sections.map((s) => <TableCell key={s.id}>{r.sectionScores[s.id] ?? 0}</TableCell>)}
                      <TableCell>{r.status === "submitted" ? formatDuration(r.timeTakenSec) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={r.submittedReason === "violations" ? "border-destructive/40 text-destructive" : ""}>
                          {reasonLabel(String(r.submittedReason))}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
