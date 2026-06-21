import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/instructor/tests/$testId")({
  head: () => ({ meta: [{ title: "Edit test — Examly" }] }),
  component: TestBuilder,
});

type TestRow = {
  id: string; title: string; description: string; duration_minutes: number;
  shuffle_questions: boolean; display_mode: "one" | "all";
  status: "draft" | "published" | "closed"; results_released: boolean;
};
type Section = { id: string; test_id: string; title: string; position: number };
type Question = { id: string; section_id: string; text: string; points: number; position: number };
type Option = { id: string; question_id: string; text: string; is_correct: boolean; position: number };

function TestBuilder() {
  const { testId } = Route.useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<TestRow | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from("tests").select("*").eq("id", testId).maybeSingle(),
      supabase.from("sections").select("*").eq("test_id", testId).order("position"),
    ]);
    if (!t) { toast.error("Test not found"); navigate({ to: "/instructor/dashboard" }); return; }
    setTest(t as TestRow);
    setSections((s ?? []) as Section[]);
    const sectionIds = (s ?? []).map((x) => x.id);
    if (sectionIds.length) {
      const { data: q } = await supabase.from("questions").select("*").in("section_id", sectionIds).order("position");
      setQuestions((q ?? []) as Question[]);
      const questionIds = (q ?? []).map((x) => x.id);
      if (questionIds.length) {
        const { data: o } = await supabase.from("options").select("*").in("question_id", questionIds).order("position");
        setOptions((o ?? []) as Option[]);
      } else setOptions([]);
    } else { setQuestions([]); setOptions([]); }
    setLoading(false);
  }, [testId, navigate]);

  useEffect(() => { load(); }, [load]);

  async function saveTest() {
    if (!test) return;
    const { error } = await supabase.from("tests").update({
      title: test.title, description: test.description, duration_minutes: test.duration_minutes,
      shuffle_questions: test.shuffle_questions, display_mode: test.display_mode,
    }).eq("id", test.id);
    if (error) toast.error(error.message); else toast.success("Saved");
  }

  async function setStatus(status: TestRow["status"]) {
    if (!test) return;
    if (status === "published") {
      // sanity check
      if (questions.length === 0) { toast.error("Add at least one question before publishing"); return; }
      const bad = questions.some((q) => {
        const opts = options.filter((o) => o.question_id === q.id);
        return opts.length < 2 || !opts.some((o) => o.is_correct);
      });
      if (bad) { toast.error("Each question needs 2+ options and one marked correct"); return; }
    }
    const { error } = await supabase.from("tests").update({ status }).eq("id", test.id);
    if (error) toast.error(error.message); else { toast.success(`Test ${status}`); setTest({ ...test, status }); }
  }

  async function addSection() {
    const { data, error } = await supabase.from("sections").insert({
      test_id: testId, title: "New section", position: sections.length,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setSections([...sections, data as Section]);
  }

  async function updateSection(id: string, title: string) {
    setSections(sections.map((s) => s.id === id ? { ...s, title } : s));
    await supabase.from("sections").update({ title }).eq("id", id);
  }
  async function deleteSection(id: string) {
    await supabase.from("sections").delete().eq("id", id);
    setSections(sections.filter((s) => s.id !== id));
    setQuestions(questions.filter((q) => q.section_id !== id));
  }

  async function addQuestion(sectionId: string) {
    const pos = questions.filter((q) => q.section_id === sectionId).length;
    const { data: q, error } = await supabase.from("questions").insert({
      section_id: sectionId, text: "New question", points: 1, position: pos,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    const { data: opts } = await supabase.from("options").insert([
      { question_id: q.id, text: "Option A", is_correct: true, position: 0 },
      { question_id: q.id, text: "Option B", is_correct: false, position: 1 },
      { question_id: q.id, text: "Option C", is_correct: false, position: 2 },
      { question_id: q.id, text: "Option D", is_correct: false, position: 3 },
    ]).select();
    setQuestions([...questions, q as Question]);
    setOptions([...options, ...((opts ?? []) as Option[])]);
  }

  async function updateQuestion(id: string, patch: Partial<Question>) {
    setQuestions(questions.map((q) => q.id === id ? { ...q, ...patch } : q));
    await supabase.from("questions").update(patch).eq("id", id);
  }
  async function deleteQuestion(id: string) {
    await supabase.from("questions").delete().eq("id", id);
    setQuestions(questions.filter((q) => q.id !== id));
    setOptions(options.filter((o) => o.question_id !== id));
  }

  async function addOption(questionId: string) {
    const pos = options.filter((o) => o.question_id === questionId).length;
    const { data, error } = await supabase.from("options").insert({
      question_id: questionId, text: `Option ${String.fromCharCode(65 + pos)}`, is_correct: false, position: pos,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setOptions([...options, data as Option]);
  }
  async function updateOption(id: string, patch: Partial<Option>) {
    let next = options.map((o) => o.id === id ? { ...o, ...patch } : o);
    // ensure only one correct per question if marking correct
    if (patch.is_correct === true) {
      const target = next.find((o) => o.id === id)!;
      next = next.map((o) => o.question_id === target.question_id ? { ...o, is_correct: o.id === id } : o);
      const others = next.filter((o) => o.question_id === target.question_id && o.id !== id);
      await Promise.all(others.map((o) => supabase.from("options").update({ is_correct: false }).eq("id", o.id)));
    }
    setOptions(next);
    await supabase.from("options").update(patch).eq("id", id);
  }
  async function deleteOption(id: string) {
    await supabase.from("options").delete().eq("id", id);
    setOptions(options.filter((o) => o.id !== id));
  }

  if (loading || !test) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  const isDraft = test.status === "draft";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link to="/instructor/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="font-display text-2xl">Test settings</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{test.status}</Badge>
            {test.status === "draft" && <Button size="sm" onClick={() => setStatus("published")}>Publish</Button>}
            {test.status === "published" && <Button size="sm" variant="outline" onClick={() => setStatus("closed")}>Close</Button>}
            {test.status === "closed" && <Button size="sm" variant="outline" onClick={() => setStatus("published")}>Re-open</Button>}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Title</Label>
            <Input value={test.title} onChange={(e) => setTest({ ...test, title: e.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={test.description} onChange={(e) => setTest({ ...test, description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Input type="number" min={1} value={test.duration_minutes} onChange={(e) => setTest({ ...test, duration_minutes: parseInt(e.target.value || "1") })} />
          </div>
          <div className="space-y-2">
            <Label>Display mode</Label>
            <RadioGroup value={test.display_mode} onValueChange={(v) => setTest({ ...test, display_mode: v as any })} className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                <RadioGroupItem value="one" /> One at a time
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                <RadioGroupItem value="all" /> All on one page
              </label>
            </RadioGroup>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3 md:col-span-2">
            <div><Label>Shuffle questions</Label><p className="text-xs text-muted-foreground">Different order per student, stable on reload.</p></div>
            <Switch checked={test.shuffle_questions} onCheckedChange={(v) => setTest({ ...test, shuffle_questions: v })} />
          </div>
          <div className="md:col-span-2"><Button onClick={saveTest}><Save className="mr-2 size-4" /> Save settings</Button></div>
        </CardContent>
      </Card>

      <div className="mt-8 flex items-end justify-between">
        <h2 className="font-display text-xl font-semibold">Sections & questions</h2>
        {isDraft && <Button onClick={addSection}><Plus className="mr-2 size-4" /> Add section</Button>}
      </div>

      <div className="mt-4 space-y-6">
        {sections.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No sections yet. {isDraft ? "Add one to start." : "This test has no sections."}
          </p>
        )}
        {sections.map((s) => (
          <Card key={s.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <Input value={s.title} disabled={!isDraft} onChange={(e) => updateSection(s.id, e.target.value)} className="font-display text-lg" />
              {isDraft && (
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="size-4 text-destructive" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete section?</AlertDialogTitle>
                      <AlertDialogDescription>All questions in this section will be removed.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteSection(s.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {questions.filter((q) => q.section_id === s.id).map((q, qi) => {
                const qOpts = options.filter((o) => o.question_id === q.id);
                return (
                  <div key={q.id} className="rounded-md border border-border p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-2 text-sm font-medium text-muted-foreground">Q{qi + 1}.</span>
                      <Textarea rows={2} disabled={!isDraft} value={q.text} onChange={(e) => updateQuestion(q.id, { text: e.target.value })} />
                      <div className="flex w-24 flex-col gap-1">
                        <Label className="text-xs">Points</Label>
                        <Input type="number" min={1} disabled={!isDraft} value={q.points} onChange={(e) => updateQuestion(q.id, { points: parseInt(e.target.value || "1") })} />
                      </div>
                      {isDraft && (
                        <Button variant="ghost" size="icon" onClick={() => deleteQuestion(q.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 space-y-2 pl-8">
                      {qOpts.map((o) => (
                        <div key={o.id} className="flex items-center gap-2">
                          <Checkbox checked={o.is_correct} disabled={!isDraft} onCheckedChange={(v) => updateOption(o.id, { is_correct: !!v })} />
                          <Input value={o.text} disabled={!isDraft} onChange={(e) => updateOption(o.id, { text: e.target.value })} />
                          {isDraft && qOpts.length > 2 && (
                            <Button variant="ghost" size="icon" onClick={() => deleteOption(o.id)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {isDraft && <Button variant="outline" size="sm" onClick={() => addOption(q.id)}><Plus className="mr-2 size-4" /> Add option</Button>}
                    </div>
                  </div>
                );
              })}
              {isDraft && <Button variant="outline" onClick={() => addQuestion(s.id)}><Plus className="mr-2 size-4" /> Add question</Button>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
