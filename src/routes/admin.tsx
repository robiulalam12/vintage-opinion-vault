import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Bot,
  ExternalLink,
  Database,
  Flame,
  LayoutGrid,
  ListOrdered,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { myDashboardAccess } from "@/lib/access.functions";
import { cn } from "@/lib/utils";

const TITLE = "Dashboard — People Opinion Box";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Private review dashboard for People Opinion Box." },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: "Private review dashboard for People Opinion Box." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Dashboard", exact: true, icon: LayoutGrid },
  { to: "/admin/orders", label: "Review orders", exact: false, icon: ListOrdered },
  { to: "/admin/write", label: "Write review", exact: false, icon: PenLine },
  { to: "/admin/robiul", label: "Post Reviews", exact: false, icon: UserRound },
  { to: "/admin/afridi", label: "Afridi reviews", exact: false, icon: UserRound },
  { to: "/admin/dmca", label: "DMCA reports", exact: false, icon: ShieldCheck },
  { to: "/admin/policy", label: "Policy violation", exact: false, icon: ShieldAlert },
  { to: "/admin/fake-reviews", label: "Fake reviews", exact: false, icon: Flame },
  { to: "/admin/archive", label: "Old site archive", exact: false, icon: Database },
  { to: "/admin/ai", label: "AI Pro", exact: false, icon: Bot },
  { to: "/admin/users", label: "User management", exact: false, icon: Users },
] as const;

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/admin/orders")) return "Review orders";
  if (pathname.startsWith("/admin/write")) return "Write review";
  if (pathname.startsWith("/admin/robiul")) return "Post Reviews";
  if (pathname.startsWith("/admin/afridi")) return "Afridi reviews";
  if (pathname.startsWith("/admin/dmca")) return "DMCA reports";
  if (pathname.startsWith("/admin/policy")) return "Policy violation";
  if (pathname.startsWith("/admin/fake-reviews")) return "Fake reviews";
  if (pathname.startsWith("/admin/archive")) return "Old site archive";
  if (pathname.startsWith("/admin/ai")) return "AI Pro";
  if (pathname.startsWith("/admin/users")) return "User management";
  if (pathname.startsWith("/admin/import")) return "Review orders";
  return "Dashboard";
}

function AdminLayout() {
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(data.session.user.email ?? "");
      setSessionReady(true);
    });
  }, [navigate]);

  const checkAccess = useServerFn(myDashboardAccess);
  const accessQuery = useQuery({
    queryKey: ["dashboard-access"],
    queryFn: () => checkAccess(),
    enabled: sessionReady,
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (!sessionReady || accessQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  const access = accessQuery.data;
  const isAdmin = Boolean(access?.isAdmin);
  const reviewerKeys = access?.reviewerKeys ?? [];

  if (!isAdmin && reviewerKeys.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="press-panel max-w-md p-8 text-center">
          <h1 className="font-display text-2xl text-foreground">Not authorised</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This dashboard is reserved for approved editors.
          </p>
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sections = access?.sections ?? [];
  const allowedPaths = isAdmin
    ? null
    : [
        ...reviewerKeys.map((key) => `/admin/${key}`),
        ...(sections.includes("dashboard") ? ["/admin"] : []),
        ...(sections.includes("ai_pro") ? ["/admin/ai"] : []),
        ...(sections.includes("policy") ? ["/admin/policy"] : []),
        ...(sections.includes("fake_reviews") ? ["/admin/fake-reviews"] : []),
        ...(sections.includes("users") ? ["/admin/users"] : []),
      ];
  const pathAllowed =
    !allowedPaths ||
    allowedPaths.some((path) =>
      path === "/admin"
        ? pathname === "/admin"
        : pathname === path || pathname.startsWith(`${path}/`),
    );


  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-5",
          collapsed && "lg:justify-center lg:px-2",
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-accent text-sm font-bold text-sidebar-accent-foreground"
        >
          P
        </span>
        {!collapsed ? (
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-bold tracking-tight uppercase">
              People Opinion Box
            </span>
            <span className="block truncate text-[0.68rem] tracking-[0.14em] text-sidebar-muted uppercase">
              Review tracker
            </span>
          </span>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact }}
            onClick={() => setMobileOpen(false)}
            title={item.label}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-border/60 hover:text-sidebar-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground",
              collapsed && "lg:justify-center lg:px-2",
            )}
          >
            <item.icon className="size-[18px] shrink-0" />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </Link>
        ))}

        <Link
          to="/"
          title="Public site"
          className={cn(
            "mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-border/60 hover:text-sidebar-foreground",
            collapsed && "lg:justify-center lg:px-2",
          )}
        >
          <ExternalLink className="size-[18px] shrink-0" />
          {!collapsed ? <span className="truncate">Public site</span> : null}
        </Link>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl px-2 py-2",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-border text-xs font-semibold uppercase"
          >
            {email.slice(0, 1) || "A"}
          </span>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">Site editor</p>
              <p className="truncate text-[0.7rem] text-sidebar-muted">{email}</p>
            </div>
          ) : null}
          {!collapsed ? (
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="rounded-lg p-2 text-sidebar-muted transition-colors hover:bg-sidebar-border/60 hover:text-sidebar-foreground"
            >
              <LogOut className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/40 lg:flex">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 lg:block",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        {sidebar}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background px-4 py-3 lg:px-6">
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {pageTitle(pathname)}
          </h2>
          {isAdmin ? (
            <Button asChild size="sm" className="rounded-full px-4">
              <Link to="/admin/orders">New order</Link>
            </Button>
          ) : null}
        </header>

        {mobileOpen ? <div className="lg:hidden">{sidebar}</div> : null}

        <main className="min-w-0">
          {pathAllowed ? (
            <Outlet />
          ) : (
            <div className="mx-auto max-w-xl px-5 py-20">
              <div className="press-panel p-8 text-center">
                <h1 className="font-display text-2xl text-foreground">Access not granted</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  You don't have permission to use this section. You can post reviews on your own
                  profile page.
                </p>
                {reviewerKeys[0] ? (
                  <div className="mt-6 flex justify-center">
                    <Button asChild>
                      <a href={`/admin/${reviewerKeys[0]}`}>Go to my reviews</a>
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
