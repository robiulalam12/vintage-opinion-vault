import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkKey, json, preflight } from "@/lib/dmca.server";

const input = z.object({
  reportId: z.string().uuid(),
  reason: z.enum(["released", "skipped", "failed"]).optional().default("released"),
  error: z.string().trim().max(500).optional().default(""),
});

export const Route = createFileRoute("/api/public/dmca/release-single")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        if (!checkKey(request)) return json({ error: "Unauthorized" }, 401);

        let parsed: z.infer<typeof input>;
        try {
          parsed = input.parse(await request.json());
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: report, error: readError } = await supabaseAdmin
          .from("dmca_reports")
          .select("id, status, review_source_id")
          .eq("id", parsed.reportId)
          .single();
        if (readError) return json({ error: readError.message }, 404);
        if (report.status === "submitted") {
          return json({ error: "This report was already submitted to Google." }, 409);
        }

        // "skipped" keeps the link out of the pool; "released"/"failed" return it.
        const keepClaimed = parsed.reason === "skipped";

        if (report.review_source_id && !keepClaimed) {
          const { error: sourceError } = await supabaseAdmin
            .from("review_sources")
            .update({ dmca_report_id: null })
            .eq("id", report.review_source_id)
            .is("dmca_reported_at", null);
          if (sourceError) return json({ error: sourceError.message }, 500);
        }

        const { error } = await supabaseAdmin
          .from("dmca_reports")
          .update({
            status: parsed.reason === "skipped" ? "skipped" : parsed.reason,
            error: parsed.error || null,
          })
          .eq("id", parsed.reportId);
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, status: parsed.reason, returnedToPool: !keepClaimed });
      },
    },
  },
});
