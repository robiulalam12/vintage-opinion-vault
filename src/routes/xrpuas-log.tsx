import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TITLE = "User access — People Opinion Box";

export const Route = createFileRoute("/xrpuas-log")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Sign in or sign up for the People Opinion Box user dashboard." },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: "Sign in or sign up for the People Opinion Box user dashboard." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UserAuthPage,
});

function UserAuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setBusy(false);
      if (error) return setStatus(error.message);
      navigate({ to: "/app" });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin + "/xrpuas-log" },
      });
      setBusy(false);
      if (error) return setStatus(error.message);
      if (data.session) navigate({ to: "/app" });
      else setStatus("Account created. Please check your email to confirm, then sign in.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="press-panel w-full max-w-md p-8">
        <p className="small-caps-label">People Opinion Box</p>
        <h1 className="mt-3 font-display text-3xl text-foreground">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Access your private dashboard."
            : "New here? Create an account, then ask the admin for a 7-day access key."}
        </p>

        <div className="mt-4 flex gap-1 rounded-full bg-muted p-1 text-sm">
          <button
            type="button"
            className={`flex-1 rounded-full px-3 py-1.5 ${mode === "signin" ? "bg-background shadow" : "text-muted-foreground"}`}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`flex-1 rounded-full px-3 py-1.5 ${mode === "signup" ? "bg-background shadow" : "text-muted-foreground"}`}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {status ? <p className="mt-4 text-sm text-muted-foreground">{status}</p> : null}

        <div className="press-rule mt-6 flex items-center justify-between py-3 text-sm">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
