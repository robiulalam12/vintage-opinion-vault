import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resetOrderDmcaForReReport } from "@/lib/dmca.functions";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Copy,
  Download,
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
  deleteFailedSources,
  deleteReviewOrder,
  deleteReviewSource,
  fetchSourceBatch,
  getReviewOrder,
  listReviewSources,
  publishSource,
  refetchGoogleDate,
  screenshotSource,
  syncOrderDmca,
  updateSourceDraft,
  type ReviewSource,
} from "@/lib/reviews.functions";
import {
  listDmcaTemplates,
  setOrderDmcaSettings,
  setOrderTemplate,
  type DmcaTemplate,
} from "@/lib/dmca-templates.functions";
import { TemplateNoticeBox } from "@/components/admin/TemplateNoticeBox";

export const Route = createFileRoute("/admin/orders/$orderId")({
  component: OrderDetailPage,
});

const SITE_URL = "https://peopleopinionbox.com";

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function formatPublicationDate(value: string | null) {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return LONG_DATE.format(d);
}





const STATUS_STYLES: Record<string, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  fetching: "border-warning/40 bg-warning/15 text-warning-foreground",
  done: "border-success/40 bg-success/15 text-success",
  published: "border-primary/30 bg-accent text-accent-foreground",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  empty: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  fetching: "Fetching",
  done: "Text ready",
  published: "Live",
  failed: "Failed",
  empty: "No text",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${
        STATUS_STYLES[status] ?? STATUS_STYLES["pending"]
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function reviewerDisplayName(key: string | null | undefined) {
  if (key === "jonas") return "Jonas Weber";
  if (key === "benedikt") return "Benedikt Herrmann";
  return "Robiul Alam";
}

function SourceCard({
  source,
  index,
  busy,
  onRefresh,
  template,
  reviewerName,
  urlMode = "site",
}: {
  urlMode?: string;
  source: ReviewSource;
  index: number;
  busy: boolean;
  onRefresh: () => void;
  template: DmcaTemplate | null;
  reviewerName: string;
}) {
  const saveDraft = useServerFn(updateSourceDraft);
  const publish = useServerFn(publishSource);
  const removeSource = useServerFn(deleteReviewSource);
  const retryDate = useServerFn(refetchGoogleDate);
  const takeShot = useServerFn(screenshotSource);
  const [shotBusy, setShotBusy] = useState(false);
  const doShot = async () => {
    setShotBusy(true);
    try {
      const r = await takeShot({ data: { id: source.id } });
      if (r.ok) toast.success("Screenshot saved to Google Drive");
      else toast.error(`Screenshot failed — ${r.error}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setShotBusy(false);
      onRefresh();
    }
  };
  const [dateBusy, setDateBusy] = useState(false);
  const doRetryDate = async () => {
    setDateBusy(true);
    try {
      const r = await retryDate({ data: { id: source.id } });
      if (r.ok) {
        toast.success(
          `Google date found: ${new Date(r.publishedAt).toLocaleDateString()}` +
            (r.reviewDate ? ` · live review re-dated ${r.reviewDate}` : ""),
        );
        onRefresh();
      } else toast.error(r.error);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDateBusy(false);
    }
  };

  const [text, setText] = useState(source.review_text ?? "");
  const [rating, setRating] = useState(String(source.rating ?? ""));
  const [working, setWorking] = useState(false);

  const isPublished = Boolean(source.published_review_id || source.published_profile_review_id);
  const dirty = text !== (source.review_text ?? "") || rating !== String(source.rating ?? "");

  const save = async () => {
    setWorking(true);
    try {
      await saveDraft({
        data: { id: source.id, review_text: text, ...(rating ? { rating: Number(rating) } : {}) },
      });
      toast.success("Draft saved");
      onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const doPublish = async () => {
    setWorking(true);
    try {
      const result = await publish({ data: { id: source.id } });
      toast.success(
        `Published at ${result.path} · dated ${result.reviewDate}` +
          (result.fallback ? " (no Google date found — dated from today)" : ""),
      );
      onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="press-panel overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[0.7rem] font-semibold text-muted-foreground">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {source.business_name || source.label || "Google review link"}
            </p>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <span className="truncate">{source.url}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={source.status} />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Remove link"
            onClick={async () => {
              await removeSource({ data: { id: source.id } });
              onRefresh();
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="space-y-3 bg-muted/40 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {source.reviewer_name ? (
            <span className="font-medium text-foreground">{source.reviewer_name}</span>
          ) : null}
          {source.review_published_at ? (
            <span>{new Date(source.review_published_at).toLocaleDateString()}</span>
          ) : null}
          {source.review_age_label ? <span>· {source.review_age_label}</span> : null}
          {source.published_path ? (
            <a
              href={source.published_path}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-primary hover:underline"
            >
              {source.published_path}
            </a>
          ) : null}
          {source.published_review_date ? (
            <span className="pill">Published date {source.published_review_date}</span>
          ) : null}
          {source.date_fallback ? (
            <span className="pill border-destructive/30 text-destructive">
              No Google date — dated from today
            </span>
          ) : null}
          {(source.date_fallback || !source.review_published_at) && source.status !== "pending" ? (
            <Button type="button" size="sm" variant="outline" className="h-7" disabled={dateBusy} onClick={doRetryDate}>
              {dateBusy ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <RefreshCw className="mr-1.5 size-3" />}
              Retry Google date
            </Button>
          ) : null}
        </div>

        {source.text_error ?? source.error ? (
          <p className="text-xs text-destructive">{source.text_error ?? source.error}</p>
        ) : null}

        {isPublished ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{source.review_text}</p>
        ) : (
          <>
            <Textarea
              rows={4}
              value={text}
              placeholder="Review text appears here after fetching…"
              onChange={(e) => setText(e.target.value)}
              className="bg-background text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                max={5}
                value={rating}
                placeholder="★"
                onChange={(e) => setRating(e.target.value)}
                className="w-16 bg-background text-center"
              />
              {dirty ? (
                <Button type="button" size="sm" variant="outline" disabled={working} onClick={save}>
                  Save draft
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="rounded-full"
                disabled={busy || working || text.trim().length < 20}
                onClick={doPublish}
              >
                {working ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
                Publish
              </Button>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Live URL
          </span>
          {source.published_path ? (
            <>
              <a
                href={`${SITE_URL}${source.published_path}`}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 flex-1 truncate font-mono text-xs text-primary hover:underline"
              >
                {SITE_URL}{source.published_path}
              </a>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${SITE_URL}${source.published_path}`,
                  );
                  toast.success("URL copied");
                }}
              >
                <Copy className="mr-1 size-3" /> Copy
              </Button>
            </>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {SITE_URL}/… (unique link on the reviewer profile, assigned on publish)
            </span>
          )}
        </div>

        {source.published_path ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Screenshot
            </span>
            {shotBusy || source.screenshot_status === "pending" ? (
              <span className="flex items-center text-xs text-muted-foreground">
                <Loader2 className="mr-1 size-3 animate-spin" /> Capturing…
              </span>
            ) : source.drive_url ? (
              <>
                <a
                  href={source.drive_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1 truncate font-mono text-xs text-primary hover:underline"
                >
                  {source.drive_url}
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    void navigator.clipboard.writeText(source.drive_url ?? "");
                    toast.success("Drive link copied");
                  }}
                >
                  <Copy className="mr-1 size-3" /> Copy
                </Button>
              </>
            ) : source.screenshot_status === "failed" ? (
              <span className="min-w-0 flex-1 truncate text-xs text-destructive" title={source.screenshot_error ?? ""}>
                {source.screenshot_error ?? "Screenshot failed"}
              </span>
            ) : (
              <span className="flex-1 text-xs text-muted-foreground">Not captured yet</span>
            )}
            {!shotBusy && source.screenshot_status !== "pending" ? (
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={doShot}>
                <RefreshCw className="mr-1 size-3" /> {source.drive_url ? "Retake" : "Retry screenshot"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {template ? (
          <TemplateNoticeBox
            source={source}
            template={template}
            ourReviewUrl={
              urlMode === "drive"
                ? (source.drive_url ?? null)
                : source.published_path
                  ? `${SITE_URL}${source.published_path}`
                  : null
            }
            preferOurUrl={urlMode === "drive"}
            ourPublishDate={source.published_review_date ?? null}
            ourReviewerName={reviewerName}
            onSaved={onRefresh}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
            No DMCA copy template selected for this order — pick one from the “DMCA copy template”
            dropdown above to see the notice here.
          </p>
        )}
      </div>


    </div>
  );
}

const DELAY_PRESETS: Array<{ label: string; min: number; max: number }> = [
  { label: "No delay (send back-to-back)", min: 0, max: 0 },
  { label: "51s – 5m", min: 51, max: 300 },
  { label: "1m – 10m", min: 60, max: 600 },
  { label: "10m – 1h", min: 600, max: 3600 },
  { label: "30m – 2h", min: 1800, max: 7200 },
];

function formatDelayLabel(min: number, max: number) {
  if (!max) return "No delay";
  const fmt = (s: number) => (s >= 3600 ? `${Math.round(s / 3600)}h` : s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`);
  return `${fmt(min)} – ${fmt(max)}`;
}

function DmcaAutomationSettings({
  orderId,
  order,
  onSaved,
}: {
  orderId: string;
  order: { dmca_url_mode?: string | null; dmca_delay_min_seconds?: number | null; dmca_delay_max_seconds?: number | null; dmca_next_allowed_at?: string | null } | undefined;
  onSaved: () => void;
}) {
  const save = useServerFn(setOrderDmcaSettings);
  const resetForReReport = useServerFn(resetOrderDmcaForReReport);
  const [urlMode, setUrlMode] = useState<"site" | "drive">(
    (order?.dmca_url_mode as "site" | "drive") ?? "site",
  );
  const currentMin = order?.dmca_delay_min_seconds ?? 0;
  const currentMax = order?.dmca_delay_max_seconds ?? 0;
  const presetIndex = DELAY_PRESETS.findIndex((p) => p.min === currentMin && p.max === currentMax);
  const [selected, setSelected] = useState<number>(presetIndex === -1 ? 0 : presetIndex);
  const [saving, setSaving] = useState(false);

  const commit = async (nextMode: "site" | "drive", nextIdx: number) => {
    const preset = DELAY_PRESETS[nextIdx] ?? DELAY_PRESETS[0]!;
    setSaving(true);
    try {
      await save({
        data: {
          orderId,
          urlMode: nextMode,
          delayMinSeconds: preset.min,
          delayMaxSeconds: preset.max,
        },
      });
      toast.success("DMCA automation updated");
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const waitSecs = order?.dmca_next_allowed_at
    ? Math.max(0, Math.ceil((new Date(order.dmca_next_allowed_at).getTime() - Date.now()) / 1000))
    : 0;

  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs md:grid-cols-2">
      <div className="space-y-2">
        <p className="small-caps-label">Link used in DMCA copy &amp; form</p>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`urlmode-${orderId}`}
              checked={urlMode === "site"}
              disabled={saving}
              onChange={() => {
                setUrlMode("site");
                void commit("site", selected);
              }}
            />
            <span>Our review page URL (default)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`urlmode-${orderId}`}
              checked={urlMode === "drive"}
              disabled={saving}
              onChange={() => {
                setUrlMode("drive");
                void commit("drive", selected);
              }}
            />
            <span>Google Drive screenshot link</span>
          </label>
        </div>
        <p className="text-[0.65rem] text-muted-foreground">
          Drive mode replaces our website link everywhere in the DMCA copy and in the extension's
          "where can we find the work" field. Reviews without a Drive screenshot are held back until
          one is taken — no wrong link is ever submitted.
        </p>
      </div>
      <div className="space-y-2">
        <p className="small-caps-label">Delay between reports</p>
        <select
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          value={selected}
          disabled={saving}
          onChange={(e) => {
            const idx = Number(e.target.value);
            setSelected(idx);
            void commit(urlMode, idx);
          }}
        >
          {DELAY_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.label}</option>
          ))}
        </select>
        <p className="text-[0.65rem] text-muted-foreground">
          Current: {formatDelayLabel(currentMin, currentMax)}. Each report waits a random amount in
          this range before the next one is claimed — enforced server-side, so the extension can't
          skip ahead.
          {waitSecs > 0 ? ` Next report available in ~${waitSecs}s.` : ""}
        </p>
      </div>
      <div className="space-y-2 md:col-span-2">
        <p className="small-caps-label">Report again (admin only)</p>
        <button
          type="button"
          disabled={saving}
          className="h-8 rounded-md border border-input bg-background px-3 text-xs hover:bg-muted"
          onClick={async () => {
            if (!confirm("Put every review in this order back in the extension queue so it can be reported again?")) return;
            setSaving(true);
            try {
              const res = await resetForReReport({ data: { orderId } });
              toast.success(`${res.reset} review(s) ready to report again`);
              onSaved();
            } catch (error) {
              toast.error((error as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          Allow re-report of all reviews
        </button>
        <p className="text-[0.65rem] text-muted-foreground">
          Past reports stay in history. The extension will then be able to select this order and
          submit each link again.
        </p>
      </div>
    </div>
  );
}

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const loadOrder = useServerFn(getReviewOrder);
  const loadSources = useServerFn(listReviewSources);
  const runBatch = useServerFn(fetchSourceBatch);
  const publish = useServerFn(publishSource);
  const removeOrder = useServerFn(deleteReviewOrder);
  const syncDmca = useServerFn(syncOrderDmca);
  const removeFailed = useServerFn(deleteFailedSources);
  const takeShot = useServerFn(screenshotSource);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ["review-order", orderId],
    queryFn: () => loadOrder({ data: { id: orderId } }),
  });
  const sourcesQuery = useQuery({
    queryKey: ["review-sources", orderId],
    queryFn: () => loadSources({ data: { orderId } }),
  });

  const loadTemplates = useServerFn(listDmcaTemplates);
  const assignTemplate = useServerFn(setOrderTemplate);
  const templatesQuery = useQuery({ queryKey: ["dmca-templates"], queryFn: () => loadTemplates() });
  const templateId = orderQuery.data?.dmca_template_id ?? null;
  const template = (templatesQuery.data ?? []).find((t) => t.id === templateId) ?? null;

  const sources: ReviewSource[] = sourcesQuery.data ?? [];

  const counts = useMemo(() => {
    let fetched = 0;
    let pending = 0;
    let published = 0;
    let failed = 0;
    for (const s of sources) {
      if ((s.review_text ?? "").trim()) fetched++;
      if (s.status === "pending" || s.status === "fetching") pending++;
      if (s.published_review_id || s.published_profile_review_id) published++;
      if (s.status === "failed" || s.status === "empty") failed++;
    }
    return { fetched, pending, published, failed, total: sources.length };
  }, [sources]);

  const readyToPublish = useMemo(
    () => sources.filter((s) => !s.published_review_id && !s.published_profile_review_id && (s.review_text ?? "").trim().length >= 20),
    [sources],
  );

  const publishedSources = useMemo(
    () => sources.filter((s) => s.published_path),
    [sources],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["review-sources", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["review-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["all-reviews"] });
  };

  const runFetch = async (refreshAll: boolean, fallback = false, retryFailed = false) => {
    setBusy(true);
    let imported = 0;
    let failed = 0;
    let rounds = 0;
    try {
      while (rounds < 200) {
        rounds++;
        setProgress(
          `Fetching… ${imported} collected${failed ? `, ${failed} failed` : ""} (batch ${rounds})`,
        );
        const result = await runBatch({ data: { limit: retryFailed ? 10 : 30, orderId, refreshAll, fallback, retryFailed } });
        imported += result.imported;
        failed += result.failed;
        // Refreshing the whole list every round is expensive on big orders.
        if (rounds % 3 === 0) refresh();
        if (result.processed === 0) break;
        if (refreshAll) break;
        if (result.remaining === 0) break;
      }
      if (imported) toast.success(`Collected ${imported} review${imported === 1 ? "" : "s"}`);
      else if (!failed) toast.info("Nothing left to fetch.");
      if (failed) toast.error(`${failed} link${failed === 1 ? "" : "s"} could not be read`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProgress(null);
      setBusy(false);
      refresh();
    }
  };

  const screenshotAll = async (targets: { id: string }[]) => {
    if (targets.length === 0) return;
    setBusy(true);
    let ok = 0;
    let failed = 0;
    let firstError: string | null = null;
    try {
      let next = 0;
      const worker = async () => {
        while (next < targets.length) {
          const t = targets[next++]!;
          setProgress(`Screenshots… ${ok + failed} of ${targets.length} done`);
          try {
            const r = await takeShot({ data: { id: t.id } });
            if (r.ok) ok++;
            else {
              failed++;
              firstError ??= r.error;
            }
          } catch (e) {
            failed++;
            firstError ??= (e as Error).message;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, targets.length) }, () => worker()));
      if (ok) toast.success(`${ok} screenshot${ok === 1 ? "" : "s"} saved to Google Drive`);
      if (failed) toast.error(`${failed} screenshot(s) failed${firstError ? ` — ${firstError}` : ""}`);
    } finally {
      setProgress(null);
      setBusy(false);
      refresh();
    }
  };

  const publishAll = async () => {
    setBusy(true);
    let done = 0;
    let failed = 0;
    let firstError: string | null = null;
    try {
      for (const source of readyToPublish) {
        setProgress(`Publishing ${done + 1} of ${readyToPublish.length}…`);
        try {
          await publish({ data: { id: source.id } });
          done++;
        } catch (error) {
          failed++;
          // Surface the real reason instead of a silent count.
          if (!firstError) firstError = (error as Error).message;
          console.error("publish failed", source.id, error);
        }
      }
      if (done) toast.success(`Published ${done} review${done === 1 ? "" : "s"}`);
      if (failed) {
        toast.error(
          `${failed} could not be published${firstError ? ` — ${firstError}` : ""}`,
        );
      }
    } finally {
      setProgress(null);
      setBusy(false);
      refresh();
    }
  };

  const removeFailedUrls = async () => {
    if (
      !window.confirm(
        `Remove ${counts.failed} link${counts.failed === 1 ? "" : "s"} that returned no review text? These are usually rating-only reviews.`,
      )
    )
      return;
    setBusy(true);
    setProgress("Removing failed links…");
    try {
      const result = await removeFailed({ data: { orderId } });
      if (result.removed) {
        toast.success(`Removed ${result.removed} failed link${result.removed === 1 ? "" : "s"}`);
      } else {
        toast.info("Nothing to remove — those links still hold review text.");
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProgress(null);
      setBusy(false);
      refresh();
    }
  };

  const generateDmca = async () => {
    setBusy(true);
    setProgress("Updating DMCA fields…");
    try {
      const result = await syncDmca({ data: { orderId, siteUrl: SITE_URL } });
      if (result.updated) {
        toast.success(
          `DMCA fields updated for ${result.updated} review${result.updated === 1 ? "" : "s"}`,
        );
      } else {
        toast.info("No published reviews to update yet.");
      }
      if (result.skipped) toast.error(`${result.skipped} review(s) had no live link yet`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProgress(null);
      setBusy(false);
      refresh();
    }
  };

  const downloadCsv = () => {
    const rows = [
      ["url", "reviewer_name", "rating", "review_date", "slug", "drive_screenshot", "review_text"],
      ...sources.map((s) => [
        s.url,
        s.reviewer_name ?? "",
        String(s.rating ?? ""),
        s.review_published_at ?? "",
        s.published_slug ?? "",
        s.drive_url ?? "",
        (s.review_text ?? "").replace(/\s+/g, " "),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${orderQuery.data?.name ?? "order"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const percent = counts.total === 0 ? 0 : Math.round((counts.fetched / counts.total) * 100);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8 lg:py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/admin/orders">
          <ArrowLeft className="mr-2 size-4" /> All orders
        </Link>
      </Button>

      <div className="press-panel p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <p className="small-caps-label">Order batch</p>
            <h1 className="mt-1 truncate font-display text-2xl text-foreground">
              {orderQuery.data?.name ?? "Order"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {orderQuery.data?.created_at
                ? `Created ${new Date(orderQuery.data.created_at).toLocaleDateString()}`
                : ""}
              {orderQuery.data?.note ? ` · ${orderQuery.data.note}` : ""}
              {orderQuery.data
                ? ` · Publishes to ${orderQuery.data.reviewer_key === "jonas" ? "Jonas Weber (/Jonas-Weber)" : orderQuery.data.reviewer_key === "benedikt" ? "Benedikt Herrmann (/Benedikt-Herrmann)" : "Robiul Alam (/robiul-alam)"}`
                : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete order"
            className="shrink-0"
            onClick={async () => {
              if (!window.confirm("Delete this order and its links?")) return;
              await removeOrder({ data: { id: orderId } });
              navigate({ to: "/admin/orders" });
            }}
          >
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
          <Button
            type="button"
            className="rounded-full"
            disabled={busy || counts.pending === 0}
            onClick={() => runFetch(false)}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Fetch review text ({counts.pending})
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy || counts.total === 0}
            onClick={() => runFetch(true)}
          >
            <RefreshCw className="mr-2 size-4" /> Refresh all text
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy || counts.failed === 0}
            onClick={() => runFetch(false, false, true)}
          >
            <RefreshCw className="mr-2 size-4" /> Fetch failed again ({counts.failed})
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy || counts.failed === 0}
            onClick={() => runFetch(false, true, true)}
          >
            <RefreshCw className="mr-2 size-4" /> Deep retry failed ({counts.failed})
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full text-destructive hover:text-destructive"
            disabled={busy || counts.failed === 0}
            onClick={removeFailedUrls}
          >
            <Trash2 className="mr-2 size-4" /> Remove failed ({counts.failed})
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy || readyToPublish.length === 0}
            onClick={publishAll}
          >
            <Rocket className="mr-2 size-4" /> Publish all ({readyToPublish.length})
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy || counts.published === 0}
            onClick={generateDmca}
          >
            <ShieldCheck className="mr-2 size-4" /> Generate DMCA ({counts.published})
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={counts.total === 0}
            onClick={downloadCsv}
          >
            <Download className="mr-2 size-4" /> Download CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy || publishedSources.length === 0}
            onClick={() => {
              const retakes = publishedSources.filter((s) => s.drive_url).length;
              if (
                retakes &&
                !window.confirm(
                  `Take screenshots of all ${publishedSources.length} published reviews? ${retakes} already have one — those will be replaced with a fresh screenshot.`,
                )
              )
                return;
              void screenshotAll(publishedSources);
            }}
          >
            <Camera className="mr-2 size-4" /> Take screenshot ({publishedSources.length})
          </Button>
        </div>
        {progress ? <p className="mt-3 text-xs text-muted-foreground">{progress}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">DMCA copy template:</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={templateId ?? ""}
            onChange={async (e) => {
              try {
                await assignTemplate({ data: { orderId, templateId: e.target.value || null } });
                void queryClient.invalidateQueries({ queryKey: ["review-order", orderId] });
                toast.success("Template updated");
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <option value="">No template</option>
            {(templatesQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <DmcaAutomationSettings orderId={orderId} order={orderQuery.data} onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["review-order", orderId] });
        }} />
      </div>

      <div className="mt-5 space-y-4">
        {sourcesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading links…</p>
        ) : sources.length === 0 ? (
          <div className="press-panel p-10 text-center text-sm text-muted-foreground">
            This order has no review links yet.
          </div>
        ) : (
          sources.map((source, index) => (
            <SourceCard
              key={`${source.id}:${source.updated_at}`}
              source={source}
              index={index}
              busy={busy}
              onRefresh={refresh}
              template={template}
              reviewerName={reviewerDisplayName(orderQuery.data?.reviewer_key)}
              urlMode={orderQuery.data?.dmca_url_mode ?? "site"}
            />
          ))
        )}
      </div>
    </div>
  );
}
