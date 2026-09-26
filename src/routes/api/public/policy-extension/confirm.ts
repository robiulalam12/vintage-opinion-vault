import { createFileRoute } from "@tanstack/react-router";
import { checkKey, confirmInput, json, preflight, progress } from "@/lib/policy-extension.server";

export const Route = createFileRoute("/api/public/policy-extension/confirm")({
  server: { handlers: {
    OPTIONS: async () => preflight(),
    POST: async ({ request }) => {
      if (!checkKey(request)) return json({ error: "Unauthorized" }, 401);
      let input; try { input = confirmInput.parse(await request.json()); } catch { return json({ error: "Invalid request" }, 400); }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const marker = `extension-claim:${input.claimToken}`;
      const note = input.caseRef ? `Google case: ${input.caseRef}` : null;
      const { data: updated, error } = await supabaseAdmin.from("policy_items").update({ report_status: "submitted", report_error: note }).eq("id", input.itemId).eq("report_status", "processing").eq("report_error", marker).select("order_id");
      if (error) return json({ error: error.message }, 500);
      const completed = updated?.[0];
      if (!completed) return json({ error: "Claim expired or was already completed." }, 409);
      const { data: items } = await supabaseAdmin.from("policy_items").select("verdict,report_status,report_text").eq("order_id", completed.order_id);
      return json({ ok: true, progress: progress(items ?? []) });
    },
  } },
});