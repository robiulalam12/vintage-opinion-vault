import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { renderTemplate, type TemplateSource } from "@/lib/dmca-template";
import { setSourceArchive, type DmcaTemplate } from "@/lib/dmca-templates.functions";

export function TemplateNoticeBox({
  source,
  template,
  ourReviewUrl,
  preferOurUrl = false,
  ourPublishDate,
  ourReviewerName,
  onSaved,
}: {
  source: TemplateSource & { id: string };
  template: DmcaTemplate;
  ourReviewUrl: string | null;
  /** Drive mode: cite ourReviewUrl even when an archive link is saved. */
  preferOurUrl?: boolean;
  ourPublishDate: string | null;
  ourReviewerName: string | null;
  onSaved: () => void;
}) {
  const save = useServerFn(setSourceArchive);
  const [archiveUrl, setArchiveUrl] = useState(source.archive_url ?? "");
  const [archiveDate, setArchiveDate] = useState(source.archive_date ?? "");
  const [saving, setSaving] = useState(false);

  const { text, missing } = renderTemplate(template.body, {
    ...source,
    archive_url: preferOurUrl && ourReviewUrl ? ourReviewUrl : archiveUrl || null,
    archive_date: archiveDate || null,
    our_review_url: ourReviewUrl,
    our_publish_date: ourPublishDate,
    our_reviewer_name: ourReviewerName,
  });
  const ready = missing.length === 0;

  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-accent px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-accent-foreground">
          <FileText className="size-3" /> {template.name}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={!ready}
          onClick={() => {
            void navigator.clipboard.writeText(text);
            toast.success("Notice copied");
          }}
        >
          <Copy className="mr-1 size-3" /> Copy notice
        </Button>
      </div>

      <div className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
        <Input
          placeholder="Our review page link is used automatically — optional archive link here later"
          value={archiveUrl}
          onChange={(e) => setArchiveUrl(e.target.value)}
          className="text-xs"
        />
        <Input type="date" value={archiveDate} onChange={(e) => setArchiveDate(e.target.value)} className="text-xs" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await save({ data: { id: source.id, archiveUrl, archiveDate } });
              toast.success("Link saved");
              onSaved();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save link"}
        </Button>
      </div>

      <Textarea readOnly rows={6} value={text} className="resize-y bg-muted/40 text-xs leading-relaxed" />
      {!ready ? (
        <p className="mt-1.5 text-[0.7rem] text-destructive">
          {missing.length > 0 ? `Missing: ${missing.join(", ")}` : null}
        </p>
      ) : null}
    </div>
  );
}
