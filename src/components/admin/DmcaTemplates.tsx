import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_FIELDS } from "@/lib/dmca-template";
import {
  deleteDmcaTemplate,
  listDmcaTemplates,
  saveDmcaTemplate,
  type DmcaTemplate,
} from "@/lib/dmca-templates.functions";

export function DmcaTemplates() {
  const qc = useQueryClient();
  const load = useServerFn(listDmcaTemplates);
  const save = useServerFn(saveDmcaTemplate);
  const remove = useServerFn(deleteDmcaTemplate);
  const templates = useQuery({ queryKey: ["dmca-templates"], queryFn: () => load() });

  const [editing, setEditing] = useState<DmcaTemplate | null>(null);
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
      await save({ data: { id: editing?.id, name, body } });
      toast.success(editing ? "Template updated" : "Template saved");
      reset();
      void qc.invalidateQueries({ queryKey: ["dmca-templates"] });
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
          <FileText className="size-4 text-primary" /> DMCA copy templates
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Write your own notice text and insert fill-in fields. Pick a template when you create an
          order. Notices only fill in true details: the Google review and your archived proof.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
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
            placeholder="Paste or write your notice copy, then click a field above to insert it at the cursor."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button type="button" disabled={saving || name.trim().length < 2 || body.trim().length < 10} onClick={submit}>
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
            Saved templates
          </p>
          {templates.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (templates.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            (templates.data ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="min-w-0 truncate text-sm">{t.name}</span>
                <div className="flex shrink-0">
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
                        void qc.invalidateQueries({ queryKey: ["dmca-templates"] });
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
