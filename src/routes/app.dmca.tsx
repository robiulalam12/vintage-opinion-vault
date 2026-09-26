import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Copy, Download, FileText, Loader2, Pencil, Plug, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TEMPLATE_FIELDS } from "@/lib/dmca-template";
import {
  deleteMyDmcaReport,
  deleteMyDmcaTemplate,
  getMyExtensionKey,
  listMyDmcaReports,
  listMyDmcaTemplates,
  rotateMyExtensionKey,
  saveMyDmcaTemplate,
  updateMyDmcaReport,
  type UserDmcaReport,
  type UserDmcaTemplate,
} from "@/lib/user-dmca.functions";

// ---------------- Extension card ----------------

function ExtensionCard() {
  const qc = useQueryClient();
  const load = useServerFn(getMyExtensionKey);
  const rotate = useServerFn(rotateMyExtensionKey);
  const keyQuery = useQuery({ queryKey: ["my-extension-key"], queryFn: () => load() });
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const token = keyQuery.data?.token ?? "";

  return (
    <div className="press-panel overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Plug className="size-4 text-primary" /> Browser helper
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Install the helper in Chrome, paste your personal key, and it fills and sends the Google
          form for each of your published reviews, one at a time.
        </p>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Your personal key
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={keyQuery.isLoading ? "Loading…" : shown ? token : "•".repeat(Math.min(40, token.length || 40))}
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => setShown((s) => !s)}>
              {shown ? "Hide" : "Show"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!token}
              onClick={() => { void navigator.clipboard.writeText(token); toast.success("Key copied"); }}>
              <Copy className="mr-1 size-3" /> Copy
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy}
              onClick={async () => {
                if (!window.confirm("Create a new key? The old one stops working right away.")) return;
                setBusy(true);
                try {
                  await rotate();
                  toast.success("New key created — paste it into the helper again.");
                  void qc.invalidateQueries({ queryKey: ["my-extension-key"] });
                } catch (e) { toast.error((e as Error).message); }
                finally { setBusy(false); }
              }}>
              <RefreshCw className={`mr-1 size-3 ${busy ? "animate-spin" : ""}`} /> New key
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This key only reaches your own orders and reports. Keep it private — anyone with it can
            send reports from your account.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Download the helper and unzip it.</li>
            <li>In Chrome open the Extensions page, turn on Developer mode, then "Load unpacked" and pick the folder.</li>
            <li>Open its Settings, paste the key above, fill in your name and email, and save.</li>
            <li>Open the helper, pick one of your orders and start the one-by-one run.</li>
          </ol>
        </div>
        <div className="space-y-2">
          <Button type="button" className="w-full rounded-full"
            onClick={() => {
              const a = document.createElement("a");
              a.href = "/dmca-extension-user.zip";
              a.download = "dmca-extension-user.zip";
              a.click();
            }}>
            <Download className="mr-2 size-4" /> Download helper
          </Button>
          {keyQuery.data?.last_used_at ? (
            <p className="text-center text-[0.7rem] text-muted-foreground">
              Last used {new Date(keyQuery.data.last_used_at).toLocaleString()}
            </p>
          ) : (
            <p className="text-center text-[0.7rem] text-muted-foreground">Not used yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/app/dmca")({
  head: () => ({ meta: [
    { title: "DMCA Reports — People Opinion Box" },
    { name: "description", content: "Review your copyright notice templates and reports." },
    { property: "og:title", content: "DMCA Reports — People Opinion Box" },
    { property: "og:description", content: "Review your copyright notice templates and reports." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: DmcaPage,
});

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const STATUS_TONE: Record<string, string> = {
  pending: "border-warning/40 bg-warning/15 text-warning-foreground",
  submitted: "border-primary/40 bg-primary/10 text-primary",
  accepted: "border-success/40 bg-success/15 text-success",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};

const STATUSES = ["pending", "submitted", "accepted", "rejected", "failed"] as const;

// ---------------- Templates section ----------------

function TemplatesCard() {
  const qc = useQueryClient();
  const load = useServerFn(listMyDmcaTemplates);
  const save = useServerFn(saveMyDmcaTemplate);
  const remove = useServerFn(deleteMyDmcaTemplate);
  const templates = useQuery({ queryKey: ["my-dmca-templates"], queryFn: () => load() });

  const [editing, setEditing] = useState<UserDmcaTemplate | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const reset = () => {
    setEditing(null);
    setName("");
    setBody("");
  };

  const insert = (token: string) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const submit = async () => {
    setSaving(true);
    try {
      const payload: { id?: string; name: string; body: string } = { name, body };
      if (editing?.id) payload.id = editing.id;
      await save({ data: payload });
      toast.success(editing ? "Template updated" : "Template saved");
      reset();
      void qc.invalidateQueries({ queryKey: ["my-dmca-templates"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="press-panel overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 text-primary" /> My notice templates
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Write your own copyright notice text and insert fields. Only your templates show up here.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Input
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_FIELDS.map((f) => (
              <Button
                key={f.token}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-full px-2.5 text-xs"
                onClick={() => insert(f.token)}
              >
                <Plus className="mr-1 size-3" /> {f.label}
              </Button>
            ))}
          </div>
          <Textarea
            ref={bodyRef}
            rows={10}
            placeholder="Write your notice, then click a field above to insert it."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={saving || name.trim().length < 2 || body.trim().length < 10}
              onClick={submit}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editing ? "Update template" : "Save template"}
            </Button>
            {editing ? (
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your templates
          </p>
          {templates.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (templates.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            (templates.data ?? []).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm">{t.name}</span>
                <div className="flex shrink-0">
                  {t.readonly ? (
                    <span className="pr-2 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                      default
                    </span>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Edit template"
                        onClick={() => {
                          setEditing(t);
                          setName(t.name);
                          setBody(t.body);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Delete template"
                        onClick={async () => {
                          if (!window.confirm(`Delete "${t.name}"?`)) return;
                          try {
                            await remove({ data: { id: t.id } });
                            if (editing?.id === t.id) reset();
                            void qc.invalidateQueries({ queryKey: ["my-dmca-templates"] });
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}


// ---------------- Reports list ----------------

function ReportsList({ reports, refetch, isFetching }: { reports: UserDmcaReport[]; refetch: () => void; isFetching: boolean }) {
  const qc = useQueryClient();
  const update = useServerFn(updateMyDmcaReport);
  const remove = useServerFn(deleteMyDmcaReport);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all" ? reports : reports.filter((r) => r.status === filter);

  const changeStatus = async (id: string, status: (typeof STATUSES)[number]) => {
    setBusy(id);
    try {
      await update({ data: { id, status } });
      void qc.invalidateQueries({ queryKey: ["my-dmca-reports"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="press-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Your reports</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {reports.length} total · {reports.filter((r) => r.status === "submitted").length} submitted
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="ghost" disabled={isFetching} onClick={refetch}>
            <RefreshCw className={`mr-1.5 size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {reports.length === 0 ? "No reports yet — publish reviews in Review Orders, then press Generate DMCA or run the browser helper." : "No reports match this filter."}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((r) => (
            <div key={r.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold ${
                        STATUS_TONE[r.status] ?? "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Added {DATE.format(new Date(r.created_at))}
                    </span>
                    {r.submitted_at ? (
                      <span className="text-xs text-muted-foreground">
                        · submitted {DATE.format(new Date(r.submitted_at))}
                      </span>
                    ) : null}
                    {r.case_ref ? (
                      <span className="text-xs text-muted-foreground">· case {r.case_ref}</span>
                    ) : null}
                  </div>
                  <a
                    href={r.google_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 block truncate font-mono text-xs text-primary hover:underline"
                  >
                    {r.google_url}
                  </a>
                  {r.our_url ? (
                    <a
                      href={r.our_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      → {r.our_url}
                    </a>
                  ) : null}
                  {r.drive_url ? (
                    <a
                      href={r.drive_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      Drive: {r.drive_url}
                    </a>
                  ) : null}
                  {r.note ? <p className="mt-1 text-xs">{r.note}</p> : null}
                  {r.notice_text ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-primary">View notice text</summary>
                      <Textarea readOnly rows={8} value={r.notice_text} className="mt-2 font-mono text-xs" />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-1"
                        onClick={() => {
                          void navigator.clipboard.writeText(r.notice_text ?? "");
                          toast.success("Notice copied");
                        }}
                      >
                        <Copy className="mr-1 size-3" /> Copy notice
                      </Button>
                    </details>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select
                    value={r.status}
                    onValueChange={(v) => changeStatus(r.id, v as (typeof STATUSES)[number])}
                  >
                    <SelectTrigger className="h-8 w-[130px] text-xs" disabled={busy === r.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Delete report"
                    disabled={busy === r.id}
                    onClick={async () => {
                      if (!window.confirm("Delete this report?")) return;
                      setBusy(r.id);
                      try {
                        await remove({ data: { id: r.id } });
                        void qc.invalidateQueries({ queryKey: ["my-dmca-reports"] });
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Page ----------------

function DmcaPage() {
  const loadReports = useServerFn(listMyDmcaReports);
  const reports = useQuery({ queryKey: ["my-dmca-reports"], queryFn: () => loadReports() });


  const rows = reports.data ?? [];
  const stats = {
    total: rows.length,
    submitted: rows.filter((r) => r.status === "submitted" || r.status === "accepted").length,
    pending: rows.filter((r) => r.status === "pending").length,
    failed: rows.filter((r) => r.status === "failed" || r.status === "rejected").length,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div>
        <h1 className="font-display text-3xl">DMCA Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your copyright notices, write reusable templates, and copy the notice text ready to
          submit to Google.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Total reports", value: stats.total },
          { label: "Submitted", value: stats.submitted },
          { label: "Pending", value: stats.pending },
          { label: "Failed / rejected", value: stats.failed },
        ].map((s) => (
          <div key={s.label} className="press-panel p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <ExtensionCard />
      <TemplatesCard />
      <ReportsList
        reports={rows}
        isFetching={reports.isFetching}
        refetch={() => void reports.refetch()}
      />
    </div>
  );
}
