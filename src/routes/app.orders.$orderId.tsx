import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteMyFailedSources,
  deleteMyReviewOrder,
  deleteMyReviewSource,
  fetchMySourceBatch,
  getMyReviewOrder,
  listMyOrderTemplates,
  listMyReviewSources,
  publishMySource,
  refetchMyGoogleDate,
  screenshotMySource,
  setMyOrderDmcaSettings,
  rereportMyOrderDmca,
  setMyOrderTemplate,
  syncMyOrderDmca,
  updateMySourceDraft,
  type UserReviewSource,
} from "@/lib/user-review-orders.functions";
import { renderTemplate } from "@/lib/dmca-template";

export const Route = createFileRoute("/app/orders/$orderId")({
  head: () => ({ meta: [
    { title: "Review Order — People Opinion Box" },
    { name: "description", content: "Manage your published reviews and notice copy for a review order." },
    { property: "og:title", content: "Review Order — People Opinion Box" },
    { property: "og:description", content: "Manage your published reviews and notice copy for a review order." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: OrderDetailPage,
});

const SITE_URL = "https://peopleopinionbox.com";

const STATUS_STYLES: Record<string, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  fetching: "border-warning/40 bg-warning/15 text-warning-foreground",
  done: "border-success/40 bg-success/15 text-success",
  published: "border-primary/30 bg-accent text-accent-foreground",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  empty: "border-destructive/30 bg-destructive/10 text-destructive",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", fetching: "Fetching", done: "Text ready", published: "Live",
  failed: "Failed", empty: "No text",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES["pending"]}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function NoticeBox({
  source, templateBody, ourReviewUrl, ourPublishDate, ourReviewerName, useDrive,
}: {
  source: UserReviewSource;
  templateBody: string;
  ourReviewUrl: string | null;
  ourPublishDate: string | null;
  ourReviewerName: string | null;
  useDrive: boolean;
}) {
  const link = useDrive ? source.drive_url : ourReviewUrl;
  const { text, missing } = renderTemplate(templateBody, {
    url: source.url,
    reviewer_name: source.reviewer_name,
    review_published_at: source.review_published_at,
    review_text: source.review_text,
    archive_url: link,
    archive_date: ourPublishDate,
    our_review_url: link,
    our_publish_date: ourPublishDate,
    our_reviewer_name: ourReviewerName,
    drive_url: source.drive_url,
  });
  const ready = missing.length === 0 && Boolean(link);
  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">DMCA notice</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!ready}
          onClick={() => { void navigator.clipboard.writeText(text); toast.success("Notice copied"); }}>
          <Copy className="mr-1 size-3" /> Copy notice
        </Button>
      </div>
      {useDrive && !source.drive_url ? (
        <p className="mb-2 text-xs text-warning-foreground">Drive link missing — take a screenshot first.</p>
      ) : null}
      {missing.length ? (
        <p className="mb-2 text-xs text-warning-foreground">Missing: {missing.join(", ")}</p>
      ) : null}
      <Textarea readOnly rows={8} value={text} className="font-mono text-xs" />
    </div>
  );
}

function SourceCard({
  source, index, busy, onRefresh, templateBody, ourReviewerName, useDrive,
}: {
  source: UserReviewSource;
  index: number;
  busy: boolean;
  onRefresh: () => void;
  templateBody: string | null;
  ourReviewerName: string | null;
  useDrive: boolean;
}) {
  const saveDraft = useServerFn(updateMySourceDraft);
  const publish = useServerFn(publishMySource);
  const remove = useServerFn(deleteMyReviewSource);
  const retryDate = useServerFn(refetchMyGoogleDate);
  const takeShot = useServerFn(screenshotMySource);
  const [text, setText] = useState(source.review_text ?? "");
  const [rating, setRating] = useState(String(source.rating ?? ""));
  const [working, setWorking] = useState(false);
  const [dateBusy, setDateBusy] = useState(false);
  const [shotBusy, setShotBusy] = useState(false);
  const isPublished = Boolean(source.published_review_id);
  const dirty = text !== (source.review_text ?? "") || rating !== String(source.rating ?? "");

  const doPublish = async () => {
    setWorking(true);
    try {
      const r = await publish({ data: { id: source.id } });
      toast.success(`Published at ${r.path} · dated ${r.reviewDate}` + (r.fallback ? " (no Google date)" : ""));
      onRefresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setWorking(false); }
  };
  const doShot = async () => {
    setShotBusy(true);
    try {
      const r = await takeShot({ data: { id: source.id } });
      if (r.ok) toast.success("Screenshot saved to Drive"); else toast.error(`Screenshot failed — ${r.error}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setShotBusy(false); onRefresh(); }
  };
  const doRetryDate = async () => {
    setDateBusy(true);
    try {
      const r = await retryDate({ data: { id: source.id } });
      if (r.ok) { toast.success(`Google date: ${new Date(r.publishedAt).toLocaleDateString()}`); onRefresh(); }
      else toast.error(r.error);
    } catch (e) { toast.error((e as Error).message); }
    finally { setDateBusy(false); }
  };
  const save = async () => {
    setWorking(true);
    try {
      await saveDraft({ data: { id: source.id, review_text: text, ...(rating ? { rating: Number(rating) } : {}) } });
      toast.success("Draft saved"); onRefresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setWorking(false); }
  };

  return (
    <div className="press-panel overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[0.7rem] font-semibold text-muted-foreground">{index + 1}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{source.business_name || source.label || "Google review link"}</p>
            <a href={source.url} target="_blank" rel="noreferrer noopener" className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary">
              <span className="truncate">{source.url}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={source.status} />
          <Button type="button" size="icon" variant="ghost" aria-label="Remove"
            onClick={async () => { await remove({ data: { id: source.id } }); onRefresh(); }}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="space-y-3 bg-muted/40 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {source.reviewer_name ? <span className="font-medium text-foreground">{source.reviewer_name}</span> : null}
          {source.review_published_at ? <span>{new Date(source.review_published_at).toLocaleDateString()}</span> : null}
          {source.review_age_label ? <span>· {source.review_age_label}</span> : null}
          {source.published_path ? <a href={source.published_path} target="_blank" rel="noreferrer noopener" className="font-mono text-primary hover:underline">{source.published_path}</a> : null}
          {source.published_review_date ? <span className="pill">Published date {source.published_review_date}</span> : null}
          {source.date_fallback ? <span className="pill border-destructive/30 text-destructive">No Google date — dated from today</span> : null}
          {(source.date_fallback || !source.review_published_at) && source.status !== "pending" ? (
            <Button type="button" size="sm" variant="outline" className="h-7" disabled={dateBusy} onClick={doRetryDate}>
              {dateBusy ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <RefreshCw className="mr-1.5 size-3" />} Retry Google date
            </Button>
          ) : null}
        </div>

        {source.error ? <p className="text-xs text-destructive">{source.error}</p> : null}

        {isPublished ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{source.review_text}</p>
        ) : (
          <>
            <Textarea rows={4} value={text} placeholder="Review text appears here after fetching…"
              onChange={(e) => setText(e.target.value)} className="bg-background text-sm" />
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" min={1} max={5} value={rating} placeholder="★"
                onChange={(e) => setRating(e.target.value)} className="w-16 bg-background text-center" />
              {dirty ? <Button type="button" size="sm" variant="outline" disabled={working} onClick={save}>Save draft</Button> : null}
              <Button type="button" size="sm" className="rounded-full"
                disabled={busy || working || text.trim().length < 20} onClick={doPublish}>
                {working ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null} Publish
              </Button>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Live URL</span>
          {source.published_path ? (
            <>
              <a href={`${SITE_URL}${source.published_path}`} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate font-mono text-xs text-primary hover:underline">
                {SITE_URL}{source.published_path}
              </a>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => { void navigator.clipboard.writeText(`${SITE_URL}${source.published_path}`); toast.success("URL copied"); }}>
                <Copy className="mr-1 size-3" /> Copy
              </Button>
            </>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">Publishes on your reviewer profile</span>
          )}
        </div>

        {source.published_path ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Screenshot</span>
            {shotBusy || source.screenshot_status === "pending" ? (
              <span className="flex items-center text-xs text-muted-foreground"><Loader2 className="mr-1 size-3 animate-spin" /> Capturing…</span>
            ) : source.drive_url ? (
              <>
                <a href={source.drive_url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate font-mono text-xs text-primary hover:underline">{source.drive_url}</a>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                  onClick={() => { void navigator.clipboard.writeText(source.drive_url ?? ""); toast.success("Drive link copied"); }}>
                  <Copy className="mr-1 size-3" /> Copy
                </Button>
              </>
            ) : source.screenshot_status === "failed" ? (
              <span className="min-w-0 flex-1 truncate text-xs text-destructive">{source.screenshot_error ?? "Failed"}</span>
            ) : (
              <span className="flex-1 text-xs text-muted-foreground">Not captured yet</span>
            )}
            {!shotBusy && source.screenshot_status !== "pending" ? (
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={doShot}>
                <RefreshCw className="mr-1 size-3" /> {source.drive_url ? "Retake" : "Take"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {templateBody && source.published_path ? (
          <NoticeBox
            source={source}
            templateBody={templateBody}
            ourReviewUrl={`${SITE_URL}${source.published_path}`}
            ourPublishDate={source.published_review_date}
            ourReviewerName={ourReviewerName}
            useDrive={useDrive}
          />
        ) : templateBody ? (
          <p className="rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">Publish first, then the DMCA notice appears here.</p>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
            No DMCA template selected for this order — pick one above to see the notice here.
          </p>
        )}
      </div>
    </div>
  );
}

const DELAY_PRESETS = [
  { label: "No delay (send back-to-back)", min: 0, max: 0 },
  { label: "51s – 5m", min: 51, max: 300 },
  { label: "1m – 10m", min: 60, max: 600 },
  { label: "10m – 1h", min: 600, max: 3600 },
  { label: "30m – 2h", min: 1800, max: 7200 },
];

function DmcaSettings({ order, onSaved }: { order: any; onSaved: () => void }) {
  const save = useServerFn(setMyOrderDmcaSettings);
  const rereport = useServerFn(rereportMyOrderDmca);
  const [urlMode, setUrlMode] = useState<"review" | "drive">((order?.dmca_url_mode as any) ?? "review");
  const currentMin = order?.dmca_delay_min_seconds ?? 0;
  const currentMax = order?.dmca_delay_max_seconds ?? 0;
  const presetIndex = DELAY_PRESETS.findIndex((p) => p.min === currentMin && p.max === currentMax);
  const [idx, setIdx] = useState<number>(presetIndex === -1 ? 0 : presetIndex);
  const [saving, setSaving] = useState(false);
  const commit = async (m: "review" | "drive", i: number) => {
    const p = DELAY_PRESETS[i] ?? DELAY_PRESETS[0]!;
    setSaving(true);
    try {
      await save({ data: { id: order.id, urlMode: m, delayMin: p.min, delayMax: p.max } });
      toast.success("DMCA settings updated"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs md:grid-cols-2">
      <div className="space-y-2">
        <p className="small-caps-label">Link used in DMCA copy</p>
        <label className="flex items-center gap-2">
          <input type="radio" checked={urlMode === "review"} disabled={saving}
            onChange={() => { setUrlMode("review"); void commit("review", idx); }} />
          <span>Our review page URL</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={urlMode === "drive"} disabled={saving}
            onChange={() => { setUrlMode("drive"); void commit("drive", idx); }} />
          <span>Google Drive screenshot link</span>
        </label>
      </div>
      <div className="space-y-2">
        <p className="small-caps-label">Delay between reports</p>
        <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          value={idx} disabled={saving}
          onChange={(e) => { const i = Number(e.target.value); setIdx(i); void commit(urlMode, i); }}>
          {DELAY_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
        </select>
      </div>
      <div className="space-y-2 md:col-span-2">
        <p className="small-caps-label">Report again</p>
        <Button type="button" size="sm" variant="outline"
          disabled={saving || (order?.dmca_rereport_count ?? 0) >= 3}
          onClick={async () => {
            if (!confirm("Put every review in this order back in your extension queue to report again?")) return;
            setSaving(true);
            try {
              const r = await rereport({ data: { id: order.id } });
              toast.success(`${r.reset} review(s) ready to report again (${r.used}/${r.max} used)`);
              onSaved();
            } catch (e) { toast.error((e as Error).message); }
            finally { setSaving(false); }
          }}>
          Allow re-report ({3 - Math.min(3, order?.dmca_rereport_count ?? 0)} left)
        </Button>
        <p className="text-[0.65rem] text-muted-foreground">
          You can re-report an order up to 3 times. Past reports stay in your history.
        </p>
      </div>
    </div>
  );
}

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const loadOrder = useServerFn(getMyReviewOrder);
  const loadSources = useServerFn(listMyReviewSources);
  const runBatch = useServerFn(fetchMySourceBatch);
  const publish = useServerFn(publishMySource);
  const removeOrder = useServerFn(deleteMyReviewOrder);
  const removeFailed = useServerFn(deleteMyFailedSources);
  const sync = useServerFn(syncMyOrderDmca);
  const takeShot = useServerFn(screenshotMySource);
  const loadTemplates = useServerFn(listMyOrderTemplates);
  const assignTemplate = useServerFn(setMyOrderTemplate);

  const orderQuery = useQuery({ queryKey: ["my-review-order", orderId], queryFn: () => loadOrder({ data: { id: orderId } }) });
  const sourcesQuery = useQuery({ queryKey: ["my-review-sources", orderId], queryFn: () => loadSources({ data: { orderId } }) });
  const templatesQuery = useQuery({ queryKey: ["my-order-templates"], queryFn: () => loadTemplates() });

  const order = orderQuery.data?.order as any;
  const templateId: string | null = order?.dmca_template_id ?? null;
  const template = (templatesQuery.data ?? []).find((t) => t.id === templateId) ?? null;
  const useDrive = (order?.dmca_url_mode ?? "review") === "drive";

  const sources: UserReviewSource[] = sourcesQuery.data ?? [];
  const counts = useMemo(() => {
    let fetched = 0, pending = 0, published = 0, failed = 0;
    for (const s of sources) {
      if ((s.review_text ?? "").trim()) fetched++;
      if (s.status === "pending" || s.status === "fetching") pending++;
      if (s.published_review_id) published++;
      if (s.status === "failed" || s.status === "empty") failed++;
    }
    return { fetched, pending, published, failed, total: sources.length };
  }, [sources]);
  const readyToPublish = useMemo(
    () => sources.filter((s) => !s.published_review_id && (s.review_text ?? "").trim().length >= 20),
    [sources],
  );
  const publishedSources = useMemo(() => sources.filter((s) => s.published_path), [sources]);
  const percent = counts.total === 0 ? 0 : Math.round((counts.fetched / counts.total) * 100);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["my-review-sources", orderId] });
    void qc.invalidateQueries({ queryKey: ["my-review-orders"] });
    void qc.invalidateQueries({ queryKey: ["my-review-order", orderId] });
  };

  const runFetch = async (retryFailed = false) => {
    setBusy(true);
    let imported = 0, failed = 0, rounds = 0;
    try {
      while (rounds < 200) {
        rounds++;
        setProgress(`Fetching… ${imported} collected${failed ? `, ${failed} failed` : ""} (batch ${rounds})`);
        const r = await runBatch({ data: { orderId, limit: 10, retryFailed, fallback: true } });
        imported += r.imported; failed += r.failed;
        if (rounds % 3 === 0) refresh();
        if (r.processed === 0 || r.remaining === 0) break;
      }
      if (imported) toast.success(`Collected ${imported}`);
      if (failed) toast.error(`${failed} failed`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setProgress(null); setBusy(false); refresh(); }
  };

  const publishAll = async () => {
    setBusy(true);
    let done = 0, failed = 0;
    try {
      for (const s of readyToPublish) {
        setProgress(`Publishing ${done + 1} of ${readyToPublish.length}…`);
        try { await publish({ data: { id: s.id } }); done++; } catch { failed++; }
      }
      if (done) toast.success(`Published ${done}`);
      if (failed) toast.error(`${failed} could not publish`);
    } finally { setProgress(null); setBusy(false); refresh(); }
  };

  const screenshotAll = async () => {
    setBusy(true);
    let ok = 0, failed = 0;
    try {
      let next = 0;
      const worker = async () => {
        while (next < publishedSources.length) {
          const t = publishedSources[next++]!;
          setProgress(`Screenshots… ${ok + failed} of ${publishedSources.length} done`);
          try { const r = await takeShot({ data: { id: t.id } }); if (r.ok) ok++; else failed++; } catch { failed++; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, publishedSources.length) }, () => worker()));
      if (ok) toast.success(`${ok} screenshot(s) saved`);
      if (failed) toast.error(`${failed} failed`);
    } finally { setProgress(null); setBusy(false); refresh(); }
  };

  const generateDmca = async () => {
    setBusy(true);
    setProgress("Updating DMCA notices…");
    try {
      const r = await sync({ data: { orderId, siteUrl: SITE_URL } });
      if (r.updated) toast.success(`DMCA notices ready for ${r.updated}`); else toast.info("No published reviews yet.");
      if (r.skipped) toast.error(`${r.skipped} skipped (missing link)`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setProgress(null); setBusy(false); refresh(); }
  };

  const removeFailedUrls = async () => {
    if (!window.confirm(`Remove ${counts.failed} failed link(s)?`)) return;
    setBusy(true);
    try {
      const r = await removeFailed({ data: { orderId } });
      if (r.removed) toast.success(`Removed ${r.removed}`); else toast.info("Nothing to remove.");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); refresh(); }
  };

  if (orderQuery.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading order…</div>;
  if (!order) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        <p>This order no longer exists.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/app/orders">Back to orders</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8 lg:py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/app/orders"><ArrowLeft className="mr-2 size-4" /> All orders</Link>
      </Button>

      <div className="press-panel p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <p className="small-caps-label">Order batch</p>
            <h1 className="mt-1 truncate font-display text-2xl">{order.name}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {order.created_at ? `Created ${new Date(order.created_at).toLocaleDateString()}` : ""}
              {order.note ? ` · ${order.note}` : ""}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Delete order" className="shrink-0"
            onClick={async () => {
              if (!window.confirm("Delete this order and its links?")) return;
              await removeOrder({ data: { id: orderId } });
              navigate({ to: "/app/orders" });
            }}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>

        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {counts.fetched} of {counts.total} fetched · {counts.published} live
            {counts.failed ? ` · ${counts.failed} failed` : ""} · {percent}%
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" className="rounded-full" disabled={busy || counts.pending === 0} onClick={() => runFetch(false)}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Fetch review text ({counts.pending})
          </Button>
          <Button type="button" variant="outline" className="rounded-full" disabled={busy || counts.failed === 0} onClick={() => runFetch(true)}>
            <RefreshCw className="mr-2 size-4" /> Fetch failed ({counts.failed})
          </Button>
          <Button type="button" variant="outline" className="rounded-full text-destructive hover:text-destructive"
            disabled={busy || counts.failed === 0} onClick={removeFailedUrls}>
            <Trash2 className="mr-2 size-4" /> Remove failed ({counts.failed})
          </Button>
          <Button type="button" variant="outline" className="rounded-full"
            disabled={busy || readyToPublish.length === 0} onClick={publishAll}>
            <Rocket className="mr-2 size-4" /> Publish all ({readyToPublish.length})
          </Button>
          <Button type="button" variant="outline" className="rounded-full"
            disabled={busy || counts.published === 0} onClick={generateDmca}>
            <ShieldCheck className="mr-2 size-4" /> Generate DMCA ({counts.published})
          </Button>
          <Button type="button" variant="outline" className="rounded-full"
            disabled={busy || publishedSources.length === 0} onClick={screenshotAll}>
            <Camera className="mr-2 size-4" /> Take screenshot ({publishedSources.length})
          </Button>
        </div>
        {progress ? <p className="mt-3 text-xs text-muted-foreground">{progress}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">DMCA copy template:</span>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={templateId ?? ""}
            onChange={async (e) => {
              try {
                await assignTemplate({ data: { id: orderId, templateId: e.target.value || null } });
                void qc.invalidateQueries({ queryKey: ["my-review-order", orderId] });
                toast.success("Template updated");
              } catch (err) { toast.error((err as Error).message); }
            }}>
            <option value="">No template</option>
            {(templatesQuery.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <DmcaSettings order={order} onSaved={() => void qc.invalidateQueries({ queryKey: ["my-review-order", orderId] })} />
      </div>

      <div className="mt-5 space-y-4">
        {sourcesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading links…</p>
        ) : sources.length === 0 ? (
          <div className="press-panel p-10 text-center text-sm text-muted-foreground">
            This order has no review links yet.
          </div>
        ) : (
          sources.map((s, i) => (
            <SourceCard key={`${s.id}:${s.updated_at}`} source={s} index={i} busy={busy}
              onRefresh={refresh} templateBody={template?.body ?? null}
              ourReviewerName={order.reviewer_profile_name ?? null} useDrive={useDrive} />
          ))
        )}
      </div>
    </div>
  );
}
