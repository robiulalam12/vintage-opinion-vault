/**
 * User-scoped fake review server functions.
 *
 * Every template / comment / order / shot query is scoped to the calling
 * user via `created_by`. Users NEVER see another user's account pool,
 * comments, orders, or shots — each dashboard is fully isolated.
 * Requires an active access key (or admin).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  FakeOrderSummary,
  FakeShotRow,
  FakeTemplateSummary,
} from "@/lib/fake-reviews.functions";

async function assertActive(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_active_key", {
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Your access key is not active.");
}

async function assertOwnsOrder(
  supabaseAdmin: any,
  orderId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("fake_review_orders")
    .select("created_by")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Order not found");
  if (data.created_by !== userId) throw new Error("Not your order");
}

/* ---------------------------- cookie parsing --------------------------- */

function parseCookieText(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (text.startsWith("[")) {
    try {
      const arr = JSON.parse(text) as unknown;
      if (Array.isArray(arr)) {
        for (const entry of arr) {
          if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as { name?: unknown }).name === "string" &&
            typeof (entry as { value?: unknown }).value === "string"
          ) {
            const name = (entry as { name: string }).name.trim();
            const value = (entry as { value: string }).value.trim();
            if (name) map.set(name, value);
          }
        }
        if (map.size > 0) return map;
      }
    } catch {
      /* ignore */
    }
  }
  const netscapeLines = text
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("\t"));
  if (netscapeLines.length > 0) {
    for (const line of netscapeLines) {
      const cols = line.split("\t");
      if (cols.length >= 7) {
        const name = (cols[5] ?? "").trim();
        const value = cols.slice(6).join("\t").trim();
        if (name) map.set(name, value);
      }
    }
    if (map.size > 0) return map;
  }
  const flat = text.replace(/\n+/g, "; ");
  for (const pair of flat.split(/;\s*/)) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) map.set(name, value);
  }
  return map;
}

/* ------------------------------- my templates ------------------------------ */

/** Lists ONLY the calling user's own uploaded account pool. */
export const listSharedTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FakeTemplateSummary[]> => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("fake_review_templates")
      .select(
        "id,label,google_email,auth_user_index,status,captured_at,last_verified_at,last_fired_at,last_error,shots_fired,notes",
      )
      .eq("created_by", context.userId)
      .order("captured_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any): FakeTemplateSummary => {
      const m = /^\[tag:([^\]]+)\]\s*/.exec(r.notes ?? "");
      return {
        ...r,
        tag: m ? m[1] : null,
        notes: m ? (r.notes as string).slice(m[0].length) || null : r.notes,
      };
    });
  });

/**
 * Upload one or more Google account cookies as new templates.
 * Rows are created with `created_by = auth.uid()` so no other user can
 * see or use them. Structural fields (endpoint URL, headers, body) are
 * cloned from the latest global capture — cookies alone don't include
 * the RPC endpoint. Nothing sensitive from another user is returned.
 */
export const addMyTemplatesFromCookiesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        auth_user_index: z.number().int().min(0).max(9).optional(),
        google_email_prefix: z.string().max(120).optional().nullable(),
        tag: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[^\]\[]+$/, "Tag can't contain brackets"),
        items: z
          .array(
            z.object({
              label: z.string().min(1).max(120),
              cookie_text: z.string().min(20).max(200_000),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Prefer the caller's own latest template as the structural base; if they
    // have none, fall back to any latest capture in the system for structure
    // (endpoint/method/body/headers only — cookies are always the user's own).
    let base: any = null;
    {
      const { data: mine } = await supabaseAdmin
        .from("fake_review_templates")
        .select("endpoint_url,method,body_template,body_kind,headers_json")
        .eq("created_by", context.userId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      base = mine ?? null;
    }
    if (!base) {
      const { data: any1 } = await supabaseAdmin
        .from("fake_review_templates")
        .select("endpoint_url,method,body_template,body_kind,headers_json")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      base = any1 ?? null;
    }
    if (!base) {
      // No captured template anywhere — synthesise the canonical Google
      // Maps "Report review" shape so users can seed with cookies alone.
      base = {
        endpoint_url:
          "https://www.google.com/_/LocalUserPostsRapUi/data/batchexecute" +
          "?rpcids=qVL8Rd&source-path=%2Flocal%2Fcontent%2Frap%2Freport%2Fsubmit" +
          "&hl=en&soc-app=162&soc-platform=1&soc-device=1&rt=c",
        method: "POST",
        body_template: (() => {
          const inner = JSON.stringify([
            null, null, null, "{{REVIEW_ID}}", 286732320, 1, "", "{{REASON_NUM}}",
          ]);
          const outer = JSON.stringify([[["qVL8Rd", inner, null, "generic"]]]);
          const p = new URLSearchParams();
          p.set("f.req", outer);
          p.set("at", "PLACEHOLDER");
          return p.toString();
        })(),
        body_kind: "form",
        headers_json: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "x-same-domain": "1",
          origin: "https://www.google.com",
          referer: "https://www.google.com/maps",
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
        },
      };
    }
    const baseHeaders = { ...((base.headers_json ?? {}) as Record<string, string>) };
    for (const k of Object.keys(baseHeaders)) {
      if (k.toLowerCase() === "cookie") delete baseHeaders[k];
    }
    const authuserMatch = /[?&]authuser=(\d+)/.exec(base.endpoint_url);
    const currentAuthUser = authuserMatch ? Number(authuserMatch[1]) : 0;
    const targetAuthUser = data.auth_user_index ?? currentAuthUser;
    const endpoint_url =
      targetAuthUser === currentAuthUser
        ? base.endpoint_url
        : base.endpoint_url.replace(/([?&]authuser=)\d+/, `$1${targetAuthUser}`);

    const added: { label: string }[] = [];
    const failed: { label: string; error: string }[] = [];

    for (const item of data.items) {
      const cookies = parseCookieText(item.cookie_text);
      const sapisid =
        cookies.get("SAPISID") ||
        cookies.get("__Secure-1PAPISID") ||
        cookies.get("__Secure-3PAPISID");
      if (cookies.size === 0) {
        failed.push({ label: item.label, error: "Could not parse any cookies from this file." });
        continue;
      }
      if (!sapisid) {
        const hasSid =
          cookies.has("SID") || cookies.has("__Secure-1PSID") || cookies.has("__Secure-3PSID");
        failed.push({
          label: item.label,
          error: hasSid
            ? "Session cookies found but SAPISID/__Secure-1PAPISID/__Secure-3PAPISID are missing — re-export from a fully signed-in google.com tab."
            : "This export is from a SIGNED-OUT Google session (only anti-bot cookies, no SID/SAPISID). Sign in to the Google account on google.com, then export cookies again.",
        });
        continue;
      }
      const cookieBundle = Array.from(cookies.entries())
        .map(([k, val]) => `${k}=${val}`)
        .join("; ");
      const headers = { ...baseHeaders, Cookie: cookieBundle };
      const google_email =
        data.google_email_prefix?.trim()
          ? `${data.google_email_prefix.trim()}+${item.label
              .replace(/[^a-zA-Z0-9]/g, "")
              .toLowerCase()}@gmail.com`
          : null;
      const { error: insErr } = await supabaseAdmin
        .from("fake_review_templates")
        .insert({
          label: item.label,
          google_email,
          auth_user_index: targetAuthUser,
          endpoint_url,
          method: base.method,
          headers_json: headers,
          cookie_bundle: cookieBundle,
          body_template: base.body_template,
          body_kind: base.body_kind,
          captured_at: new Date().toISOString(),
          status: "fresh",
          shots_fired: 0,
          created_by: context.userId,
          notes: `[tag:${data.tag}]`,
        });
      if (insErr) failed.push({ label: item.label, error: insErr.message });
      else added.push({ label: item.label });
    }

    return { added: added.length, failed, total: data.items.length };
  });

export const deleteMyTemplatesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) }).parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("fake_review_templates")
      .delete({ count: "exact" })
      .in("id", data.ids)
      .eq("created_by", context.userId);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

/* ------------------------------ my comments ---------------------------- */

export interface UserFakeCommentRow {
  id: string;
  text: string;
  active: boolean;
  times_used: number;
  created_at: string;
}

