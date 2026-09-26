import { z } from "zod";

export { checkKey, json, preflight } from "@/lib/dmca.server";

export const orderInput = z.object({ orderId: z.string().uuid() });
export const claimInput = z.object({ orderId: z.string().uuid(), claimToken: z.string().uuid(), skipIds: z.array(z.string().uuid()).max(500).optional() });
export const reportInput = z.object({ itemId: z.string().uuid(), claimToken: z.string().uuid() });
export const confirmInput = reportInput.extend({ caseRef: z.string().trim().max(200).optional().default("") });
export const releaseInput = reportInput.extend({ error: z.string().trim().max(500).optional().default("") });

export function eligible(item: { verdict: string | null; report_status: string; report_text: string | null }) {
  const length = (item.report_text ?? "").trim().length;
  return item.verdict === "violates" && length >= 1 && length <= 1000 && item.report_status !== "submitted";
}

export function progress(items: Array<{ verdict: string | null; report_status: string; report_text: string | null }>) {
  const relevant = items.filter((item) => item.verdict === "violates");
  return {
    total: relevant.length,
    ready: relevant.filter((item) => eligible(item) && item.report_status === "written").length,
    inProgress: relevant.filter((item) => item.report_status === "processing").length,
    submitted: relevant.filter((item) => item.report_status === "submitted").length,
    blocked: relevant.filter((item) => !eligible(item) && item.report_status !== "submitted").length,
  };
}