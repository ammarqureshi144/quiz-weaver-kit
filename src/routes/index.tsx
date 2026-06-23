import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Clock, ListChecks, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Examly — Online MCQ Testing Platform" },
      { name: "description", content: "Create, deliver and grade timed MCQ tests with anti-cheat protection." },
      { property: "og:title", content: "Examly — Online MCQ Testing" },
      { property: "og:description", content: "Create, deliver and grade timed MCQ tests with anti-cheat protection." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && profile) {
      navigate({
        to: profile.role === "instructor" ? "/instructor/dashboard" : "/student/dashboard",
        replace: true,
      });
    }
  }, [loading, user, profile, navigate]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-surface/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="font-display text-xl font-semibold tracking-tight">Examly</div>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/auth" search={{ mode: "signup" } as any}><Button className="hover-scale">Get started</Button></Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20">
        <section className="mx-auto max-w-3xl text-center animate-fade-in">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Online MCQ testing</p>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
            Run timed exams with{" "}
            <span className="text-primary">calm, focused confidence.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Build multi-section MCQ tests, deliver them with server-authoritative timers and anti-cheat detection, and grade automatically. Designed for academic rigor — no distractions.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth"><Button size="lg" className="hover-scale">Create an account</Button></Link>
            <Link to="/auth"><Button size="lg" variant="outline" className="hover-scale">Sign in</Button></Link>
          </div>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ListChecks, title: "Structured tests", body: "Multi-section MCQs with custom points, shuffle and display options." },
            { icon: Clock, title: "Server timer", body: "Countdown anchored to the server — refresh-proof and tamper-resistant." },
            { icon: ShieldCheck, title: "Anti-cheat", body: "Tab-switch & copy/paste detection with persistent warning counter." },
            { icon: BarChart3, title: "Auto-graded", body: "Instant scoring, ranking and section-wise breakdowns. Release when ready." },
          ].map((f, i) => (
            <div
              key={f.title}
              className="rounded-lg border border-border/70 bg-card/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md animate-fade-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="inline-flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Examly. Built for serious assessments.
        </div>
      </footer>
    </div>
  );
}
