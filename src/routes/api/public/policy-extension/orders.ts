import { createFileRoute } from "@tanstack/react-router";
import { checkKey, json, preflight, progress } from "@/lib/policy-extension.server";

export const Route = createFileRoute("/api/public/policy-extension/orders")({
  server: { handlers: {
    OPTIONS: async () => preflight(),
    GET: async ({ request }) => {
      if (!checkKey(request)) return json({ error: "Unauthorized" }, 401);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const stale = new Date(Date.now() - 15 * 60_000).toISOString();
      await supabaseAdmin.from("policy_items").update({ report_status: "written", report_error: "Abandoned extension claim released." }).eq("report_status", "processing").lt("updated_at", stale);
      const { data: orders, error } = await supabaseAdmin.from("policy_orders").select("id,name,created_at").order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      const { data: items, error: itemError } = await supabaseAdmin.from("policy_items").select("order_id,verdict,report_status,report_text");
      if (itemError) return json({ error: itemError.message }, 500);
      return json({ orders: (orders ?? []).map((order) => ({ ...order, ...progress((items ?? []).filter((item) => item.order_id === order.id)) })).filter((order) => order.total > 0) });
    },
  } },
});