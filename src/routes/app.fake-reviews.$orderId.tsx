import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Droplets, Flame, Loader2, Pause, StopCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getMyOrder,
  fireMyOrderWave,
  cancelMyOrder,
  startMyDrip,
  pauseMyDrip,
} from "@/lib/user-fake-reviews.functions";

const DRIP_OPTIONS: Array<{ label: string; sec: number }> = [
  { label: "30 sec", sec: 30 },
  { label: "1 min", sec: 60 },
  { label: "2 min", sec: 120 },
  { label: "3 min", sec: 180 },
  { label: "5 min", sec: 300 },
  { label: "10 min", sec: 600 },
  { label: "15 min", sec: 900 },
  { label: "20 min", sec: 1200 },
  { label: "30 min", sec: 1800 },
  { label: "45 min", sec: 2700 },
  { label: "1 hr", sec: 3600 },
  { label: "1.5 hr", sec: 5400 },
  { label: "2 hr", sec: 7200 },
];
const fmtSec = (s: number) => DRIP_OPTIONS.find((o) => o.sec === s)?.label ?? `${s}s`;

export const Route = createFileRoute("/app/fake-reviews/$orderId")({
  head: () => ({
    meta: [
      { title: "Fake review order — My dashboard" },
      { name: "description", content: "Fake review order detail." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrderDetailPage,
});

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const getFn = useServerFn(getMyOrder);
  const fireFn = useServerFn(fireMyOrderWave);
  const cancelFn = useServerFn(cancelMyOrder);
  const startDripFn = useServerFn(startMyDrip);
  const pauseDripFn = useServerFn(pauseMyDrip);

  const [dripMin, setDripMin] = useState(60);
  const [dripMax, setDripMax] = useState(300);
  const [dripBusy, setDripBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const q = useQuery({
    queryKey: ["u-fr-order", orderId],
    queryFn: () => getFn({ data: { id: orderId } }),
    refetchInterval: (query) => (query.state.data && !query.state.data.order ? false : 3000),
  });

  const [firing, setFiring] = useState(false);
  const stopRef = useRef(false);
  const [lastWave, setLastWave] = useState<{ fired: number; remaining: number } | null>(null);

  const runFirehose = async () => {
    setFiring(true);
    stopRef.current = false;
    try {
      for (let i = 0; i < 200; i++) {
        if (stopRef.current) break;
        const res = await fireFn({ data: { id: orderId, max: 120 } });
        setLastWave({ fired: res.fired, remaining: res.remaining });
        q.refetch();
        if (res.done || res.remaining === 0) {
          toast.success("Firehose complete");
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setFiring(false);
    }
  };

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.error) return <div className="p-6 text-sm text-red-600">{(q.error as Error).message}</div>;
  const data = q.data!;
  if (!data.order) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 lg:px-8">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/fake-reviews">
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          This order no longer exists. It may have been deleted.
        </p>
      </div>
    );
  }

  const order = data.order as any;
  const shots = data.shots;
  const total = (order.template_ids?.length ?? 0) * (order.shots_per_template ?? 0);
  const ok = shots.filter((s) => s.http_status && s.http_status < 400).length;
  const err = shots.length - ok;
  const latencies = shots
    .filter((s) => s.latency_ms != null)
    .map((s) => s.latency_ms as number)
    .sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const dripMatch = /^drip:(\d+):(\d+)$/.exec(order.status ?? "");
  const dripping = !!dripMatch;
  const nextIn =
    dripping && order.done_at
      ? Math.max(0, Math.round((new Date(order.done_at).getTime() - now) / 1000))
      : null;
  const closed = order.status === "done" || order.status === "cancelled";

  const onStartDrip = async () => {
    if (dripMax < dripMin) {
      toast.error("Max time must be equal or longer than min time");
      return;
    }
    setDripBusy(true);
    try {
      await startDripFn({ data: { id: orderId, min_sec: dripMin, max_sec: dripMax } });
      toast.success("Drip-feed started — runs even if you close the dashboard");
      q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDripBusy(false);
    }
  };
  const onPauseDrip = async () => {
    setDripBusy(true);
    try {
      await pauseDripFn({ data: { id: orderId } });
      toast.success("Drip-feed paused");
      q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDripBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/fake-reviews">
              <ArrowLeft className="mr-1 size-4" />
              Back
            </Link>
          </Button>
          <h1 className="mt-2 font-display text-2xl font-bold">{order.name}</h1>
          <a
            href={order.target_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block max-w-3xl truncate text-xs text-muted-foreground hover:underline"
          >
            {order.target_url}
          </a>
          <div className="mt-2 flex gap-2 text-xs">
            <span className="rounded-full bg-slate-200 px-2 py-0.5">{order.reason_code}</span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5">
              {dripping ? "drip-feed" : order.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {firing ? (
            <Button
              variant="outline"
              onClick={() => {
                stopRef.current = true;
              }}
            >
              <StopCircle className="mr-1 size-4" />
              Stop
            </Button>
          ) : (
            <Button disabled={closed || dripping} onClick={runFirehose}>
              <Flame className="mr-1 size-4" />
              Fire firehose
            </Button>
          )}
          {order.status !== "done" && order.status !== "cancelled" ? (
            <Button
              variant="ghost"
              onClick={async () => {
                await cancelFn({ data: { id: orderId } });
                q.refetch();
              }}
            >
              Cancel order
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Droplets className="size-4 text-primary" />
          <h2 className="font-semibold">Drip-feed</h2>
          <span className="text-xs text-muted-foreground">
            Sends one report at a time with a random wait. Keeps running when the dashboard is
            closed.
          </span>
        </div>
        {dripping ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>
              Running · every {fmtSec(Number(dripMatch![1]))} – {fmtSec(Number(dripMatch![2]))}
            </span>
            <span className="text-muted-foreground">
              Next report{" "}
              {nextIn === null
                ? "soon"
                : nextIn === 0
                ? "sending now…"
                : `in ${Math.floor(nextIn / 60)}m ${nextIn % 60}s`}
            </span>
            <span className="text-muted-foreground">
              {shots.length} / {total} sent
            </span>
            <Button size="sm" variant="outline" disabled={dripBusy} onClick={onPauseDrip}>
              <Pause className="mr-1 size-4" />
              Pause drip
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Min wait</span>
              <select
                className="rounded-md border border-input bg-background px-2 py-1.5"
                value={dripMin}
                onChange={(e) => setDripMin(Number(e.target.value))}
              >
                {DRIP_OPTIONS.map((o) => (
                  <option key={o.sec} value={o.sec}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Max wait</span>
              <select
                className="rounded-md border border-input bg-background px-2 py-1.5"
                value={dripMax}
                onChange={(e) => setDripMax(Number(e.target.value))}
              >
                {DRIP_OPTIONS.map((o) => (
                  <option key={o.sec} value={o.sec}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={closed || firing || dripBusy} onClick={onStartDrip}>
              <Droplets className="mr-1 size-4" />
              {order.status === "paused" ? "Resume drip-feed" : "Start drip-feed"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Planned" value={total} />
        <Kpi label="Fired" value={shots.length} />
        <Kpi label="OK" value={ok} />
        <Kpi label="Errors" value={err} />
        <Kpi label="Median ms" value={median} />
        <Kpi label="p95 ms" value={p95} />
      </div>

      {firing || lastWave ? (
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
          {firing ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}
          Last wave: {lastWave?.fired ?? 0} fired · {lastWave?.remaining ?? 0} remaining
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Seq</th>
              <th className="px-3 py-2">HTTP</th>
              <th className="px-3 py-2">Latency</th>
              <th className="px-3 py-2">Response / error</th>
            </tr>
          </thead>
          <tbody>
            {[...shots]
              .reverse()
              .slice(0, 500)
              .map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {new Date(s.fired_at).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-1.5">{s.template_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-3 py-1.5">{s.sequence}</td>
                  <td
                    className={`px-3 py-1.5 font-semibold ${
                      s.http_status && s.http_status < 400
                        ? "text-emerald-700"
                        : "text-red-600"
                    }`}
                  >
                    {s.http_status ?? "—"}
                  </td>
                  <td className="px-3 py-1.5">{s.latency_ms ?? 0}ms</td>
                  <td className="px-3 py-1.5 max-w-[480px] truncate text-muted-foreground">
                    {s.error ?? s.response_snippet ?? ""}
                  </td>
                </tr>
              ))}
            {shots.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                  No shots fired yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
