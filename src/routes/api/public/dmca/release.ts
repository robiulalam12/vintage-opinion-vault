import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkKey, json, preflight } from "@/lib/dmca.server";

const input = z.object({ batchId: z.string().uuid() });

export const Route = createFileRoute("/api/public/dmca/release")({
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

        // Never release a batch that was already submitted to Google.
        const { data: batch, error: readError } = await supabaseAdmin
          .from("dmca_batches")
          .select("id, status")
          .eq("id", parsed.batchId)
          .single();
        if (readError) return json({ error: readError.message }, 404);
        if (batch.status === "submitted") {
          return json({ error: "This batch was already submitted and cannot be released." }, 409);
        }

        const { data: rows, error } = await supabaseAdmin
          .from("review_sources")
          .update({ dmca_batch_id: null })
          .eq("dmca_batch_id", parsed.batchId)
          .is("dmca_reported_at", null)
          .select("id");
        if (error) return json({ error: error.message }, 500);

        await supabaseAdmin
          .from("dmca_batches")
          .update({ status: "cancelled" })
          .eq("id", parsed.batchId);

        return json({ ok: true, released: (rows ?? []).length });
      },
    },
  },
});
