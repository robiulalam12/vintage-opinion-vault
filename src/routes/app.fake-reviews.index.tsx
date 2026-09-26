import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import {
  listMyOrders,
  createMyOrder,
  cancelMyOrder,
  deleteMyOrder,
  myFakeOverview,
  listSharedTemplates,
  listSharedComments,
  addSharedComments,
  addMyTemplatesFromCookiesBatch,
  deleteMyTemplatesBatch,
  deleteMyComment,
} from "@/lib/user-fake-reviews.functions";

export const Route = createFileRoute("/app/fake-reviews/")({
  head: () => ({
    meta: [
      { title: "Fake reviews — My dashboard" },
      { name: "description", content: "Your fake review orders." },
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

const COMMENT_TAGS = [
  { key: "", label: "Any comment" },
  { key: "policy_violation", label: "Policy violation" },
  { key: "pii", label: "PII" },
  { key: "phone_leak", label: "Phone leak" },
  { key: "cyberbullying", label: "Cyberbullying" },
  { key: "doxxing", label: "Doxxing" },
  { key: "extortion", label: "Extortion" },
  { key: "competitor_attack", label: "Competitor attack" },
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
    paused: "bg-amber-100 text-amber-800",
  };
  if (status?.startsWith("drip:")) {
    return (
      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
        drip-feed
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-slate-200 text-slate-700"}`}
    >
      {status}
    </span>
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

function FakeReviewsPage() {
  const overviewFn = useServerFn(myFakeOverview);
  const overview = useQuery({ queryKey: ["u-fr-overview"], queryFn: () => overviewFn() });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 lg:px-8">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-foreground">Fake reviews</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Your private workspace. Upload your own Google account cookies, write your own comments, and fire orders — nothing here is shared with other users.
        </p>
      </header>

      {overview.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            label="Your fresh accounts"
            value={overview.data.templates.fresh}
            sub={`${overview.data.templates.total} you uploaded`}
          />
          <Kpi
            label="Your orders firing"
            value={overview.data.orders.firing}
            sub={`${overview.data.orders.done} done`}
          />
          <Kpi
            label="Shots (24h)"
            value={overview.data.shots.last24}
            sub={`${overview.data.shots.total} all-time`}
          />
          <Kpi
            label="Success"
            value={overview.data.shots.ok}
            sub={`${overview.data.shots.err} errors`}
          />
        </div>
      ) : null}

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">My orders</TabsTrigger>
          <TabsTrigger value="accounts">My accounts</TabsTrigger>
          <TabsTrigger value="comments">My comments</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4">
          <OrdersTab />
        </TabsContent>
        <TabsContent value="accounts" className="mt-4">
          <AccountsTab />
        </TabsContent>
        <TabsContent value="comments" className="mt-4">
          <CommentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------------- Orders -------------------------------- */

function OrdersTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyOrders);
  const cancelFn = useServerFn(cancelMyOrder);
  const deleteFn = useServerFn(deleteMyOrder);
  const q = useQuery({ queryKey: ["u-fr-orders"], queryFn: () => listFn() });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Cancelled");
      qc.invalidateQueries({ queryKey: ["u-fr-orders"] });
    },
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["u-fr-orders"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Each order fires N reports per account against one Google review.
        </p>
        <NewOrderDialog onCreated={() => qc.invalidateQueries({ queryKey: ["u-fr-orders"] })} />
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (q.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No orders yet. Click <strong>New order</strong> to start.
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
                      to="/app/fake-reviews/$orderId"
                      params={{ orderId: o.id }}
                      className="font-medium hover:underline"
                    >
                      {o.name}
                    </Link>
                    <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                      {o.target_url}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs">{o.reason_code}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-emerald-700">{o.shots_ok} ok</span> ·{" "}
                    <span className="text-red-600">{o.shots_err} err</span>
                    <span className="ml-1 text-muted-foreground">
                      / {o.template_ids.length * o.shots_per_template}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/app/fake-reviews/$orderId" params={{ orderId: o.id }}>
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
  const [selTags, setSelTags] = useState<Set<string>>(new Set());

  const listFn = useServerFn(listSharedTemplates);
  const createFn = useServerFn(createMyOrder);
  const templates = useQuery({
    queryKey: ["u-fr-templates"],
    queryFn: () => listFn(),
    enabled: open,
  });

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
      setSelTags(new Set());
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fresh = (templates.data ?? []).filter(
    (t) => t.status === "fresh" || t.status === "stale",
  );
  const allTags = Array.from(
    new Set((templates.data ?? []).map((t) => t.tag).filter((x): x is string => !!x)),
  ).sort();

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
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Target business — reason"
            />
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
              <Label>Shots per account</Label>
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
              <Label>Accounts ({selected.size} selected)</Label>
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
                <label
                  key={t.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                >
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
                  {t.tag && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{t.tag}</span>
                  )}
                  <StatusBadge status={t.status} />
                </label>
              ))}
              {(templates.data ?? []).length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  You haven't uploaded any accounts yet. Close this and open the <strong>My accounts</strong> tab to upload cookies.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name || !url || selected.size === 0 || createM.isPending}
            onClick={() => createM.mutate()}
          >
            {createM.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Accounts (RO) ------------------------------ */

function AccountsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSharedTemplates);
  const delFn = useServerFn(deleteMyTemplatesBatch);
  const q = useQuery({ queryKey: ["u-fr-templates"], queryFn: () => listFn() });
  const [sel, setSel] = useState<Set<string>>(new Set());

  const delM = useMutation({
    mutationFn: (ids: string[]) => delFn({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`Removed ${r.deleted}`);
      setSel(new Set());
      qc.invalidateQueries({ queryKey: ["u-fr-templates"] });
      qc.invalidateQueries({ queryKey: ["u-fr-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Your own Google account pool. Only you can see or use these — every other user has their own separate pool.
        </p>
        <div className="flex gap-2">
          {sel.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirm(`Remove ${sel.size} account(s)?`)) delM.mutate(Array.from(sel));
              }}
            >
              <Trash2 className="mr-1 size-3" />
              Remove {sel.size}
            </Button>
          )}
          <UploadCookiesDialog
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["u-fr-templates"] });
              qc.invalidateQueries({ queryKey: ["u-fr-overview"] });
            }}
          />
        </div>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Tag</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Shots fired</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={sel.has(r.id)}
                      onCheckedChange={(v) => {
                        setSel((s) => {
                          const n = new Set(s);
                          if (v) n.add(r.id);
                          else n.delete(r.id);
                          return n;
                        });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2">
                    {r.tag ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.tag}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2">{r.shots_fired}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                    You haven't uploaded any accounts yet. Click <strong>Upload cookies</strong> to add your first.
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

function UploadCookiesDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState(
    () => `batch-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`,
  );
  const [authUser, setAuthUser] = useState(0);
  const [emailPrefix, setEmailPrefix] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{
    running: boolean;
    added: number;
    failed: { label: string; error: string }[];
    doneBatches: number;
    totalBatches: number;
  }>({ running: false, added: 0, failed: [], doneBatches: 0, totalBatches: 0 });

  const uploadFn = useServerFn(addMyTemplatesFromCookiesBatch);

  const run = async () => {
    if (!files.length || !tag.trim()) return;
    const readAll = await Promise.all(
      files.map(async (f) => ({
        label: f.name.replace(/\.(txt|json)$/i, "").slice(0, 120),
        cookie_text: await f.text(),
      })),
    );
    const batches: (typeof readAll)[] = [];
    for (let i = 0; i < readAll.length; i += 50) batches.push(readAll.slice(i, i + 50));
    setProgress({ running: true, added: 0, failed: [], doneBatches: 0, totalBatches: batches.length });
    for (let i = 0; i < batches.length; i++) {
      try {
        const r = await uploadFn({
          data: {
            tag: tag.trim(),
            auth_user_index: Math.max(0, Math.min(9, authUser)),
            google_email_prefix: emailPrefix.trim() || null,
            items: batches[i]!,
          },
        });
        setProgress((p) => ({
          ...p,
          added: p.added + r.added,
          failed: [...p.failed, ...r.failed],
          doneBatches: i + 1,
        }));
      } catch (e: any) {
        toast.error(e.message);
        setProgress((p) => ({ ...p, running: false }));
        return;
      }
    }
    setProgress((p) => ({ ...p, running: false }));
    toast.success("Upload complete");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="mr-1 size-3" />
          Upload cookies
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload account cookies</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tag (groups this batch)</Label>
            <Input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>authuser index (0–9)</Label>
              <Input
                type="number"
                min={0}
                max={9}
                value={authUser}
                onChange={(e) => setAuthUser(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Email prefix (optional)</Label>
              <Input
                value={emailPrefix}
                onChange={(e) => setEmailPrefix(e.target.value)}
                placeholder="myname"
              />
            </div>
          </div>
          <div>
            <Label>Cookie files (.txt or .json — pick many)</Label>
            <Input
              type="file"
              multiple
              accept=".txt,.json"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <p className="mt-1 text-xs text-muted-foreground">{files.length} file(s) selected</p>
          </div>
          {progress.totalBatches > 0 && (
            <div className="rounded-lg border border-border p-3 text-xs">
              <p>
                Batches {progress.doneBatches}/{progress.totalBatches} · Added {progress.added} · Failed {progress.failed.length}
              </p>
              {progress.failed.length > 0 && (
                <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-4">
                  {progress.failed.slice(0, 20).map((f, i) => (
                    <li key={i}>
                      <strong>{f.label}</strong>: {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={progress.running}>
            Close
          </Button>
          <Button disabled={!files.length || !tag.trim() || progress.running} onClick={run}>
            {progress.running ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Upload {files.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Comments ------------------------------- */

function CommentsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSharedComments);
  const addFn = useServerFn(addSharedComments);
  const delFn = useServerFn(deleteMyComment);
  const q = useQuery({ queryKey: ["u-fr-comments"], queryFn: () => listFn() });
  const [text, setText] = useState("");

  const addM = useMutation({
    mutationFn: () => addFn({ data: { text } }),
    onSuccess: (r) => {
      toast.success(`Added ${r.added} (skipped ${r.skipped})`);
      setText("");
      qc.invalidateQueries({ queryKey: ["u-fr-comments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["u-fr-comments"] });
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
          placeholder={"Terrible experience.\nDo not trust this business.\n…"}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Your private comment pool — picked randomly per shot on your orders. Duplicates in your own list are skipped.
        </p>
        <div className="mt-3">
          <Button disabled={!text.trim() || addM.isPending} onClick={() => addM.mutate()}>
            {addM.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Plus className="mr-1 size-4" />
            )}
            Add
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
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2">{c.text}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.times_used}</td>
                  <td className="px-3 py-2 text-xs">{c.active ? "yes" : "no"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Remove this comment?")) delM.mutate(c.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(q.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                    You haven't added any comments yet.
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
