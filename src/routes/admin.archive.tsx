import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { Database, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { parseArchiveCsv, type ParsedArchiveRow } from "@/lib/csv";
import {
  deleteOldSiteReview,
  importOldSiteReviews,
  listOldSiteReviews,
} from "@/lib/archive.functions";

export const Route = createFileRoute("/admin/archive")({
  component: ArchivePage,
});

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "—" : DATE.format(d);
}

const SAMPLE = `name,date,review text,business name
Sarah Whitfield,2013-04-18,"Excellent service from start to finish, would use again.",MC Law Firm
James Porter,2014-11-02,"Booked a last minute repair and they turned up the same day.",Greenfield Auto Care`;

function ArchivePage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");

  const list = useServerFn(listOldSiteReviews);
  const importRows = useServerFn(importOldSiteReviews);
  const removeRow = useServerFn(deleteOldSiteReview);

  const query = useQuery({ queryKey: ["old-site-reviews"], queryFn: () => list() });

  const parsed = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      return parseArchiveCsv(raw);
    } catch {
      return null;
    }
  }, [raw]);

  const importMutation = useMutation({
    mutationFn: (rows: ParsedArchiveRow[]) => importRows({ data: { rows } }),
    onSuccess: (result) => {
      toast.success(`Imported ${result.inserted} review${result.inserted === 1 ? "" : "s"}.`);
      setRaw("");
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["old-site-reviews"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeRow({ data: { id } }),
    onSuccess: () => {
      toast.success("Row removed.");
      queryClient.invalidateQueries({ queryKey: ["old-site-reviews"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onFile = async (file: File) => {
    const text = await file.text();
    setRaw(text);
  };

  return (
    <div className="space-y-6">
      <section className="press-panel p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
            <Database className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-xl text-foreground">Old website reviews</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload the reviews from the old People Opinion Box database as a CSV file with the
              columns <strong>name</strong>, <strong>date</strong>, <strong>review text</strong> and{" "}
              <strong>business name</strong>. A header row is detected automatically; without one the
              columns are read in that order.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 size-4" /> Choose CSV file
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRaw(SAMPLE)}>
            Load example
          </Button>
          {raw ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRaw("");
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        <textarea
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={SAMPLE}
          className="mt-4 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground"
        />

        {parsed ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{parsed.rows.length}</strong> review
              {parsed.rows.length === 1 ? "" : "s"} ready to import
              {parsed.skipped > 0 ? ` · ${parsed.skipped} row(s) skipped (missing name or text)` : ""}
              {parsed.headerUsed ? " · header row detected" : " · no header row, using column order"}
            </p>

            {parsed.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Business</th>
                      <th className="px-3 py-2 font-semibold">Review text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, index) => (
                      <tr key={index} className="border-t border-border">
                        <td className="px-3 py-2">{row.reviewer_name}</td>
                        <td className="px-3 py-2">{formatDate(row.review_date)}</td>
                        <td className="px-3 py-2">{row.business_name ?? "—"}</td>
                        <td className="max-w-md truncate px-3 py-2">{row.review_text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > 5 ? (
                  <p className="border-t border-border px-3 py-2 text-[0.7rem] text-muted-foreground">
                    Showing the first 5 of {parsed.rows.length} rows.
                  </p>
                ) : null}
              </div>
            ) : null}

            <Button
              type="button"
              disabled={parsed.rows.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate(parsed.rows)}
            >
              {importMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              Import {parsed.rows.length} review{parsed.rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="press-panel p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg text-foreground">Imported archive</h3>
          <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
            {query.data?.total ?? 0} rows
          </span>
        </div>

        {query.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p className="mt-4 text-sm text-destructive">{(query.error as Error).message}</p>
        ) : (query.data?.rows.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nothing imported yet. Upload a CSV above to load the old database.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Business</th>
                  <th className="px-3 py-2 font-semibold">Review text</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {query.data!.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{row.reviewer_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.review_date)}</td>
                    <td className="px-3 py-2">{row.business_name ?? "—"}</td>
                    <td className="max-w-lg px-3 py-2">{row.review_text}</td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(row.id)}
                        aria-label="Delete row"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(query.data?.total ?? 0) > query.data!.rows.length ? (
              <p className="border-t border-border px-3 py-2 text-[0.7rem] text-muted-foreground">
                Showing the {query.data!.rows.length} most recent rows.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
