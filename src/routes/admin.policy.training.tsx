import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteTraining, listTraining, saveTraining } from "@/lib/policy.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/policy/training")({
  component: TrainingPage,
});

type Kind = "rule" | "example" | "report";
const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "rule", label: "Policy rules", hint: "What counts as a violation, one rule or category per entry." },
  { key: "example", label: "Example reviews", hint: "Real reviews labelled as violating or clean." },
  { key: "report", label: "Example reports", hint: "Report texts written in the style you want." },
];

function TrainingPage() {
  const load = useServerFn(listTraining);
  const save = useServerFn(saveTraining);
  const del = useServerFn(deleteTraining);
  const q = useQuery({ queryKey: ["policy-training"], queryFn: () => load() });
  const [kind, setKind] = useState<Kind>("rule");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [body, setBody] = useState("");
  const [label, setLabel] = useState<"violates" | "clean">("violates");

  const add = async () => {
    if (!body.trim()) { toast.error("Write something first."); return; }
    try {
      await save({ data: { kind, title, code, source_url: sourceUrl, body: body.trim(), label: kind === "example" ? label : null } });
      setTitle("");
      setBody("");
      q.refetch();
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const entries = (q.data ?? []).filter((e) => e.kind === kind);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <Link to="/admin/policy" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 size-4" /> Policy orders
      </Link>
      <AdminPageHeader
        eyebrow="Policy violation"
        title="Training data"
        description="Everything here is given to the AI on every check and report. Changes apply immediately."
      />
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k.key} onClick={() => setKind(k.key)} className={cn("pill", kind === k.key && "border-primary bg-primary text-primary-foreground")}>
            {k.label} ({(q.data ?? []).filter((e) => e.kind === k.key).length})
          </button>
        ))}
      </div>
      <div className="press-panel space-y-3 p-5">
        <p className="text-xs text-muted-foreground">{KINDS.find((k) => k.key === kind)!.hint}</p>
        <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Tag code, e.g. PROFANITY" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input placeholder="Policy link (optional)" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </div>
        {kind === "example" ? (
          <div className="flex gap-2">
            {(["violates", "clean"] as const).map((l) => (
              <button key={l} onClick={() => setLabel(l)} className={cn("pill capitalize", label === l && "border-primary bg-primary text-primary-foreground")}>
                {l}
              </button>
            ))}
          </div>
        ) : null}
        <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste text here" />
        <Button onClick={add}>Add</Button>
      </div>
      <div className="space-y-3">
        {entries.map((e) => (
          <div key={e.id} className="press-panel p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {e.code ? <span className="pill mr-2 font-mono">{e.code}</span> : null}{e.title || "Untitled"} {e.label ? <span className="pill ml-2 capitalize">{e.label}</span> : null}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{e.body}</p>
              </div>
              <button aria-label="Delete" onClick={async () => { await del({ data: { id: e.id } }); q.refetch(); }}>
                <Trash2 className="size-4 text-destructive" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
