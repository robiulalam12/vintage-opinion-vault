import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Flame, Loader2, Trash2, ShieldCheck, RefreshCw, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import {
  listTemplates,
  listOrders,
  verifyTemplate,
  deleteTemplate,
  deleteTemplatesBatch,
  setTemplateStatus,
  createOrder,
  cancelOrder,
  deleteOrder,
  fakeReviewsOverview,
  addTemplateFromCookies,
  addTemplatesFromCookiesBatch,
  type FakeTemplateSummary,
} from "@/lib/fake-reviews.functions";
import {
  listComments,
  addComments,
  toggleComment,
  deleteComment,
  deleteAllComments,
} from "@/lib/fake-review-comments.functions";

export const Route = createFileRoute("/admin/fake-reviews/")({
  head: () => ({
    meta: [
      { title: "Fake reviews — Dashboard" },
      { name: "description", content: "Fake review firehose control panel." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FakeReviewsPage,
});

const REASONS = [
  { key: "LOW_QUALITY", label: "Low quality" },
  { key: "PROFANITY", label: "Profanity" },
  { key: "HARMFUL", label: "Harmful/dangerous" },
  { key: "BULLYING", label: "Bullying/harassment" },
  { key: "DISCRIMINATION", label: "Discrimination/hate" },
  { key: "PERSONAL", label: "Personal information" },
  { key: "NOT_HELPFUL", label: "Not helpful" },
] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    fresh: "bg-emerald-100 text-emerald-800",
    stale: "bg-amber-100 text-amber-800",
    expired: "bg-red-100 text-red-800",
    disabled: "bg-slate-200 text-slate-700",
    draft: "bg-slate-200 text-slate-700",
    firing: "bg-blue-100 text-blue-800",
    done: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-slate-200 text-slate-700",
  };
  if (status?.startsWith("drip:")) {
    return (
      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">drip-feed</span>
    );
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-slate-200 text-slate-700"}`}>
      {status}
    </span>
  );
}

function FakeReviewsPage() {
  const overviewFn = useServerFn(fakeReviewsOverview);
  const overview = useQuery({ queryKey: ["fr-overview"], queryFn: () => overviewFn() });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 lg:px-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Fake reviews firehose</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Capture Google sessions with the extension, then replay reports against target reviews.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/pob-capture-extension-v3.2.0.zip" download>
            Download capture extension v3.2.0
          </a>
        </Button>
      </header>

      {overview.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            label="Fresh templates"
            value={overview.data.templates.fresh}
            sub={`${overview.data.templates.total} total`}
          />
          <Kpi label="Orders firing" value={overview.data.orders.firing} sub={`${overview.data.orders.done} done`} />
          <Kpi label="Shots (24h)" value={overview.data.shots.last24} sub={`${overview.data.shots.total} all-time`} />
          <Kpi label="Success" value={overview.data.shots.ok} sub={`${overview.data.shots.err} errors`} />
        </div>
      ) : null}

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4">
          <OrdersTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="comments" className="mt-4">
          <CommentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/* ---------------------------------- Templates --------------------------------- */

function TemplatesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const verifyFn = useServerFn(verifyTemplate);
  const deleteFn = useServerFn(deleteTemplate);
  const statusFn = useServerFn(setTemplateStatus);
  const q = useQuery({ queryKey: ["fr-templates"], queryFn: () => listFn() });

  const verifyM = useMutation({
    mutationFn: (id: string) => verifyFn({ data: { id } }),
    onSuccess: (r) => {
      if (r.status === "fresh") {
        toast.success("Template verified");
      } else if (r.status === "stale") {
        toast.warning(`Verification inconclusive: ${r.reason ?? "unknown"}`, { duration: 8000 });
      } else {
        toast.error(`Template session expired: ${r.reason ?? "Google rejected the session"}`, { duration: 8000 });
      }
      qc.invalidateQueries({ queryKey: ["fr-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["fr-templates"] });
    },
  });
  const statusM = useMutation({
    mutationFn: (v: { id: string; status: "fresh" | "disabled" }) => statusFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fr-templates"] }),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading templates…</p>;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Add extra Google accounts by uploading their cookies.txt — endpoint, headers, and body reuse an existing
          captured template.
        </p>
        <div className="flex gap-2">
          <AddTemplateDialog />
          <BulkUploadDialog />
          <BulkRemoveDialog rows={rows} />
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No captured sessions yet. Install the capture extension and open Google Maps signed in, or upload a
          cookies.txt above once at least one template exists.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Tag</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Shots</th>
                <th className="px-3 py-2">Captured</th>
                <th className="px-3 py-2">Last error</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2">
                    {r.tag ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.tag}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.google_email ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2">{r.shots_fired}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(r.captured_at).toLocaleString()}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate text-xs text-red-600">{r.last_error ?? ""}</td>
                  <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={verifyM.isPending}
                      onClick={() => verifyM.mutate(r.id)}
                    >
                      <ShieldCheck className="mr-1 size-3" />
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        statusM.mutate({ id: r.id, status: r.status === "disabled" ? "fresh" : "disabled" })
                      }
                    >
                      {r.status === "disabled" ? "Enable" : "Disable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this template?")) deleteM.mutate(r.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddTemplateDialog() {
  const qc = useQueryClient();
  const addFn = useServerFn(addTemplateFromCookies);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [authuser, setAuthuser] = useState("0");
  const [cookieText, setCookieText] = useState("");
  const [notes, setNotes] = useState("");

  const m = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          label: label.trim(),
          google_email: email.trim() || null,
          auth_user_index: Number(authuser) || 0,
          cookie_text: cookieText,
          notes: notes.trim() || null,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Template added (${r.cookies_parsed} cookies).`);
      qc.invalidateQueries({ queryKey: ["fr-templates"] });
      setOpen(false);
      setLabel("");
      setEmail("");
      setAuthuser("0");
      setCookieText("");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 size-4" />
          Add from cookies.txt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add template from cookies</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Account #5 — Alice" />
            </div>
            <div>
              <Label>Google email (optional)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alice@gmail.com" />
            </div>
            <div>
              <Label>authuser index</Label>
              <Input type="number" min={0} max={9} value={authuser} onChange={(e) => setAuthuser(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                0 = the primary Google account in this cookie jar, 1/2/… = extras. Getting this wrong is the #1 cause of
                "session/token invalid" at fire time — Google routes the request to the wrong signed-in account.
              </p>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>cookies.txt</Label>
            <Input
              type="file"
              accept=".txt,text/plain"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCookieText(await f.text());
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Upload a Netscape cookies.txt export for google.com, or paste the raw Cookie header below.
            </p>
            <Textarea
              className="mt-2 font-mono text-xs"
              rows={6}
              value={cookieText}
              onChange={(e) => setCookieText(e.target.value)}
              placeholder="# Netscape HTTP Cookie File …  or  SAPISID=…; __Secure-1PAPISID=…; SID=…"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Must include <code>SAPISID</code>, <code>__Secure-1PAPISID</code>, or <code>__Secure-3PAPISID</code>.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={m.isPending || !label.trim() || !cookieText.trim()} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="mr-1 size-3 animate-spin" />}Add template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkUploadDialog() {
  const qc = useQueryClient();
  const addFn = useServerFn(addTemplatesFromCookiesBatch);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [authuser, setAuthuser] = useState("0");
  const [emailPrefix, setEmailPrefix] = useState("");
  const [tag, setTag] = useState(() => `batch-${new Date().toISOString().slice(5, 16).replace(/[-T:]/g, "")}`);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  const labels = files.map(
    (f) =>
      f.name
        .replace(/\.txt$/i, "")
        .replace(/[_-]+/g, " ")
        .trim() || f.name,
  );

  const m = useMutation({
    mutationFn: async () => {
      const items = await Promise.all(
        files.map(async (f, i) => ({
          label: labels[i],
          cookie_text: await f.text(),
        })),
      );
      const authIdx = Math.min(9, Math.max(0, Number.parseInt(authuser, 10) || 0));
      const prefix = emailPrefix.trim() || null;
      const tagVal = tag.trim();
      // Server accepts max 50 items per call — chunk larger uploads.
      const CHUNK = 50;
      const merged = {
        added: 0,
        total: items.length,
        failed: [] as { label: string; error: string }[],
        added_items: [] as unknown[],
      };
      for (let start = 0; start < items.length; start += CHUNK) {
        const slice = items.slice(start, start + CHUNK);
        setProgress({ done: merged.added, total: items.length, failed: merged.failed.length });
        const r = await addFn({
          data: {
            auth_user_index: authIdx,
            google_email_prefix: prefix,
            tag: tagVal,
            items: slice,
          },
        });
        merged.added += r.added;
        merged.failed.push(...r.failed);
        merged.added_items.push(...(r.added_items ?? []));
      }
      return merged;
    },
    onSuccess: (r) => {
      setProgress({ done: r.added, total: r.total, failed: r.failed.length });
      if (r.failed.length === 0) {
        toast.success(`Added ${r.added} template${r.added === 1 ? "" : "s"}.`);
        qc.invalidateQueries({ queryKey: ["fr-templates"] });
        setOpen(false);
        setFiles([]);
        setAuthuser("0");
        setEmailPrefix("");
        setProgress(null);
      } else {
        toast.warning(`Added ${r.added}, ${r.failed.length} failed.`);
        qc.invalidateQueries({ queryKey: ["fr-templates"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setFiles([]);
          setProgress(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 size-4" />
          Bulk upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk add templates from cookies</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>authuser index</Label>
              <Input type="number" min={0} max={9} value={authuser} onChange={(e) => setAuthuser(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                0 = the primary Google account in this cookie jar, 1/2/… = extras. Getting this wrong is the #1 cause of
                "session/token invalid" at fire time — Google routes the request to the wrong signed-in account.
              </p>
            </div>
            <div>
              <Label>Email prefix (optional)</Label>
              <Input value={emailPrefix} onChange={(e) => setEmailPrefix(e.target.value)} placeholder="robiul213" />
              <p className="mt-1 text-xs text-muted-foreground">
                If set, each template gets <code>prefix+label@gmail.com</code>.
              </p>
            </div>
          </div>
          <div>
            <Label>Tag for this upload (required)</Label>
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="batch-sep-25" maxLength={40} />
            <p className="mt-1 text-xs text-muted-foreground">
              All templates in this upload get this tag, so you can pick them by tag in orders.
            </p>
          </div>
          <div>
            <Label>cookies.txt files</Label>
            <Input
              type="file"
              accept=".txt,text/plain"
              multiple
              onChange={(e) => {
                const list = e.target.files;
                if (list) setFiles(Array.from(list));
                setProgress(null);
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Select multiple .txt exports at once. Each file becomes its own template, labeled by filename. Each must
              include <code>SAPISID</code>, <code>__Secure-1PAPISID</code>, or <code>__Secure-3PAPISID</code>.
            </p>
          </div>
          {files.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border text-xs">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-border px-2 py-1 last:border-0"
                >
                  <span className="truncate">{labels[i]}</span>
                  <span className="text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                </div>
              ))}
            </div>
          )}
          {progress && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">
                {progress.done}/{progress.total} added{progress.failed > 0 ? `, ${progress.failed} failed` : ""}.
              </p>
              {m.data?.failed && m.data.failed.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-red-600">
                  {m.data.failed.map((f: { label: string; error: string }, i: number) => (
                    <li key={i}>
                      <span className="font-medium">{f.label}:</span> {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={m.isPending || files.length === 0 || !tag.trim()} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="mr-1 size-3 animate-spin" />}
            Add {files.length || ""} template{files.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkRemoveDialog({ rows }: { rows: FakeTemplateSummary[] }) {
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteTemplatesBatch);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filterTag, setFilterTag] = useState<string>("__all__");
  const [filterStatus, setFilterStatus] = useState<string>("__all__");

  const tags = Array.from(new Set(rows.map((r) => r.tag).filter(Boolean) as string[])).sort();
  const statuses = Array.from(new Set(rows.map((r) => r.status))).sort();

  const visible = rows.filter(
    (r) =>
      (filterTag === "__all__" || r.tag === filterTag) && (filterStatus === "__all__" || r.status === filterStatus),
  );
  const visibleIds = visible.map((r) => r.id);
  const selectedCount = visibleIds.filter((id) => selected[id]).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedCount === visibleIds.length;

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const toggleAllVisible = () =>
    setSelected((s) => {
      const next = { ...s };
      for (const id of visibleIds) next[id] = !allVisibleSelected;
      return next;
    });
  const selectAllByTag = (tag: string) =>
    setSelected((s) => {
      const next = { ...s };
      for (const r of rows) if (r.tag === tag) next[r.id] = true;
      return next;
    });
  const selectAllByStatus = (status: string) =>
    setSelected((s) => {
      const next = { ...s };
      for (const r of rows) if (r.status === status) next[r.id] = true;
      return next;
    });
  const clear = () => setSelected({});

  const selectedIds = Object.keys(selected).filter((id) => selected[id] && rows.some((r) => r.id === id));

  const m = useMutation({
    mutationFn: () => deleteFn({ data: { ids: selectedIds } }),
    onSuccess: (r) => {
      toast.success(`${r.deleted} template${r.deleted === 1 ? "" : "s"} removed.`);
      qc.invalidateQueries({ queryKey: ["fr-templates"] });
      setSelected({});
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSelected({});
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Trash2 className="mr-1 size-4" />
          Bulk remove
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Remove templates</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Select templates to delete permanently. Use the filters and quick-select buttons below.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All tags</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              {tags.length > 0 && <span className="text-xs text-muted-foreground self-center">Select by tag:</span>}
              {tags.map((t) => (
                <Button key={t} size="sm" variant="outline" onClick={() => selectAllByTag(t)}>
                  {t}
                </Button>
              ))}
              {statuses.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground self-center">By status:</span>
                  {statuses.map((s) => (
                    <Button key={s} size="sm" variant="outline" onClick={() => selectAllByStatus(s)}>
                      {s}
                    </Button>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={toggleAllVisible} disabled={visibleIds.length === 0}>
              {allVisibleSelected ? "Deselect visible" : "Select visible"}
            </Button>
            <Button size="sm" variant="ghost" onClick={clear} disabled={selectedCount === 0}>
              Clear
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border text-sm">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 w-8"></th>
                  <th className="px-2 py-1">Label</th>
                  <th className="px-2 py-1">Tag</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Shots</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-2 py-1">
                      <Checkbox checked={!!selected[r.id]} onCheckedChange={() => toggle(r.id)} />
                    </td>
                    <td className="px-2 py-1 font-medium">{r.label}</td>
                    <td className="px-2 py-1">{r.tag ?? "—"}</td>
                    <td className="px-2 py-1">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-2 py-1">{r.shots_fired}</td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                      No templates match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-sm font-medium">{selectedCount} selected for deletion.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={m.isPending || selectedCount === 0}
            onClick={() => {
              if (confirm(`Delete ${selectedCount} template${selectedCount === 1 ? "" : "s"}? This cannot be undone.`))
                m.mutate();
            }}
          >
            {m.isPending && <Loader2 className="mr-1 size-3 animate-spin" />}
            Delete {selectedCount || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Orders --------------------------------- */

function OrdersTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrders);
  const cancelFn = useServerFn(cancelOrder);
  const deleteFn = useServerFn(deleteOrder);
  const q = useQuery({ queryKey: ["fr-orders"], queryFn: () => listFn() });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Cancelled");
      qc.invalidateQueries({ queryKey: ["fr-orders"] });
    },
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["fr-orders"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Each order fires N reports per template against one Google review.
        </p>
        <NewOrderDialog onCreated={() => qc.invalidateQueries({ queryKey: ["fr-orders"] })} />
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (q.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No orders yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      to="/admin/fake-reviews/$orderId"
                      params={{ orderId: o.id }}
                      className="font-medium hover:underline"
                    >
                      {o.name}
                    </Link>
                    <p className="max-w-[260px] truncate text-xs text-muted-foreground">{o.target_url}</p>
                  </td>
                  <td className="px-3 py-2 text-xs">{o.reason_code}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-emerald-700">{o.shots_ok} ok</span> ·{" "}
                    <span className="text-red-600">{o.shots_err} err</span>
                    <span className="ml-1 text-muted-foreground">/ {o.template_ids.length * o.shots_per_template}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/fake-reviews/$orderId" params={{ orderId: o.id }}>
                        Open
                      </Link>
                    </Button>
                    {o.status !== "done" && o.status !== "cancelled" ? (
                      <Button size="sm" variant="ghost" onClick={() => cancelM.mutate(o.id)}>
                        Cancel
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this order and all shots?")) deleteM.mutate(o.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewOrderDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]["key"]>("HARMFUL");
  const [shots, setShots] = useState(100);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const listFn = useServerFn(listTemplates);
  const createFn = useServerFn(createOrder);
  const templates = useQuery({ queryKey: ["fr-templates"], queryFn: () => listFn(), enabled: open });

  const createM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name,
          target_url: url,
          reason_code: reason,
          shots_per_template: shots,
          template_ids: Array.from(selected),
          note: "",
        },
      }),
    onSuccess: () => {
      toast.success("Order created");
      setOpen(false);
      setName("");
      setUrl("");
      setSelected(new Set());
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fresh = (templates.data ?? []).filter((t) => t.status === "fresh" || t.status === "stale");
  const allTags = Array.from(new Set((templates.data ?? []).map((t) => t.tag).filter((x): x is string => !!x))).sort();
  const [selTags, setSelTags] = useState<Set<string>>(new Set());
  const toggleTag = (tg: string) => {
    const n = new Set(selTags);
    if (n.has(tg)) n.delete(tg);
    else n.add(tg);
    setSelTags(n);
    setSelected(new Set(fresh.filter((t) => t.tag && n.has(t.tag)).map((t) => t.id)));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 size-4" />
          New order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New fake review order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Target business — reason" />
          </div>
          <div>
            <Label>Target review URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.google.com/maps/…/data=!…!2m5!1s…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            ...
            <div>
              <Label>Shots per template</Label>
              <Input
                type="number"
                value={shots}
                min={1}
                max={500}
                onChange={(e) => setShots(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <div>
            {allTags.length > 0 && (
              <div className="mb-3">
                <Label>Select by tag (pick one or more)</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {allTags.map((tg) => {
                    const on = selTags.has(tg);
                    const count = fresh.filter((t) => t.tag === tg).length;
                    return (
                      <Button
                        key={tg}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        onClick={() => toggleTag(tg)}
                      >
                        {tg} <span className="ml-1 opacity-70">({count})</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-2 flex items-center justify-between">
              <Label>Templates ({selected.size} selected)</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelTags(new Set());
                    setSelected(new Set(fresh.map((t) => t.id)));
                  }}
                >
                  Select fresh
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelTags(new Set());
                    setSelected(new Set());
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {(templates.data ?? []).map((t) => (
                <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={(v) => {
                      setSelected((s) => {
                        const n = new Set(s);
                        if (v) n.add(t.id);
                        else n.delete(t.id);
                        return n;
                      });
                    }}
                  />
                  <span className="flex-1 truncate">{t.label}</span>
                  {t.tag && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{t.tag}</span>}
                  <StatusBadge status={t.status} />
                </label>
              ))}
              {(templates.data ?? []).length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No templates captured.</p>
              ) : null}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!name || !url || selected.size === 0 || createM.isPending} onClick={() => createM.mutate()}>
            {createM.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Comments --------------------------------- */

function CommentsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listComments);
  const addFn = useServerFn(addComments);
  const toggleFn = useServerFn(toggleComment);
  const deleteFn = useServerFn(deleteComment);
  const deleteAllFn = useServerFn(deleteAllComments);
  const q = useQuery({ queryKey: ["fr-comments"], queryFn: () => listFn() });
  const [text, setText] = useState("");

  const addM = useMutation({
    mutationFn: () => addFn({ data: { text } }),
    onSuccess: (r) => {
      toast.success(`Added ${r.added} (skipped ${r.skipped})`);
      setText("");
      qc.invalidateQueries({ queryKey: ["fr-comments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fr-comments"] }),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fr-comments"] }),
  });
  const deleteAllM = useMutation({
    mutationFn: () => deleteAllFn({}),
    onSuccess: () => {
      toast.success("Cleared");
      qc.invalidateQueries({ queryKey: ["fr-comments"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <Label>Add comments (one per line)</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="mt-2"
          placeholder="Terrible experience.&#10;Do not trust this business.&#10;…"
        />
        <div className="mt-3 flex gap-2">
          <Button disabled={!text.trim() || addM.isPending} onClick={() => addM.mutate()}>
            {addM.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}
            Add
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Delete ALL comments?")) deleteAllM.mutate();
            }}
          >
            Delete all
          </Button>
        </div>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Comment</th>
                <th className="px-3 py-2">Used</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2">{c.text}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.times_used}</td>
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={c.active}
                      onCheckedChange={(v) => toggleM.mutate({ id: c.id, active: Boolean(v) })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => deleteM.mutate(c.id)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(q.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                    No comments yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
