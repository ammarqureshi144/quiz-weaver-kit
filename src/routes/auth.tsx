import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Examly" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && profile) {
      navigate({
        to: profile.role === "instructor" ? "/instructor/dashboard" : "/student/dashboard",
        replace: true,
      });
    }
  }, [loading, user, profile, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <Link to="/" className="mb-6 block text-center font-display text-2xl font-semibold tracking-tight">
          Examly
        </Link>
        <Card className="border-border/70 bg-card/90 shadow-lg backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-display">Welcome</CardTitle>
            <CardDescription>Sign in or create an account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={mode === "signup" ? "signup" : "signin"}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-6 animate-fade-in"><SignInForm /></TabsContent>
              <TabsContent value="signup" className="mt-6 animate-fade-in"><SignUpForm /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Signed in");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}

function SignUpForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "instructor">("student");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, role },
      },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Account created");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email2">Email</Label>
        <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password2">Password</Label>
        <Input id="password2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="space-y-2">
        <Label>I am a</Label>
        <RadioGroup value={role} onValueChange={(v) => setRole(v as any)} className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-3 hover:bg-accent/5 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
            <RadioGroupItem value="student" /> Student
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-3 hover:bg-accent/5 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
            <RadioGroupItem value="instructor" /> Instructor
          </label>
        </RadioGroup>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
    </form>
  );
}
