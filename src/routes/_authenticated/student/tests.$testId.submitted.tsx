import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/student/tests/$testId/submitted")({
  head: () => ({ meta: [{ title: "Test submitted — Examly" }] }),
  component: Submitted,
});

function Submitted() {
  const reason = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("reason");
  const reasonText =
    reason === "violations" ? "Your test was automatically submitted because the warning limit was exceeded." :
    reason === "time_over" ? "Time is over. Your test was automatically submitted." :
    "Your responses have been recorded.";

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-14 text-success" />
          <CardTitle className="mt-4 font-display text-2xl">Test submitted</CardTitle>
          <CardDescription>{reasonText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
            Your results will be available once released by your instructor.
          </p>
          <Link to="/student/dashboard"><Button>Back to dashboard</Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}
