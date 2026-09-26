import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Download, ExternalLink, FileText, Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  classifyMyPolicyBatch,
  fetchMyPolicyBatch,
  getMyPolicyOrder,
  updateMyPolicyItem,
  writeMyReportBatch,
  type PolicyItem,
} from "@/lib/user-policy.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/policy/$orderId")({ component: MyPolicyOrderPage });

type Filter = "all" | "violates" | "clean" | "unsure" | "written" | "submitted";

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

function MyPolicyOrderPage() {
  const { orderId } = Route.useParams();
  const load = useServerFn(getMyPolicyOrder);
  const fetchBatch = useServerFn(fetchMyPolicyBatch);
  const classify = useServerFn(classifyMyPolicyBatch);
  const writeReports = useServerFn(writeMyReportBatch);
  const q = useQuery({ queryKey: ["my-policy-order", orderId], queryFn: () => load({ data: { id: orderId } }) });
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState<string>("");

  const items = q.data?.items ?? [];

  const runBatches = async (label: string, ids: string[], size: number, fn: (ids: string[]) => Promise<unknown>) => {
    if (!ids.length) { toast.info("Nothing to do."); return; }
    setBusy(label);
    try {
      const groups = chunk(ids, size);
      for (let i = 0; i < groups.length; i++) {
        setProgress(`${Math.min((i + 1) * size, ids.length)} / ${ids.length}`);
        try { await fn(groups[i]!); } catch (e) { toast.error((e as Error).message); }
        await q.refetch();
      }
      toast.success(`${label} finished`);
    } finally {
      setBusy(null); setProgress("");
    }
  };

  const doFetch = (retryAll = false) =>
    runBatches("Fetch", items.filter((i) => retryAll || i.fetch_status !== "done").map((i) => i.id), 1, (ids) => fetchBatch({ data: { ids } }));
  const doClassify = (force = false) =>
    runBatches("Policy check", items.filter((i) => i.review_text && (force || (!i.verdict && !i.verdict_manual))).map((i) => i.id), 6, (ids) => classify({ data: { ids, force } }));
  const doReports = () =>
    runBatches("Report writing", items.filter((i) => i.verdict === "violates").map((i) => i.id), 6, (ids) => writeReports({ data: { ids } }));

  const counts = useMemo(() => ({
    all: items.length,
    violates: items.filter((i) => i.verdict === "violates").length,
    clean: items.filter((i) => i.verdict === "clean").length,
    unsure: items.filter((i) => i.verdict === "unsure").length,
    written: items.filter((i) => i.report_status === "written").length,
    submitted: items.filter((i) => i.report_status === "submitted").length,
  }), [items]);

  const allTags = Array.from(new Set(items.flatMap((i) => (i.tags ?? []).map((t) => t.code)))).sort();
  const shown = items.filter((i) => !tagFilter || (i.tags ?? []).some((t) => t.code === tagFilter)).filter((i) =>
    filter === "all" ? true : filter === "written" || filter === "submitted" ? i.report_status === filter : i.verdict === filter,
  );

  const downloadCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["url", "reviewer", "rating", "date", "review_text", "verdict", "tags", "google_reason", "category", "confidence", "reason", "report_text", "report_status"],
      ...items.map((i) => [i.url, i.reviewer_name, i.rating, i.review_published_at?.slice(0, 10), i.review_text, i.verdict, (i.tags ?? []).map((t) => t.code).join("|"), i.google_reason, i.category, i.confidence, i.reason, i.report_text, i.report_status]),
    ];
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${q.data?.order.name ?? "policy"}.csv`;
    a.click();
  };

  if (q.isLoading) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="p-8 text-sm text-destructive">{(q.error as Error).message}</p>;

  const fetched = items.filter((i) => i.fetch_status === "done").length;
  const pct = items.length ? Math.round((fetched / items.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <Link to="/app/policy" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 size-4" /> All policy orders
      </Link>

      <div className="press-panel space-y-4 p-6">
        <div>
          <h1 className="font-display text-2xl text-foreground">{q.data!.order.name}</h1>
          <p className="text-xs text-muted-foreground">Created {new Date(q.data!.order.created_at).toLocaleDateString()}</p>
        </div>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {fetched} of {items.length} fetched · {pct}%{busy ? ` · ${busy} ${progress}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" disabled={!!busy} onClick={() => doFetch()}>
            {busy === "Fetch" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Fetch reviews
          </Button>
          <Button className="rounded-full" disabled={!!busy} onClick={() => doClassify()}>
            {busy === "Policy check" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldAlert className="mr-2 size-4" />}Find policy violations
          </Button>
          <Button variant="outline" className="rounded-full" disabled={!!busy} onClick={() => {
            if (window.confirm("Re-check every review? This replaces your manual changes.")) doClassify(true);
          }}>
            Re-check all
          </Button>
          <Button className="rounded-full" disabled={!!busy} onClick={doReports}>
            {busy === "Report writing" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}Write reports
          </Button>
          <Button variant="outline" className="rounded-full" onClick={downloadCsv}>
            <Download className="mr-2 size-4" /> Download CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "violates", "clean", "unsure", "written", "submitted"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("pill capitalize", filter === f && "border-primary bg-primary text-primary-foreground")}
          >
            {f === "written" ? "Report written" : f} ({counts[f]})
          </button>
        ))}
      </div>

      {allTags.length ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Tag:</span>
          <button onClick={() => setTagFilter("")} className={cn("pill", !tagFilter && "border-primary bg-primary text-primary-foreground")}>Any</button>
          {allTags.map((t) => (
            <button key={t} onClick={() => setTagFilter(t)} className={cn("pill font-mono", tagFilter === t && "border-primary bg-primary text-primary-foreground")}>
              {t} ({items.filter((i) => (i.tags ?? []).some((x) => x.code === t)).length})
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        {shown.map((item) => (
          <ItemCard key={item.id} item={item} index={items.indexOf(item) + 1} onChange={() => q.refetch()} onRetry={() => runBatches("Fetch", [item.id], 1, (ids) => fetchBatch({ data: { ids } }))} />
        ))}
      </div>
    </div>
  );
}

function ItemCard({ item, index, onChange, onRetry }: { item: PolicyItem; index: number; onChange: () => void; onRetry: () => void }) {
  const update = useServerFn(updateMyPolicyItem);
  const [draft, setDraft] = useState(item.report_text ?? "");
  useEffect(() => { setDraft(item.report_text ?? ""); }, [item.report_text]);
  const save = async (patch: { id: string; verdict?: "violates" | "clean" | "unsure"; report_text?: string; report_status?: "none" | "written" | "submitted"; remove?: boolean }) => {
    try { await update({ data: patch }); onChange(); } catch (e) { toast.error((e as Error).message); }
  };

  const verdictClass =
    item.verdict === "violates" ? "border-destructive/40 text-destructive"
    : item.verdict === "clean" ? "border-primary/30 text-primary" : "";

  return (
    <div className="press-panel space-y-3 p-5">
      <div className="flex items-start gap-3">
        <span className="pill shrink-0">#{index}</span>
        <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">{item.url}</a>
        <a href={item.url} target="_blank" rel="noreferrer" aria-label="Open"><ExternalLink className="size-4 text-muted-foreground" /></a>
        <button aria-label="Delete" onClick={() => window.confirm("Remove this link?") && save({ id: item.id, remove: true })}>
          <Trash2 className="size-4 text-destructive" />
        </button>
      </div>

      {item.fetch_status === "failed" ? (
        <div className="flex items-center gap-3 text-xs text-destructive">
          <span className="min-w-0 flex-1">{item.fetch_error}</span>
          <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
        </div>
      ) : item.fetch_status === "pending" ? (
        <p className="text-xs text-muted-foreground">Not fetched yet.</p>
      ) : (
        <div className="rounded-lg bg-muted/60 p-4 text-sm">
          <p className="text-xs text-muted-foreground">
            {item.reviewer_name ?? "Unknown"} · {item.review_published_at ? new Date(item.review_published_at).toLocaleDateString() : item.review_age_label ?? "no date"}
            {item.rating ? ` · ${"★".repeat(item.rating)}` : ""}
            {item.business_name ? ` · ${item.business_name}` : ""}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-foreground"><Highlighted text={item.review_text ?? ""} quotes={(item.tags ?? []).flatMap((t) => t.evidence)} /></p>
          {item.translation ? <p className="mt-2 text-xs italic text-muted-foreground">English ({item.language}): {item.translation}</p> : null}
        </div>
      )}

      {item.check_error ? <p className="text-xs text-destructive">Check failed: {item.check_error}</p> : null}

      {item.review_text ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Result:</span>
          {(["violates", "clean", "unsure"] as const).map((v) => (
            <button
              key={v}
              onClick={() => save({ id: item.id, verdict: v })}
              className={cn("pill capitalize", item.verdict === v && (verdictClass || "border-foreground"), item.verdict === v && "font-semibold")}
            >{v}</button>
          ))}
          {item.google_reason ? <span className="pill">Google reason: {item.google_reason}</span> : null}
          {item.confidence != null ? <span className="text-muted-foreground">{Math.round(item.confidence * 100)}% sure</span> : null}
          {item.verdict_manual ? <span className="text-muted-foreground">(set by you)</span> : null}
        </div>
      ) : null}
      {(item.tags ?? []).length ? (
        <div className="space-y-2">
          {item.tags.map((t) => (
            <div key={t.code} className={cn("rounded-lg border p-3 text-xs", t.severity === "high" ? "border-destructive/50 bg-destructive/5" : t.severity === "medium" ? "border-destructive/30" : "border-border")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("pill font-mono", t.code === item.primary_tag && "border-destructive text-destructive")}>{t.code}</span>
                <span className="font-semibold text-foreground">{t.policy}</span>
                <span className="text-muted-foreground">{t.severity} · {Math.round(t.confidence * 100)}% sure</span>
                {t.code === item.primary_tag ? <span className="text-destructive">main</span> : null}
                {t.source_url ? <a href={t.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground underline">policy</a> : null}
              </div>
              <p className="mt-1 text-muted-foreground">{t.explanation}</p>
              <p className="mt-1 text-foreground">{t.evidence.map((e) => `“${e}”`).join(" · ")}</p>
            </div>
          ))}
        </div>
      ) : item.reason ? <p className="text-xs text-muted-foreground">{item.reason}</p> : null}
      {(item.signals ?? []).length ? <p className="text-xs text-muted-foreground">Signals: {item.signals.join(" · ")}</p> : null}

      {item.report_error ? <p className="text-xs text-destructive">Report failed: {item.report_error}</p> : null}
      {item.report_text !== null && item.report_status !== "none" ? (
        <div className="space-y-2">
          <Textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} className="text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(draft); toast.success("Copied"); }}>
              <Copy className="mr-2 size-3.5" /> Copy
            </Button>
            {draft !== item.report_text ? (
              <Button size="sm" variant="outline" onClick={() => save({ id: item.id, report_text: draft })}>Save text</Button>
            ) : null}
            <Button
              size="sm"
              variant={item.report_status === "submitted" ? "outline" : "default"}
              onClick={() => save({ id: item.id, report_status: item.report_status === "submitted" ? "written" : "submitted" })}
            >
              {item.report_status === "submitted" ? "Submitted ✓ (undo)" : "Mark submitted"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Highlighted({ text, quotes }: { text: string; quotes: string[] }) {
  const valid = quotes.filter((q) => q && text.toLowerCase().includes(q.toLowerCase()));
  if (!valid.length) return <>{text}</>;
  const esc = valid.map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const parts = text.split(new RegExp(`(${esc})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        valid.some((q) => q.toLowerCase() === p.toLowerCase()) ? (
          <mark key={i} className="rounded bg-destructive/15 px-0.5 text-destructive">{p}</mark>
        ) : (<span key={i}>{p}</span>),
      )}
    </>
  );
}
