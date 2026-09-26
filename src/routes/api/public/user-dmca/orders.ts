import { createFileRoute } from "@tanstack/react-router";

import { json, preflight, resolveOwner } from "@/lib/user-dmca.server";

export const Route = createFileRoute("/api/public/user-dmca/orders")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const auth = await resolveOwner(request);
        if ("error" in auth) return auth.error;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: orders, error } = await supabaseAdmin
          .from("user_review_orders")
          .select("id, name, created_at")
          .eq("owner_id", auth.ownerId)
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);

        const { data: sources, error: sErr } = await supabaseAdmin
          .from("user_review_sources")
          .select("order_id, review_text, published_review_id, dmca_report_id, dmca_reported_at")
          .eq("owner_id", auth.ownerId);
        if (sErr) return json({ error: sErr.message }, 500);

        const rows = sources ?? [];
        return json({
          orders: (orders ?? []).map((order) => {
            const own = rows.filter((s) => s.order_id === order.id);
            const eligible = own.filter(
              (s) => s.published_review_id && (s.review_text ?? "").trim().length > 0,
            );
            return {
              id: order.id,
              name: order.name,
              published: eligible.length,
              reported: eligible.filter((s) => s.dmca_reported_at).length,
              reserved: eligible.filter((s) => s.dmca_report_id && !s.dmca_reported_at).length,
              remaining: eligible.filter((s) => !s.dmca_report_id && !s.dmca_reported_at).length,
            };
          }),
        });
      },
    },
  },
});
