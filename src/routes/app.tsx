import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Flame,
  Home,
  LayoutGrid,
  ListOrdered,
  LogOut,
  Menu,
  PenLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
  Zap,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { myAccessStatus } from "@/lib/user-dashboard.functions";
import { cn } from "@/lib/utils";

const TITLE = "My dashboard — People Opinion Box";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Private user dashboard for People Opinion Box." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UserAppLayout,
});

const NAV = [
  { to: "/app", label: "Dashboard", exact: true, icon: LayoutGrid },
  { to: "/app/profiles", label: "Reviewer Profiles", exact: false, icon: Users },
  { to: "/app/orders", label: "Review Orders", exact: false, icon: ListOrdered },
  { to: "/app/post", label: "Post Reviews", exact: false, icon: PenLine },
  { to: "/app/dmca", label: "DMCA Reports", exact: false, icon: ShieldCheck },
  { to: "/app/policy", label: "Policy Violation", exact: false, icon: ShieldAlert },
  { to: "/app/fake-reviews", label: "Fake Reviews", exact: false, icon: Flame },
  { to: "/app/guide", label: "Guide", exact: false, icon: BookOpen },
  { to: "/app/settings", label: "Settings", exact: false, icon: Settings },
] as const;

function pageTitle(pathname: string): string {
  const match = NAV.find((item) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to),
  );
  return match?.label ?? "Dashboard";
}

function UserAppLayout() {
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/xrpuas-log" });
        return;
      }
      setEmail(data.session.user.email ?? "");
      setSessionReady(true);
    });
  }, [navigate]);

  const check = useServerFn(myAccessStatus);
  const q = useQuery({
    queryKey: ["my-access-status"],
    queryFn: () => check(),
    enabled: sessionReady,
    refetchInterval: 60_000,
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/xrpuas-log" });
  };

  if (!sessionReady || q.isLoading) {
    return (
      <div className="udash flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const status = q.data;
  const active = Boolean(status?.active);
  const onSettings = pathname.startsWith("/app/settings");
  const initials = (email.slice(0, 1) || "U").toUpperCase();

  return (
    <div className="udash min-h-screen bg-background lg:flex">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-600 shadow-[0_0_15px_rgba(34,211,238,0.4)]"
          >
            <Zap className="size-4 text-white" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-bold uppercase tracking-tight">
              My workspace
            </span>
            <span className="block truncate text-[0.65rem] uppercase tracking-[0.18em] text-sidebar-muted">
              User dashboard
            </span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className={cn(
                "udash-nav-link flex items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium text-sidebar-muted transition-all hover:bg-white/5 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
          <Link
            to="/"
            className="mt-1 flex items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium text-sidebar-muted transition-all hover:bg-white/5 hover:text-sidebar-foreground"
          >
            <Home className="size-[18px] shrink-0" />
            <span className="truncate">Public site</span>
          </Link>
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-gradient-to-tr from-sidebar to-cyan-400/20 text-xs font-bold uppercase text-cyan-400"
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">Signed in</p>
              <p className="truncate text-[0.7rem] text-sidebar-muted">{email}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="rounded-lg p-2 text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-clip">
        <div aria-hidden className="udash-glow-cyan" />
        <div aria-hidden className="udash-glow-violet" />

        {/* Topbar */}
        <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3.5 lg:px-8">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-600 shadow-[0_0_12px_rgba(34,211,238,0.35)] lg:hidden"
          >
            <Zap className="size-4 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-sm font-semibold sm:text-base">
              {pageTitle(pathname)}
            </h2>
            <p className="hidden text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">
              My workspace
            </p>
          </div>
          {status?.isAdmin ? (
            <span className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[0.7rem] font-semibold text-violet-300 sm:px-3 sm:text-xs">
              Admin
            </span>
          ) : (
            <span
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold sm:px-3 sm:text-xs",
                active
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300",
              )}
            >
              {active ? "● Key active" : `Key ${status?.keyStatus ?? "none"}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-foreground transition-colors hover:border-cyan-400/40 hover:text-cyan-300 lg:hidden"
          >
            <Menu className="size-5" />
          </button>
        </header>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            />
            <aside className="absolute right-0 top-0 flex h-full w-[82%] max-w-xs flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_0_40px_rgba(34,211,238,0.15)]">
              <div className="flex items-center justify-between px-5 py-4">
                <span className="font-display text-sm font-bold uppercase tracking-tight">Menu</span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="grid size-9 place-items-center rounded-lg text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.exact }}
                    onClick={() => setMenuOpen(false)}
                    className="udash-nav-link flex items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium text-sidebar-muted transition-all hover:bg-white/5 hover:text-sidebar-foreground"
                  >
                    <item.icon className="size-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"
                >
                  <Home className="size-[18px] shrink-0" />
                  <span className="truncate">Public site</span>
                </Link>
              </nav>
              <div className="border-t border-sidebar-border p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-xs font-bold text-cyan-400">
                    {initials}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-xs text-sidebar-muted">{email}</p>
                  <button
                    type="button"
                    onClick={signOut}
                    aria-label="Sign out"
                    className="rounded-lg p-2 text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"
                  >
                    <LogOut className="size-4" />
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}

        <main className="relative z-0 min-w-0 flex-1">
          {active || onSettings ? (
            <Outlet />
          ) : (
            <div className="mx-auto max-w-xl px-5 py-16">
              <div className="press-panel p-8 text-center">
                <div className="relative mx-auto mb-6 w-fit">
                  <div aria-hidden className="absolute inset-0 rounded-3xl bg-violet-600/20 blur-[40px]" />
                  <div className="relative grid size-20 place-items-center rounded-3xl border border-white/10 bg-gradient-to-br from-card to-cyan-400/20">
                    <ShieldCheck className="size-9 text-cyan-400" />
                  </div>
                </div>
                <h1 className="font-display text-2xl">Your access key is not active</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  Key status: <strong>{status?.keyStatus ?? "none"}</strong>. Open Settings to enter a
                  7-day key, or message the admin to request one.
                </p>
                <div className="mt-6 flex justify-center gap-2">
                  <Button asChild>
                    <Link to="/app/settings">Open Settings</Link>
                  </Button>
                  <Button variant="outline" onClick={signOut}>
                    Sign out
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
