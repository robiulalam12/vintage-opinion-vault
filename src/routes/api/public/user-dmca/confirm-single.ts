import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { json, preflight, randomDelaySeconds, resolveOwner } from "@/lib/user-dmca.server";

const input = z.object({
  reportId: z.string().uuid(),
  caseRef: z.string().trim().max(200).optional().default(""),
});

export const Route = createFileRoute("/api/public/user-dmca/confirm-single")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const auth = await resolveOwner(request);
        if ("error" in auth) return auth.error;

        let parsed: z.infer<typeof input>;
        try {
          parsed = input.parse(await request.json());
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();

        const { data: report, error: rErr } = await supabaseAdmin
          .from("user_dmca_reports")
          .select("id, source_id, order_id")
          .eq("id", parsed.reportId)
          .eq("owner_id", auth.ownerId)
          .maybeSingle();
        if (rErr) return json({ error: rErr.message }, 500);
        if (!report) return json({ error: "Report not found." }, 404);

        const { error: uErr } = await supabaseAdmin
          .from("user_dmca_reports")
          .update({
            status: "submitted",
            submitted_at: now,
            case_ref: parsed.caseRef || null,
            error: null,
          })
          .eq("id", parsed.reportId);
        if (uErr) return json({ error: uErr.message }, 500);

        if (report.source_id) {
          await supabaseAdmin
            .from("user_review_sources")
            .update({ dmca_reported_at: now })
            .eq("id", report.source_id);
        }

        if (report.order_id) {
          const { data: order } = await supabaseAdmin
            .from("user_review_orders")
            .select("dmca_delay_min_seconds, dmca_delay_max_seconds")
            .eq("id", report.order_id)
            .maybeSingle();
          const delay = randomDelaySeconds(
            order?.dmca_delay_min_seconds ?? 0,
            order?.dmca_delay_max_seconds ?? 0,
          );
          await supabaseAdmin
            .from("user_review_orders")
            .update({
              dmca_next_allowed_at: delay ? new Date(Date.now() + delay * 1000).toISOString() : null,
            })
            .eq("id", report.order_id);
        }

        let remaining = 0;
        if (report.order_id) {
          const { data: pool } = await supabaseAdmin
            .from("user_review_sources")
            .select("id, review_text, published_review_id, dmca_reported_at")
            .eq("order_id", report.order_id)
            .eq("owner_id", auth.ownerId);
          remaining = (pool ?? []).filter(
            (r) =>
              r.published_review_id &&
              (r.review_text ?? "").trim().length > 0 &&
              !r.dmca_reported_at,
          ).length;
        }

        return json({ ok: true, reported: 1, remaining });
      },
    },
  },
});
