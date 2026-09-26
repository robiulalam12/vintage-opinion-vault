import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkKey, json, preflight } from "@/lib/dmca.server";

const input = z.object({
  id: z.string().uuid(),
  profileUrl: z.string().trim().max(400).optional(),
  error: z.string().trim().max(300).optional(),
});

/** Stores a captured reviewer profile URL, or records why capture failed. */
export const Route = createFileRoute("/api/public/profiles/submit-target")({
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
        const { normaliseProfileUrl } = await import("@/lib/profile-report.server");

        const profile = parsed.profileUrl ? normaliseProfileUrl(parsed.profileUrl) : null;

        const update = profile
          ? {
              reviewer_profile_url: profile.url,
              contributor_id: profile.contributorId,
              captured_at: new Date().toISOString(),
              status: "captured",
              error: null,
            }
          : {
              status: "failed",
              error: parsed.error || "No reviewer profile link found on the page.",
            };

        const { error } = await supabaseAdmin
          .from("profile_targets")
          .update(update)
          .eq("id", parsed.id);
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, profileUrl: profile?.url ?? null });
      },
    },
  },
});
