import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  // Hide chrome on the test-taking page (focus mode).
  const isTakeMode = /\/student\/tests\/[^/]+\/take$/.test(pathname);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Setting up your profile…</div>;
  }

  if (isTakeMode) return <Outlet />;

  const home = profile.role === "instructor" ? "/instructor/dashboard" : "/student/dashboard";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-surface/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to={home} className="font-display text-xl font-semibold tracking-tight">Examly</Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {profile.full_name || profile.role} · <span className="capitalize">{profile.role}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-2 size-4" /> Sign out</Button>
          </div>
        </div>
      </header>
      <main className="animate-fade-in"><Outlet /></main>
    </div>
  );
}
