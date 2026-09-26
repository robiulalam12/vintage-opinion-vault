import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { json, preflight, resolveOwner } from "@/lib/user-dmca.server";

const input = z.object({
  reportId: z.string().uuid(),
  reason: z.enum(["released", "skipped", "failed"]).optional().default("released"),
  error: z.string().trim().max(2000).optional().default(""),
});

export const Route = createFileRoute("/api/public/user-dmca/release-single")({
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
        const { data: report, error: rErr } = await supabaseAdmin
          .from("user_dmca_reports")
          .select("id, status, source_id")
          .eq("id", parsed.reportId)
          .eq("owner_id", auth.ownerId)
          .maybeSingle();
        if (rErr) return json({ error: rErr.message }, 500);
        if (!report) return json({ error: "Report not found." }, 404);
        if (report.status === "submitted") {
          return json({ error: "This report was already submitted to Google." }, 409);
        }

        const keepClaimed = parsed.reason === "skipped";
        if (report.source_id && !keepClaimed) {
          await supabaseAdmin
            .from("user_review_sources")
            .update({ dmca_report_id: null })
            .eq("id", report.source_id)
            .is("dmca_reported_at", null);
        }

        const { error } = await supabaseAdmin
          .from("user_dmca_reports")
          .update({ status: parsed.reason, error: parsed.error || null })
          .eq("id", parsed.reportId);
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, status: parsed.reason, returnedToPool: !keepClaimed });
      },
    },
  },
});
