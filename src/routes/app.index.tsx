import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Flame, ListOrdered, PenLine, Settings, ShieldAlert, ShieldCheck } from "lucide-react";

import {
  listMyOrders,
  listMyReviews,
  listMyDmca,
  listMyPolicy,
  listMyFakeReviews,
  myProfile,
} from "@/lib/user-dashboard.functions";

export const Route = createFileRoute("/app/")({
  component: Home,
});

function Card({
  label,
  value,
  to,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  to: string;
  icon: typeof ListOrdered;
  accent: "cyan" | "violet";
}) {
  return (
    <Link
      to={to}
      className="press-panel group relative block overflow-hidden p-6"
    >
      <div
        aria-hidden
        className={
          accent === "cyan"
            ? "absolute -right-6 -top-6 size-24 rounded-full bg-cyan-400/10 blur-2xl transition-all group-hover:bg-cyan-400/20"
            : "absolute -right-6 -top-6 size-24 rounded-full bg-violet-500/10 blur-2xl transition-all group-hover:bg-violet-500/20"
        }
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="small-caps-label">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold tracking-tight">{value}</p>
        </div>
        <span
          className={
            accent === "cyan"
              ? "grid size-9 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
              : "grid size-9 place-items-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-300"
          }
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="relative mt-4 flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors group-hover:text-cyan-300">
        Open tool
        <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </p>
    </Link>
  );
}

function Home() {
  const p = useServerFn(myProfile);
  const orders = useServerFn(listMyOrders);
  const reviews = useServerFn(listMyReviews);
  const dmca = useServerFn(listMyDmca);
  const policy = useServerFn(listMyPolicy);
  const fake = useServerFn(listMyFakeReviews);

  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => p() });
  const q1 = useQuery({ queryKey: ["my-orders"], queryFn: () => orders() });
  const q2 = useQuery({ queryKey: ["my-reviews"], queryFn: () => reviews() });
  const q3 = useQuery({ queryKey: ["my-dmca"], queryFn: () => dmca() });
  const q4 = useQuery({ queryKey: ["my-policy"], queryFn: () => policy() });
  const q5 = useQuery({ queryKey: ["my-fake"], queryFn: () => fake() });

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 lg:p-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Welcome{profile.data ? `, ${profile.data.displayName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.data ? (
            <>
              Your public profile:{" "}
              <a
                href={`/u/${profile.data.handle}`}
                className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-4 hover:decoration-cyan-300"
                target="_blank"
                rel="noreferrer"
              >
                /u/{profile.data.handle}
              </a>
            </>
          ) : (
            "Loading…"
          )}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="Review Orders" value={q1.data?.length ?? 0} to="/app/orders" icon={ListOrdered} accent="cyan" />
        <Card label="My Reviews" value={q2.data?.length ?? 0} to="/app/post" icon={PenLine} accent="violet" />
        <Card label="DMCA Reports" value={q3.data?.length ?? 0} to="/app/dmca" icon={ShieldCheck} accent="cyan" />
        <Card label="Policy Items" value={q4.data?.length ?? 0} to="/app/policy" icon={ShieldAlert} accent="violet" />
        <Card label="Fake Reviews" value={q5.data?.length ?? 0} to="/app/fake-reviews" icon={Flame} accent="cyan" />
        <Card label="Settings" value="→" to="/app/settings" icon={Settings} accent="violet" />
      </div>
    </div>
  );
}
