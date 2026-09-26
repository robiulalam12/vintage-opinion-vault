import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkKey, json, preflight, randomDelaySeconds } from "@/lib/dmca.server";

const input = z.object({
  reportId: z.string().uuid(),
  caseRef: z.string().trim().max(200).optional().default(""),
});

export const Route = createFileRoute("/api/public/dmca/confirm-single")({
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
        const now = new Date().toISOString();

        const { data: report, error: readError } = await supabaseAdmin
          .from("dmca_reports")
          .select("id, review_source_id, order_id")
          .eq("id", parsed.reportId)
          .single();
        if (readError) return json({ error: readError.message }, 404);

        const { error: updateError } = await supabaseAdmin
          .from("dmca_reports")
          .update({
            status: "submitted",
            submitted_at: now,
            case_ref: parsed.caseRef || null,
            error: null,
          })
          .eq("id", parsed.reportId);
        if (updateError) return json({ error: updateError.message }, 500);

        if (report.review_source_id) {
          const { error: sourceError } = await supabaseAdmin
            .from("review_sources")
            .update({ dmca_reported_at: now })
            .eq("id", report.review_source_id);
          if (sourceError) return json({ error: sourceError.message }, 500);
        }

        // Schedule the next allowed report for this order (random within its delay range).
        let nextDelaySeconds = 0;
        if (report.order_id) {
          const { data: order } = await supabaseAdmin
            .from("review_orders")
            .select("dmca_delay_min_seconds, dmca_delay_max_seconds")
            .eq("id", report.order_id)
            .maybeSingle();
          nextDelaySeconds = randomDelaySeconds(
            order?.dmca_delay_min_seconds ?? 0,
            order?.dmca_delay_max_seconds ?? 0,
          );
          await supabaseAdmin
            .from("review_orders")
            .update({
              dmca_next_allowed_at: nextDelaySeconds
                ? new Date(Date.now() + nextDelaySeconds * 1000).toISOString()
                : null,
            })
            .eq("id", report.order_id);
        }



        // Remaining = every eligible review not yet reported, including claimed ones,
        // so a run never declares itself complete while links are still unsent.
        let remaining = 0;
        if (report.order_id) {
          const { data: pool } = await supabaseAdmin
            .from("review_sources")
            .select("id, review_text, published_review_id, published_profile_review_id, dmca_report_id, dmca_reported_at")
            .eq("order_id", report.order_id);
          remaining = (pool ?? []).filter(
            (r) =>
              (r.published_review_id || r.published_profile_review_id) &&
              (r.review_text ?? "").trim().length > 0 &&
              !r.dmca_reported_at,
          ).length;
        }

        return json({ ok: true, reported: 1, remaining });
      },
    },
  },
});