export const listSharedComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserFakeCommentRow[]> => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("fake_review_comments")
      .select("id,text,active,times_used,created_at")
      .eq("created_by", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as UserFakeCommentRow[];
  });

export const addSharedComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ text: z.string().min(1).max(200000) }).parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lines = Array.from(
      new Set(
        data.text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length >= 1 && l.length <= 4000),
      ),
    );
    if (lines.length === 0) return { added: 0, skipped: 0 };
    const { data: existing } = await supabaseAdmin
      .from("fake_review_comments")
      .select("text")
      .eq("created_by", context.userId)
      .in("text", lines);
    const seen = new Set((existing ?? []).map((r: any) => r.text as string));
    const fresh = lines.filter((l) => !seen.has(l));
    if (fresh.length === 0) return { added: 0, skipped: lines.length };
    const rows = fresh.map((text) => ({ text, created_by: context.userId }));
    const { error } = await supabaseAdmin.from("fake_review_comments").insert(rows);
    if (error) throw new Error(error.message);
    return { added: fresh.length, skipped: lines.length - fresh.length };
  });

export const deleteMyComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fake_review_comments")
      .delete()
      .eq("id", data.id)
      .eq("created_by", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------------- my orders --------------------------------- */

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FakeOrderSummary[]> => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orders, error } = await supabaseAdmin
      .from("fake_review_orders")
      .select(
        "id,name,target_url,canonical_url,feature_id,review_id,reason_code,comment_tag,shots_per_template,template_ids,status,created_at,fired_at,done_at",
      )
      .eq("created_by", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (orders ?? []).map((o: any) => o.id);
    if (ids.length === 0) return [];
    const { data: shots } = await supabaseAdmin
      .from("fake_review_shots")
      .select("order_id,http_status")
      .in("order_id", ids);
    return (orders ?? []).map((o: any): FakeOrderSummary => {
      const rows = (shots ?? []).filter((s: any) => s.order_id === o.id);
      const ok = rows.filter((r: any) => r.http_status && r.http_status < 400).length;
      return { ...o, shots_total: rows.length, shots_ok: ok, shots_err: rows.length - ok };
    });
  });

export const createMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        target_url: z.string().trim().url(),
        reason_code: z.enum([
          "LOW_QUALITY",
          "PROFANITY",
          "HARMFUL",
          "BULLYING",
          "DISCRIMINATION",
          "PERSONAL",
          "NOT_HELPFUL",
          "OFF_TOPIC",
          "SPAM",
          "CONFLICT",
        ]),
        comment_tag: z
          .enum([
            "policy_violation",
            "pii",
            "phone_leak",
            "cyberbullying",
            "doxxing",
            "extortion",
            "competitor_attack",
          ])
          .nullable()
          .optional(),
        shots_per_template: z.number().int().min(1).max(500),
        template_ids: z.array(z.string().uuid()).min(1).max(5000),
        note: z.string().max(500).optional().default(""),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Enforce ownership: every template must belong to the calling user.
    const { data: owned, error: ownedErr } = await supabaseAdmin
      .from("fake_review_templates")
      .select("id")
      .eq("created_by", context.userId)
      .in("id", data.template_ids);
    if (ownedErr) throw new Error(ownedErr.message);
    const ownedSet = new Set((owned ?? []).map((r: any) => r.id as string));
    if (ownedSet.size !== data.template_ids.length) {
      throw new Error(
        "One or more selected accounts don't belong to you. Reload and pick again.",
      );
    }
    const { resolveProfileTarget } = await import("@/lib/profile-report.server");
    const resolved = await resolveProfileTarget(data.target_url);
    if (!resolved.ok || !resolved.canonical_url) {
      throw new Error(resolved.error || "Could not resolve target URL");
    }
    const reviewMatch = resolved.canonical_url.match(/!2m5!1s([A-Za-z0-9_-]{15,})/);
    const reviewId = reviewMatch?.[1] ?? null;
    if (!reviewId) {
      throw new Error(
        "Target URL is missing a review id — open the specific review and copy its share link.",
      );
    }
    const { data: row, error } = await supabaseAdmin
      .from("fake_review_orders")
      .insert({
        name: data.name,
        target_url: data.target_url,
        canonical_url: resolved.canonical_url,
        feature_id: resolved.place_id ?? null,
        review_id: reviewId,
        reason_code: data.reason_code,
        comment_tag: data.comment_tag ?? null,
        shots_per_template: data.shots_per_template,
        template_ids: data.template_ids,
        note: data.note || null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const getMyOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("fake_review_orders")
      .select(
        "id,name,target_url,canonical_url,feature_id,review_id,reason_code,comment_tag,shots_per_template,template_ids,status,created_at,fired_at,done_at,note,created_by",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { order: null, shots: [] as FakeShotRow[] };
    if (order.created_by !== context.userId) throw new Error("Not your order");
    const { data: shots, error: sErr } = await supabaseAdmin
      .from("fake_review_shots")
      .select("id,template_id,sequence,http_status,latency_ms,error,fired_at,response_snippet")
      .eq("order_id", data.id)
      .order("fired_at", { ascending: true })
      .limit(4000);
    if (sErr) throw new Error(sErr.message);
    return { order, shots: (shots ?? []) as FakeShotRow[] };
  });

export const cancelMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwnsOrder(supabaseAdmin, data.id, context.userId);
    const { error } = await supabaseAdmin
      .from("fake_review_orders")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwnsOrder(supabaseAdmin, data.id, context.userId);
    const { error } = await supabaseAdmin
      .from("fake_review_orders")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const fireMyOrderWave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ id: z.string().uuid(), max: z.number().int().min(1).max(200).default(120) })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwnsOrder(supabaseAdmin, data.id, context.userId);
    const { fireOrderCore } = await import("@/lib/fake-reviews-fire.server");
    return fireOrderCore(supabaseAdmin, data.id, data.max);
  });

