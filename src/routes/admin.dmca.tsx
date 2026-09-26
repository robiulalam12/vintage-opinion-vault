import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DmcaTemplates } from "@/components/admin/DmcaTemplates";
import {
  getDmcaExtensionKey,
  listDmcaBatches,
  listDmcaProgress,
  listDmcaReports,
  markDmcaBatchSubmitted,
  releaseDmcaBatch,
  releaseDmcaReport,
} from "@/lib/dmca.functions";

export const Route = createFileRoute("/admin/dmca")({
  component: DmcaPage,
});

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const STATUS_STYLES: Record<string, string> = {
  reserved: "border-warning/40 bg-warning/15 text-warning-foreground",
  claimed: "border-warning/40 bg-warning/15 text-warning-foreground",
  submitted: "border-success/40 bg-success/15 text-success",
  cancelled: "border-border bg-muted text-muted-foreground",
  released: "border-border bg-muted text-muted-foreground",
  skipped: "border-border bg-muted text-muted-foreground",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function CountPill({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold tabular-nums ${
        tone ?? "border-border bg-muted text-muted-foreground"
      }`}
    >
      {value} <span className="font-normal">{label}</span>
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold ${
        STATUS_STYLES[status] ?? STATUS_STYLES["cancelled"]
      }`}
    >
      {status}
    </span>
  );
}

function KeyCard() {
  const fetchKey = useServerFn(getDmcaExtensionKey);
  const [shown, setShown] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["dmca-key"],
    queryFn: () => fetchKey(),
  });
  const key = data?.key ?? "";

  return (
    <div className="press-panel p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Extension setup</h2>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Load the unpacked extension from the <code className="font-mono">extension/</code> folder,
        open its Settings, and paste this key plus your dashboard URL. Batch mode reserves up to 100
        raw Google review URLs per notice and you click Submit. One-by-one mode reports every review
        in an order with full evidence — no 90-link cap — and keeps going hands-off (2Captcha is
        pre-configured) until you press Stop run.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Input
          readOnly
          value={isLoading ? "Loading…" : shown ? key : "•".repeat(Math.min(key.length, 32))}
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={shown ? "Hide key" : "Show key"}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Copy key"
          disabled={!key}
          onClick={() => {
            void navigator.clipboard.writeText(key);
            toast.success("API key copied");
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        onClick={() => {
          fetch("/dmca-extension.zip")
            .then((res) => {
              if (!res.ok) throw new Error(`Download failed: ${res.status}`);
              return res.blob();
            })
            .then((blob) => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "dmca-extension.zip";
              a.click();
              URL.revokeObjectURL(a.href);
            })
            .catch((error: Error) => toast.error(error.message));
        }}
      >
        <Download className="mr-1.5 size-3.5" /> Download extension
      </Button>
    </div>
  );
}


