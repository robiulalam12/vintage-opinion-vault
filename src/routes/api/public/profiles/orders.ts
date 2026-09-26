import { createFileRoute } from "@tanstack/react-router";

import { checkKey, json, preflight } from "@/lib/dmca.server";

/** Lists profile batches that still have links waiting for profile capture. */
export const Route = createFileRoute("/api/public/profiles/orders")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        if (!checkKey(request)) return json({ error: "Unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: orders, error } = await supabaseAdmin
          .from("profile_orders")
          .select("id, name, created_at")
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);

        const { data: targets, error: targetError } = await supabaseAdmin
          .from("profile_targets")
          .select("order_id, status, reviewer_profile_url");
        if (targetError) return json({ error: targetError.message }, 500);

        return json({
          orders: (orders ?? []).map((order) => {
            const rows = (targets ?? []).filter((t) => t.order_id === order.id);
            return {
              id: order.id,
              name: order.name,
              total: rows.length,
              captured: rows.filter((r) => r.reviewer_profile_url).length,
              remaining: rows.filter((r) => !r.reviewer_profile_url && r.status !== "failed").length,
            };
          }),
        });
      },
    },
  },
});
