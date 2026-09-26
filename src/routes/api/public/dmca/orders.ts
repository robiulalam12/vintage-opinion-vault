import { createFileRoute } from "@tanstack/react-router";

import { checkKey, json, preflight } from "@/lib/dmca.server";

export const Route = createFileRoute("/api/public/dmca/orders")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        if (!checkKey(request)) return json({ error: "Unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: orders, error } = await supabaseAdmin
          .from("review_orders")
          .select("id, name, created_at")
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);

        const { data: sources, error: sourcesError } = await supabaseAdmin
          .from("review_sources")
          .select(
            "order_id, review_text, published_review_id, published_profile_review_id, dmca_batch_id, dmca_report_id, dmca_reported_at",
          );
        if (sourcesError) return json({ error: sourcesError.message }, 500);

        const rows = sources ?? [];
        return json({
          orders: (orders ?? []).map((order) => {
            const own = rows.filter((s) => s.order_id === order.id);
            const eligible = own.filter(
              (s) =>
                (s.published_review_id || s.published_profile_review_id) &&
                (s.review_text ?? "").trim().length > 0,
            );
            const reported = eligible.filter((s) => s.dmca_reported_at).length;
            const reserved = eligible.filter((s) => s.dmca_batch_id && !s.dmca_reported_at).length;
            return {
              id: order.id,
              name: order.name,
              published: eligible.length,
              reported,
              reserved,
              remaining: eligible.filter((s) => !s.dmca_batch_id && !s.dmca_report_id).length,
            };
          }),
        });
      },
    },
  },
});
