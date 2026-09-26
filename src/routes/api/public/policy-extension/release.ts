import { createFileRoute } from "@tanstack/react-router";
import { checkKey, json, preflight, releaseInput } from "@/lib/policy-extension.server";

export const Route = createFileRoute("/api/public/policy-extension/release")({
  server: { handlers: {
    OPTIONS: async () => preflight(),
    POST: async ({ request }) => {
      if (!checkKey(request)) return json({ error: "Unauthorized" }, 401);
      let input; try { input = releaseInput.parse(await request.json()); } catch { return json({ error: "Invalid request" }, 400); }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const marker = `extension-claim:${input.claimToken}`;
      const { data, error } = await supabaseAdmin.from("policy_items").update({ report_status: "written", report_error: input.error || null }).eq("id", input.itemId).eq("report_status", "processing").eq("report_error", marker).select("id");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, released: Boolean(data?.length) });
    },
  } },
});