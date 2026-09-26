import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Download, Inbox, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { extractLinks } from "@/components/admin/NewOrderDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPolicyOrder, deletePolicyOrder, listPolicyOrders } from "@/lib/policy.functions";

export const Route = createFileRoute("/admin/policy/")({
  head: () => ({ meta: [
    { title: "Policy Violation — People Opinion Box" },
    { name: "description", content: "Review policy analysis and legal report workspace." },
    { property: "og:title", content: "Policy Violation — People Opinion Box" },
    { property: "og:description", content: "Review policy analysis and legal report workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PolicyOrdersPage,
});

function PolicyOrdersPage() {
  const load = useServerFn(listPolicyOrders);
  const remove = useServerFn(deletePolicyOrder);
  const orders = useQuery({ queryKey: ["policy-orders"], queryFn: () => load() });
  const [open, setOpen] = useState(false);

  const downloadExtension = async () => {
    try {
      const response = await fetch("/policy-violation-extension.zip");
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "policy-violation-extension.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { toast.error((error as Error).message); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <AdminPageHeader
        eyebrow="Tool"
        title="Policy violation"
        description="Fetch reviews, let the AI find the ones that break Google's policies, then generate report text."
        actions={
          <>
            <Button variant="outline" className="rounded-full" onClick={downloadExtension}>
              <Download className="mr-2 size-4" /> Download extension
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/admin/policy/training">
                <BookOpen className="mr-2 size-4" /> Training data
              </Link>
            </Button>
            <Button className="rounded-full" onClick={() => setOpen(true)}>
              <Plus className="mr-2 size-4" /> New order
            </Button>
          </>
        }
      />

      <p className="text-xs text-muted-foreground">The extension uses the same API key as the DMCA extension. Add your legal name, country, and 2Captcha key in its Settings page.</p>

      {orders.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orders.error ? (
        <p className="text-sm text-destructive">{(orders.error as Error).message}</p>
      ) : (orders.data ?? []).length === 0 ? (
        <div className="press-panel flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No orders yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.data!.map((o) => {
            const pct = o.total ? Math.round((o.fetched / o.total) * 100) : 0;
            return (
              <div key={o.id} className="press-panel flex flex-col gap-4 p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg text-foreground">{o.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Created {new Date(o.created_at).toLocaleDateString()}
                      {o.note ? ` · ${o.note}` : ""}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete order"
                    onClick={async () => {
                      if (!window.confirm(`Delete "${o.name}"?`)) return;
                      await remove({ data: { id: o.id } });
                      orders.refetch();
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {o.fetched} of {o.total} fetched · {pct}%
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="pill">{o.checked} checked</span>
                  <span className="pill border-destructive/30 text-destructive">{o.violations} violate</span>
                  <span className="pill">{o.reports} reports</span>
                </div>
                <Button asChild variant="outline" className="w-full rounded-full">
                  <Link to="/admin/policy/$orderId" params={{ orderId: o.id }}>
                    Open order <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <NewPolicyOrderDialog open={open} onOpenChange={setOpen} onCreated={() => orders.refetch()} />
    </div>
  );
}

function NewPolicyOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const navigate = useNavigate();
  const create = useServerFn(createPolicyOrder);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [urls, setUrls] = useState("");
  const [saving, setSaving] = useState(false);
  const detected = useMemo(() => extractLinks(urls), [urls]);

  const submit = async () => {
    if (name.trim().length < 2) { toast.error("Give the order a name."); return; }
    if (!detected.length) { toast.error("Add at least one review link."); return; }
    setSaving(true);
    try {
      const r = await create({ data: { name: name.trim(), note: note.trim(), links: detected } });
      toast.success(`Order created with ${r.added} link${r.added === 1 ? "" : "s"}`);
      onCreated();
      onOpenChange(false);
      setName("");
      setNote("");
      setUrls("");
      navigate({ to: "/admin/policy/$orderId", params: { orderId: r.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New policy order</DialogTitle>
          <DialogDescription>Paste review links or upload a CSV.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-name">Order name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="September check" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-note">Note (optional)</Label>
            <Input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="p-urls">Review URLs (one per line)</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 size-3.5" /> Upload CSV
              </Button>
            </div>
            <Textarea
              id="p-urls"
              rows={7}
              className="font-mono text-xs"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={"https://maps.app.goo.gl/…"}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const t = await f.text();
                setUrls((c) => (c ? `${c}\n${t}` : t));
              }}
            />
            <p className="text-xs text-muted-foreground">{detected.length} valid review URLs detected.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={submit}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
