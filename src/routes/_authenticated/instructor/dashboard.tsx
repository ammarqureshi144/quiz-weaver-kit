import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, FileText, BarChart3, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/instructor/dashboard")({
  head: () => ({ meta: [{ title: "Instructor dashboard — Examly" }] }),
  component: InstructorDashboard,
});

type Test = {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  status: "draft" | "published" | "closed";
  results_released: boolean;
  created_at: string;
};

function InstructorDashboard() {
  const { user } = useAuth();
  const [tests, setTests] = useState<Test[] | null>(null);

  async function load() {
    if (!user) return;
    const { data, error } = await supabase
      .from("tests")
      .select("id, title, description, duration_minutes, status, results_released, created_at")
      .eq("instructor_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setTests(data ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Your tests</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create, edit and publish MCQ assessments.</p>
        </div>
        <CreateTestDialog onCreated={load} />
      </div>

      <div className="mt-8">
        {tests === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tests.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="size-10 text-muted-foreground" />
            <p className="mt-3 font-medium">No tests yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first test to get started.</p>
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tests.map((t) => <TestCard key={t.id} test={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function statusBadge(status: Test["status"]) {
  const map = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    published: { label: "Published", className: "bg-success/10 text-success border-success/30" },
    closed: { label: "Closed", className: "bg-destructive/10 text-destructive border-destructive/30" },
  } as const;
  const v = map[status];
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
}

function TestCard({ test }: { test: Test }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-lg">{test.title}</CardTitle>
            <CardDescription className="line-clamp-2">{test.description || "No description"}</CardDescription>
          </div>
          {statusBadge(test.status)}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{test.duration_minutes} min · {test.results_released ? "Results released" : "Results held"}</p>
        <div className="mt-2 flex gap-2">
          <Link to="/instructor/tests/$testId" params={{ testId: test.id }} className="flex-1">
            <Button variant="outline" size="sm" className="w-full"><Pencil className="mr-2 size-4" /> Edit</Button>
          </Link>
          <Link to="/instructor/tests/$testId/results" params={{ testId: test.id }} className="flex-1">
            <Button variant="outline" size="sm" className="w-full"><BarChart3 className="mr-2 size-4" /> Results</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateTestDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [shuffle, setShuffle] = useState(false);
  const [displayMode, setDisplayMode] = useState<"one" | "all">("one");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("tests").insert({
      instructor_id: user.id,
      title, description,
      duration_minutes: duration,
      shuffle_questions: shuffle,
      display_mode: displayMode,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Test created");
    setOpen(false); setTitle(""); setDescription(""); setDuration(30); setShuffle(false); setDisplayMode("one");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 size-4" /> Create test</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">New test</DialogTitle>
          <DialogDescription>You can add sections and questions after creating it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label>Title</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-2"><Label>Duration (minutes)</Label><Input type="number" min={1} required value={duration} onChange={(e) => setDuration(parseInt(e.target.value || "0"))} /></div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div><Label>Shuffle questions</Label><p className="text-xs text-muted-foreground">Randomize per student.</p></div>
            <Switch checked={shuffle} onCheckedChange={setShuffle} />
          </div>
          <div className="space-y-2">
            <Label>Display mode</Label>
            <RadioGroup value={displayMode} onValueChange={(v) => setDisplayMode(v as any)} className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                <RadioGroupItem value="one" /> One at a time
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                <RadioGroupItem value="all" /> All on one page
              </label>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create test"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
