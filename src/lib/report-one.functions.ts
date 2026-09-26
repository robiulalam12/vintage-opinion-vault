/**
 * Admin server functions for the Report One system.
 * Rule: one saved session = one submission. Enforced by the unique index
 * on report_one_shots(order_id, template_id).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ReportOneOrderSummary {
  id: string;
  name: string;
  review_url: string;
  category: string;
  reporter_name: string;
  region: string;
  comment_tag: string | null;
  status: string;
  shots_sent: number;
  shots_accepted: number;
  created_at: string;
  submitted_at: string | null;
}

export interface ReportOneOrderDetail extends ReportOneOrderSummary {
  description: string;
  challenge_token: string | null;
  visit_meta: string | null;
  review_ref: string | null;
}

export interface ReportOneShotRow {
  id: string;
  template_id: string | null;
  template_label: string | null;
  google_email: string | null;
  status: string;
  http_status: number | null;
  accepted: boolean;
  response_snippet: string | null;
  error: string | null;
  latency_ms: number | null;
  fired_at: string | null;
  created_at: string;
}

const DEFAULT_DESCRIPTION =
  "This review contains content depicting or promoting child sexual abuse and exploitation. It is deeply harmful, violates Google's policies and applicable law, and should be removed as a matter of urgency. Please investigate and take appropriate action.";

/** Derive a plausible full name from a gmail address (e.g. "jane.doe42@gmail.com" -> "Jane Doe"). */
function reporterNameFromEmail(email: string | null | undefined): string {
  if (!email) return "Concerned User";
  const local = email.split("@")[0] || "";
  const cleaned = local.replace(/\d+/g, " ").replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Concerned User";
  const parts = cleaned.split(/\s+/).slice(0, 3).map((p) =>
    p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
  );
  return parts.join(" ");
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

/* ---------------------------------- orders --------------------------------- */

export const listReportOneOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReportOneOrderSummary[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("report_one_orders")
      .select(
        "id,name,review_url,category,reporter_name,region,comment_tag,status,shots_sent,shots_accepted,created_at,submitted_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ReportOneOrderSummary[];
  });

export const getReportOneOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [orderRes, shotsRes] = await Promise.all([
      supabaseAdmin.from("report_one_orders").select("*").eq("id", data.id).maybeSingle(),
      supabaseAdmin
        .from("report_one_shots")
        .select("*")
        .eq("order_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (orderRes.error) throw new Error(orderRes.error.message);
    if (!orderRes.data) throw new Error("Order not found");
    if (shotsRes.error) throw new Error(shotsRes.error.message);
    return {
      order: orderRes.data as ReportOneOrderDetail,
      shots: (shotsRes.data ?? []) as ReportOneShotRow[],
    };
  });

const createInput = z.object({
  name: z.string().trim().min(2).max(200),
  reviewUrl: z.string().trim().url().max(1000),
  region: z.string().trim().min(2).max(4),
});

export const createReportOneOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => createInput.parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("report_one_orders")
      .insert({
        name: data.name,
        review_url: data.reviewUrl,
        category: "child_sexual_abuse_and_exploitation",
        reporter_name: "",
        region: data.region.toUpperCase(),
        description: DEFAULT_DESCRIPTION,
        created_by: context.userId,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

const updateInput = z.object({
  id: z.string().uuid(),
  challengeToken: z.string().trim().min(10).max(6000).optional(),
  description: z.string().trim().min(10).max(4000).optional(),
});

export const updateReportOneOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => updateInput.parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      updated_at: string;
      challenge_token?: string;
      description?: string;
    } = { updated_at: new Date().toISOString() };
    if (data.challengeToken !== undefined) patch.challenge_token = data.challengeToken;
    if (data.description !== undefined) patch.description = data.description;
    const { error } = await supabaseAdmin
      .from("report_one_orders")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteReportOneOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("report_one_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- templates -------------------------------- */

export const listReportOneTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("fake_review_templates")
      .select("id,label,google_email,status,captured_at,last_verified_at")
      .order("captured_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ---------------------------------- fire ----------------------------------- */

const fireInput = z.object({
  orderId: z.string().uuid(),
  templates: z
    .array(
      z.object({
        id: z.string().uuid(),
        delaySeconds: z.number().int().min(0).max(3600).default(0),
      }),
    )
    .min(1)
    .max(200),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const fireReportOneOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => fireInput.parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fireReportOne } = await import("./report-one.server");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("report_one_orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Order not found");
    // challenge_token is optional — Google may accept without it via API

    const { data: already } = await supabaseAdmin
      .from("report_one_shots")
      .select("template_id")
      .eq("order_id", order.id);
    const done = new Set((already ?? []).map((r) => r.template_id).filter(Boolean));
    const targets = data.templates.filter((t) => !done.has(t.id));
    if (targets.length === 0) {
      return { fired: 0, accepted: 0, skipped: data.templates.length };
    }

    const { data: templates, error: tErr } = await supabaseAdmin
      .from("fake_review_templates")
      .select("id,label,google_email,cookie_bundle,headers_json,auth_user_index")
      .in("id", targets.map((t) => t.id));
    if (tErr) throw new Error(tErr.message);

    // Sort by delay ascending; sleep the incremental gap between shots.
    const tplMap = new Map((templates ?? []).map((t) => [t.id, t]));
    const ordered = [...targets].sort((a, b) => a.delaySeconds - b.delaySeconds);

    let accepted = 0;
    let sent = 0;
    let waited = 0;
    for (const entry of ordered) {
      const t = tplMap.get(entry.id);
      if (!t) continue;
      const gap = entry.delaySeconds - waited;
      if (gap > 0) await sleep(gap * 1000);
      waited = entry.delaySeconds;
      {
      const reporter = reporterNameFromEmail(t.google_email) || order.reporter_name || "Concerned User";
      const result = await fireReportOne(
        {
          id: t.id,
          label: t.label,
          google_email: t.google_email,
          cookie_bundle: t.cookie_bundle,
          headers_json: (t as any).headers_json ?? null,
          auth_user_index: (t as any).auth_user_index ?? null,
        },
        {
          category: order.category,
          reporterName: reporter,
          region: order.region,
          reviewUrl: order.review_url,
          description: order.description,
        },
        order.challenge_token ?? "",
      );
      sent += 1;
      if (result.accepted) accepted += 1;

      await supabaseAdmin.from("report_one_shots").insert({
        order_id: order.id,
        template_id: t.id,
        template_label: t.label,
        google_email: t.google_email,
        status: result.error ? "error" : result.accepted ? "accepted" : "rejected",
        http_status: result.status,
        accepted: result.accepted,
        response_snippet: result.snippet || null,
        error: result.error,
        latency_ms: result.latency,
        fired_at: new Date().toISOString(),
      });
      }
    }

    await supabaseAdmin
      .from("report_one_orders")
      .update({
        shots_sent: (order.shots_sent ?? 0) + sent,
        shots_accepted: (order.shots_accepted ?? 0) + accepted,
        status: "sent",
        submitted_at: order.submitted_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return { fired: sent, accepted, skipped: data.templates.length - targets.length };
  });