function SingleReports() {
  const fetchReports = useServerFn(listDmcaReports);
  const release = useServerFn(releaseDmcaReport);
  const [busy, setBusy] = useState<string | null>(null);
  const reports = useQuery({ queryKey: ["dmca-reports"], queryFn: () => fetchReports() });
  const rows = reports.data ?? [];
  const submitted = rows.filter((r) => r.status === "submitted").length;

  return (
    <div className="press-panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">One-by-one reports</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {submitted} submitted individually, each with its own review link, published URL and
            DMCA text. Start a run from the extension popup.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={reports.isFetching}
          onClick={() => void reports.refetch()}
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${reports.isFetching ? "animate-spin" : ""}`} />{" "}
          Refresh
        </Button>
      </div>
      {reports.isLoading ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          No single reports yet — open the extension and press “Start 1-by-1 run”.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((report) => (
            <div
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusPill status={report.status} />
                  <span className="truncate text-xs text-muted-foreground">
                    {report.order_name ?? "—"}
                  </span>
                </div>
                {report.our_url ? (
                  <a
                    href={report.our_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 block truncate font-mono text-xs text-primary hover:underline"
                  >
                    {report.our_url}
                  </a>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">—</p>
                )}
                {report.google_url ? (
                  <a
                    href={report.google_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
                  >
                    {report.google_url}
                  </a>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {report.publication_date ? (
                    <span className="pill">Published {report.publication_date}</span>
                  ) : null}
                  {report.our_url ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[0.7rem]"
                      onClick={() => {
                        void navigator.clipboard.writeText(report.our_url!);
                        toast.success("Link copied");
                      }}
                    >
                      <Copy className="mr-1 size-3" /> Copy link
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Claimed {DATE.format(new Date(report.claimed_at))} ({relativeTime(report.claimed_at)})
                  {report.submitted_at
                    ? ` · submitted ${DATE.format(new Date(report.submitted_at))}`
                    : ""}
                  {report.case_ref ? ` · case ${report.case_ref}` : ""}
                  {report.error ? ` · ${report.error}` : ""}
                </p>
              </div>
              {report.status !== "submitted" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy === report.id}
                  onClick={async () => {
                    setBusy(report.id);
                    try {
                      await release({ data: { id: report.id } });
                      toast.success("Review returned to the pool");
                      void reports.refetch();
                    } catch (error) {
                      toast.error((error as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === report.id ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 size-3.5" />
                  )}
                  Return to pool
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DmcaPage() {
  const fetchProgress = useServerFn(listDmcaProgress);
  const fetchBatches = useServerFn(listDmcaBatches);
  const release = useServerFn(releaseDmcaBatch);
  const markSubmitted = useServerFn(markDmcaBatchSubmitted);
  const [busy, setBusy] = useState<string | null>(null);

  const progress = useQuery({ queryKey: ["dmca-progress"], queryFn: () => fetchProgress() });
  const batches = useQuery({ queryKey: ["dmca-batches"], queryFn: () => fetchBatches() });

  const refresh = () => {
    void progress.refetch();
    void batches.refetch();
  };

  const totals = (progress.data ?? []).reduce(
    (acc, o) => ({
      published: acc.published + o.published,
      reported: acc.reported + o.reported,
      reserved: acc.reserved + o.reserved,
      remaining: acc.remaining + o.remaining,
    }),
    { published: 0, reported: 0, reserved: 0, remaining: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Published reviews", value: totals.published },
          { label: "Reported to Google", value: totals.reported },
          { label: "Reserved in a batch", value: totals.reserved },
          { label: "Still to report", value: totals.remaining },
        ].map((stat) => (
          <div key={stat.label} className="press-panel p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <KeyCard />

      <DmcaTemplates />

      <SingleReports />

      <div className="press-panel overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Reporting progress by order</h2>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={progress.isFetching || batches.isFetching}
            onClick={refresh}
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${progress.isFetching ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
        </div>
        {progress.isLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : (progress.data ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No review orders yet — create an order, fetch the review text, publish it, then come
            back here to report.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {(progress.data ?? []).map((order) => {
              const percent =
                order.published === 0 ? 0 : Math.round((order.reported / order.published) * 100);
              return (
                <div key={order.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-medium">{order.name}</p>
                      <span className="pill border-primary/30 text-primary">
                        {order.reviewer_key === "jonas" ? "Jonas Weber" : order.reviewer_key === "benedikt" ? "Benedikt Herrmann" : "Robiul Alam"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CountPill label="published" value={order.published} />
                      <CountPill
                        label="reported"
                        value={order.reported}
                        tone="border-success/40 bg-success/10 text-success"
                      />
                      <CountPill
                        label="reserved"
                        value={order.reserved}
                        tone="border-warning/40 bg-warning/15 text-warning-foreground"
                      />
                      <CountPill
                        label="left"
                        value={order.remaining}
                        tone="border-primary/40 bg-primary/10 text-primary"
                      />
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="press-panel overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Notice batches</h2>
        </div>
        {batches.isLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : (batches.data ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No batches yet — reserve one from the extension popup.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {(batches.data ?? []).map((batch) => (
              <div
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusPill status={batch.status} />
                    <span className="text-sm font-medium">{batch.url_count} URLs</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {batch.order_name ?? "—"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {DATE.format(new Date(batch.created_at))} (
                    {relativeTime(batch.created_at)})
                    {batch.publication_date ? ` · published ${batch.publication_date}` : ""}
                    {batch.submitted_at
                      ? ` · submitted ${DATE.format(new Date(batch.submitted_at))} (${relativeTime(batch.submitted_at)})`
                      : ""}
                    {batch.google_case_ref ? ` · case ${batch.google_case_ref}` : ""}
                  </p>
                </div>
                {batch.status === "reserved" ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy === batch.id}
                      onClick={async () => {
                        setBusy(batch.id);
                        try {
                          const result = await markSubmitted({ data: { id: batch.id } });
                          toast.success(`${result.reported} URLs marked reported`);
                          refresh();
                        } catch (error) {
                          toast.error((error as Error).message);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === batch.id ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-1.5 size-3.5" />
                      )}
                      Mark submitted
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy === batch.id}
                      onClick={async () => {
                        setBusy(batch.id);
                        try {
                          const result = await release({ data: { id: batch.id } });
                          toast.success(`${result.released} URLs released`);
                          refresh();
                        } catch (error) {
                          toast.error((error as Error).message);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      Release
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
