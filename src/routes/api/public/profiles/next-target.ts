import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkKey, json, preflight } from "@/lib/dmca.server";

const input = z.object({ orderId: z.string().uuid() });

/**
 * Hands the extension the next review link that still needs a reviewer profile
 * URL. The row is marked `capturing` so parallel windows never take the same
 * link twice; a stale claim is reclaimed after 5 minutes.
 */
export const Route = createFileRoute("/api/public/profiles/next-target")({
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

        const { data: all, error: allError } = await supabaseAdmin
          .from("profile_targets")
          .select("id, status, reviewer_profile_url, claimed_at, url, canonical_url")
          .eq("order_id", parsed.orderId)
          .order("created_at", { ascending: true });
        if (allError) return json({ error: allError.message }, 500);

        const rows = all ?? [];
        const eligible = rows.filter((r) => r.status !== "failed");
        const done = eligible.filter((r) => r.reviewer_profile_url).length;
        const staleBefore = Date.now() - 5 * 60 * 1000;

        const candidate = eligible.find(
          (r) =>
            !r.reviewer_profile_url &&
            (r.status !== "capturing" ||
              !r.claimed_at ||
              new Date(r.claimed_at).getTime() < staleBefore),
        );

        if (!candidate) {
          return json(
            {
              error: "No links left needing a reviewer profile in this batch.",
              done: true,
              progress: { done, total: eligible.length },
            },
            409,
          );
        }

        const { error: claimError } = await supabaseAdmin
          .from("profile_targets")
          .update({ status: "capturing", claimed_at: new Date().toISOString(), error: null })
          .eq("id", candidate.id);
        if (claimError) return json({ error: claimError.message }, 500);

        return json({
          target: {
            id: candidate.id,
            reviewUrl: candidate.canonical_url || candidate.url,
            originalUrl: candidate.url,
          },
          progress: { done, total: eligible.length },
        });
      },
    },
  },
});
