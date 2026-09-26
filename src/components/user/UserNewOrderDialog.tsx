import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { extractLinks } from "@/components/admin/NewOrderDialog";
import { createMyReviewOrder, listMyOrderTemplates } from "@/lib/user-review-orders.functions";
import { listMyReviewerProfiles } from "@/lib/user-reviewer-profiles.functions";

export function UserNewOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const navigate = useNavigate();
  const createOrder = useServerFn(createMyReviewOrder);
  const loadTemplates = useServerFn(listMyOrderTemplates);
  const loadProfiles = useServerFn(listMyReviewerProfiles);
  const templates = useQuery({ queryKey: ["my-order-templates"], queryFn: () => loadTemplates(), enabled: open });
  const profiles = useQuery({ queryKey: ["my-reviewer-profiles"], queryFn: () => loadProfiles(), enabled: open });

  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [profileId, setProfileId] = useState<string>("none");
  const [templateId, setTemplateId] = useState<string>("none");
  const [urls, setUrls] = useState("");
  const [saving, setSaving] = useState(false);

  const detected = useMemo(() => extractLinks(urls), [urls]);

  const submit = async () => {
    if (name.trim().length < 2) {
      toast.error("Give the order a name.");
      return;
    }
    setSaving(true);
    try {
      const r = await createOrder({
        data: {
          name: name.trim(),
          note: note.trim(),
          reviewerProfileId: profileId === "none" ? null : profileId,
          templateId: templateId === "none" ? null : templateId,
          links: detected,
        },
      });
      toast.success(`Order created with ${r.added} link${r.added === 1 ? "" : "s"}` + (r.skipped ? ` · ${r.skipped} skipped` : ""));
      onCreated();
      onOpenChange(false);
      setName(""); setNote(""); setUrls("");
      navigate({ to: "/app/orders/$orderId", params: { orderId: r.id } });
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
          <DialogTitle>New review order</DialogTitle>
          <DialogDescription>
            Name the batch, pick your reviewer profile, then paste review links or upload a CSV.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reviewer profile</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue placeholder="Choose profile" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {(profiles.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} (/{p.slug})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Every review in this order is published on this profile, dated a few months before its Google review.
            </p>
          </div>

          <div className="space-y-2">
            <Label>DMCA copy template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {(templates.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-order-name">Order name</Label>
            <Input id="user-order-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="August batch" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-order-note">Note (optional)</Label>
            <Input id="user-order-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <Label htmlFor="user-order-urls">Review URLs (one per line)</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 size-3.5" /> Upload CSV
              </Button>
            </div>
            <Textarea
              id="user-order-urls"
              rows={7}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder={"https://maps.app.goo.gl/…"}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
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
                toast.success(`Loaded ${f.name}`);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {detected.length} valid review URL{detected.length === 1 ? "" : "s"} detected.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={saving} onClick={submit}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
