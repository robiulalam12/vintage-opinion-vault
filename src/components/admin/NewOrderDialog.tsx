import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
import { createReviewOrder } from "@/lib/reviews.functions";
import { listDmcaTemplates } from "@/lib/dmca-templates.functions";
import { useQuery } from "@tanstack/react-query";

/** Pulls every http(s) link out of pasted text or CSV rows, with a label. */
export function extractLinks(raw: string): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/https?:\/\/[^\s",]+/);
    if (!match) continue;
    const url = match[0].replace(/[),.;]+$/, "");
    const label = line
      .replace(match[0], "")
      .replace(/[,"]+/g, " ")
      .trim()
      .slice(0, 120);
    out.push({ url, label });
  }
  return out;
}

export function NewOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const navigate = useNavigate();
  const createOrder = useServerFn(createReviewOrder);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [reviewerKey, setReviewerKey] = useState<"robiul" | "jonas" | "benedikt">("robiul");
  const [urls, setUrls] = useState("");
  const [templateId, setTemplateId] = useState<string>("none");
  const loadTemplates = useServerFn(listDmcaTemplates);
  const templates = useQuery({ queryKey: ["dmca-templates"], queryFn: () => loadTemplates(), enabled: open });
  const [saving, setSaving] = useState(false);

  const detected = useMemo(() => extractLinks(urls), [urls]);

  const submit = async () => {
    if (name.trim().length < 2) {
      toast.error("Give the order a name.");
      return;
    }
    setSaving(true);
    try {
      const result = await createOrder({
        data: { name: name.trim(), note: note.trim(), reviewerKey, templateId: templateId === "none" ? null : templateId, links: detected },
      });
      toast.success(
        `Order created with ${result.added} review link${result.added === 1 ? "" : "s"}` +
          (result.skipped ? ` · ${result.skipped} duplicate link${result.skipped === 1 ? "" : "s"} skipped` : ""),
      );
      onCreated();
      onOpenChange(false);
      setName("");
      setNote("");
      setUrls("");
      navigate({ to: "/admin/orders/$orderId", params: { orderId: result.id } });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New tracking order</DialogTitle>
          <DialogDescription>
            Name the batch, then paste review links or upload a CSV. Text is fetched afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="order-reviewer">Reviewer profile</Label>
            <Select value={reviewerKey} onValueChange={(v) => setReviewerKey(v as "robiul" | "jonas" | "benedikt")}>
              <SelectTrigger id="order-reviewer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="robiul">Robiul Alam — /robiul-alam</SelectItem>
                <SelectItem value="jonas">Jonas Weber — /Jonas-Weber</SelectItem>
                <SelectItem value="benedikt">Benedikt Herrmann — /Benedikt-Herrmann</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Every review in this order is published on this profile, dated 3–6 months before its Google review.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-template">DMCA copy template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="order-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {(templates.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-name">Order name</Label>
            <Input
              id="order-name"
              placeholder="August batch"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-note">Note (optional)</Label>
            <Input
              id="order-note"
              placeholder="Where these links came from"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <Label htmlFor="order-urls" className="min-w-0">
                Review URLs (one per line)
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-2 size-3.5" /> Upload CSV
              </Button>
            </div>
            <Textarea
              id="order-urls"
              rows={7}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder={"https://maps.app.goo.gl/…\nhttps://maps.app.goo.gl/…"}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setUrls((current) => (current ? `${current}\n${text}` : text));
                toast.success(`Loaded ${file.name}`);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {detected.length} valid review URL{detected.length === 1 ? "" : "s"} detected. Single-review
              share links work best — place or profile links carry no review id.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={submit}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