export const startMyDrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        min_sec: z.number().int().min(30).max(7200),
        max_sec: z.number().int().min(30).max(7200),
      })
      .refine((d) => d.max_sec >= d.min_sec, "Max must be at least min")
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwnsOrder(supabaseAdmin, data.id, context.userId);
    const { data: order, error } = await supabaseAdmin
      .from("fake_review_orders")
      .select("status,fired_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");
    if (order.status === "done" || order.status === "cancelled") {
      throw new Error(`Order is ${order.status}`);
    }
    const now = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("fake_review_orders")
      .update({
        status: `drip:${data.min_sec}:${data.max_sec}`,
        done_at: now,
        fired_at: order.fired_at ?? now,
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const pauseMyDrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwnsOrder(supabaseAdmin, data.id, context.userId);
    const { error } = await supabaseAdmin
      .from("fake_review_orders")
      .update({ status: "paused", done_at: null })
      .eq("id", data.id)
      .like("status", "drip:%");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const myFakeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActive(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: tpls }, { data: orders }] = await Promise.all([
      supabaseAdmin
        .from("fake_review_templates")
        .select("status")
        .eq("created_by", context.userId),
      supabaseAdmin
        .from("fake_review_orders")
        .select("id,status")
        .eq("created_by", context.userId),
    ]);
    const orderIds = (orders ?? []).map((o: any) => o.id);
    let shotRows: any[] = [];
    if (orderIds.length) {
      const { data } = await supabaseAdmin
        .from("fake_review_shots")
        .select("http_status,fired_at")
        .in("order_id", orderIds);
      shotRows = data ?? [];
    }
    const templates = tpls ?? [];
    const orderRows = orders ?? [];
    const now = Date.now();
    const last24 = shotRows.filter((s) => now - new Date(s.fired_at).getTime() < 86400000);
    return {
      templates: {
        total: templates.length,
        fresh: templates.filter((t: any) => t.status === "fresh").length,
      },
      orders: {
        total: orderRows.length,
        firing: orderRows.filter((o: any) => o.status === "firing").length,
        done: orderRows.filter((o: any) => o.status === "done").length,
      },
      shots: {
        total: shotRows.length,
        ok: shotRows.filter((s) => s.http_status && s.http_status < 400).length,
        err: shotRows.filter((s) => !s.http_status || s.http_status >= 400).length,
        last24: last24.length,
      },
    };
  });
