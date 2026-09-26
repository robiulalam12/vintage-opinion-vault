import { createFileRoute } from "@tanstack/react-router";
import { checkKey, claimInput, json, preflight, progress } from "@/lib/policy-extension.server";

export const Route = createFileRoute("/api/public/policy-extension/next")({
  server: { handlers: {
    OPTIONS: async () => preflight(),
    POST: async ({ request }) => {
      if (!checkKey(request)) return json({ error: "Unauthorized" }, 401);
      let input; try { input = claimInput.parse(await request.json()); } catch { return json({ error: "Invalid request" }, 400); }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const stale = new Date(Date.now() - 15 * 60_000).toISOString();
      await supabaseAdmin.from("policy_items").update({ report_status: "written", report_error: "Abandoned extension claim released." }).eq("order_id", input.orderId).eq("report_status", "processing").lt("updated_at", stale);
      const { data: all, error: allError } = await supabaseAdmin.from("policy_items").select("id,url,verdict,report_status,report_text,primary_tag,tags,reviewer_name,updated_at").eq("order_id", input.orderId).order("created_at");
      if (allError) return json({ error: allError.message }, 500);
      const candidates = (all ?? []).filter((item) => item.verdict === "violates" && item.report_status === "written" && (item.report_text ?? "").trim().length >= 1 && (item.report_text ?? "").trim().length <= 1000);
      const skip = new Set(input.skipIds ?? []);
      const skippedCount = candidates.filter((item) => skip.has(item.id)).length;
      const pending = candidates.filter((item) => !skip.has(item.id));
      if (!pending.length && skippedCount) return json({ done: true, skipped: skippedCount, progress: progress(all ?? []) }, 200);
      if (!candidates.length) {
        const p = progress(all ?? []);
        if (p.inProgress) return json({ error: `${p.inProgress} report(s) are currently in progress.`, wait: true, progress: p }, 409);
        return json({ done: true, progress: p }, 200);
      }
      const marker = `extension-claim:${input.claimToken}`;
      for (const candidate of pending) {
        const { data: claimed, error } = await supabaseAdmin.from("policy_items").update({ report_status: "processing", report_error: marker }).eq("id", candidate.id).eq("report_status", "written").select("id");
        if (error) return json({ error: error.message }, 500);
        if (claimed?.length) return json({ itemId: candidate.id, claimToken: input.claimToken, url: candidate.url, reportText: candidate.report_text?.trim(), primaryPolicy: candidate.primary_tag, tags: candidate.tags, reviewerName: candidate.reviewer_name, progress: progress(all ?? []) });
      }
      return json({ error: "Available reports were just claimed. Retry.", wait: true }, 409);
    },
  } },
});