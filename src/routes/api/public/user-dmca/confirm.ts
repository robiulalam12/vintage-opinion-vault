import { createFileRoute } from "@tanstack/react-router";

import { json, preflight, resolveOwner } from "@/lib/user-dmca.server";

// Batch mode is admin-only; user accounts run the automatic one-by-one mode.
export const Route = createFileRoute("/api/public/user-dmca/confirm")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const auth = await resolveOwner(request);
        if ("error" in auth) return auth.error;
        return json({ error: "Batch mode isn't available on user accounts — use One-by-one (automatic) mode." }, 409);
      },
    },
  },
});
