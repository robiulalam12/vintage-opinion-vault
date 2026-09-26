import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkKey, json, preflight } from "@/lib/dmca.server";

const input = z.object({
  batchId: z.string().uuid(),
  caseRef: z.string().trim().max(120).optional().default(""),
});

export const Route = createFileRoute("/api/public/dmca/confirm")({
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

        const { error: batchError } = await supabaseAdmin
          .from("dmca_batches")
          .update({
            status: "submitted",
            submitted_at: now,
            google_case_ref: parsed.caseRef || null,
          })
          .eq("id", parsed.batchId);
        if (batchError) return json({ error: batchError.message }, 500);

        const { data: rows, error } = await supabaseAdmin
          .from("review_sources")
          .update({ dmca_reported_at: now })
          .eq("dmca_batch_id", parsed.batchId)
          .select("id");
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, reported: (rows ?? []).length });
      },
    },
  },
});
