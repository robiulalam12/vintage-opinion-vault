/**
 * Admin server functions for the Fake Reviews firehose.
 *
 * All handlers verify the caller is an admin. Sensitive columns
 * (headers_json, cookie_bundle, body_template) never cross to the client —
 * only metadata is returned by list/get. The heavy lifting lives in the
 * server-only helpers loaded inside handlers via dynamic import.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface FakeTemplateSummary {
  id: string;
  label: string;
  google_email: string | null;
  auth_user_index: number;
  status: string;
  captured_at: string;
  last_verified_at: string | null;
  last_fired_at: string | null;
  last_error: string | null;
  shots_fired: number;
  notes: string | null;
  tag: string | null;
}

export interface FakeOrderSummary {
  id: string;
  name: string;
  target_url: string;
  canonical_url: string | null;
  feature_id: string | null;
  review_id: string | null;
  reason_code: string;
  comment_tag: string | null;
  shots_per_template: number;
  template_ids: string[];
  status: string;
  created_at: string;
  fired_at: string | null;
  done_at: string | null;
  shots_total: number;
  shots_ok: number;
  shots_err: number;
}

export interface FakeShotRow {
  id: string;
  template_id: string | null;
  sequence: number;
  http_status: number | null;
  latency_ms: number | null;
  error: string | null;
  fired_at: string;
  response_snippet: string | null;
}

/**
 * Admins, plus any account granted the "fake_reviews" dashboard section.
 * Returns { userId, isAdmin } so callers can scope queries: non-admins only
 * see rows they own (created_by = userId); admins see everything, including
 * shared rows (created_by IS NULL, e.g. extension-key captures).
 */
async function assertSection(context: { supabase: any; userId: string }): Promise<{ userId: string; isAdmin: boolean }> {
  const [{ data: canUse, error: e1 }, { data: isAdmin, error: e2 }] = await Promise.all([
    context.supabase.rpc("can_use_section", { _user_id: context.userId, _section: "fake_reviews" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  if (!canUse && !isAdmin) throw new Error("Access not granted");
  return { userId: context.userId, isAdmin: !!isAdmin };
}

/** Scope a Supabase query builder to the caller's own rows unless they're admin. */
function scopeToOwner<T>(q: T, isAdmin: boolean, userId: string, column = "created_by"): T {
  if (isAdmin) return q;
  return (q as any).eq(column, userId);
}

/* -------------------------------- templates ------------------------------- */

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("fake_review_templates")
      .select(
        "id,label,google_email,auth_user_index,status,captured_at,last_verified_at,last_fired_at,last_error,shots_fired,notes",
      )
      .order("captured_at", { ascending: false });
    q = scopeToOwner(q, access.isAdmin, access.userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any): FakeTemplateSummary => {
      const m = /^\[tag:([^\]]+)\]\s*/.exec(r.notes ?? "");
      return { ...r, tag: m ? m[1] : null, notes: m ? (r.notes as string).slice(m[0].length) || null : r.notes };
    });
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("fake_review_templates").delete().eq("id", data.id);
    q = scopeToOwner(q, access.isAdmin, access.userId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Bulk delete templates by id list. Returns the count actually removed. */
export const deleteTemplatesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) }).parse(v),
  )
  .handler(async ({ context, data }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("fake_review_templates")
      .delete()
      .in("id", data.ids);
    q = scopeToOwner(q, access.isAdmin, access.userId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true, deleted: data.ids.length };
  });


export const setTemplateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["fresh", "stale", "expired", "disabled"]) }).parse(v),
  )
  .handler(async ({ context, data }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("fake_review_templates")
      .update({ status: data.status })
      .eq("id", data.id);
    q = scopeToOwner(q, access.isAdmin, access.userId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Sends one lightweight replay against Google's endpoint to see whether the
 * captured cookie/SAPISID hash is still valid. Anything in 2xx/3xx is "fresh".
 * 401/403 marks the template `expired`. Other statuses mark it `stale` so you
 * know it may still work but Google didn't accept the probe reason.
 */
export const verifyTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let selQ = supabaseAdmin
      .from("fake_review_templates")
      .select("*")
      .eq("id", data.id);
    selQ = scopeToOwner(selQ, access.isAdmin, access.userId);
    const { data: t, error } = await selQ.maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) throw new Error("Template not found");

    const { probeAccountSignIn } = await import("@/lib/fake-reviews.server");
    // Google's batchexecute endpoint returns HTTP 200 even for dead cookies
    // (real error is buried in the response body as code 7 "generic"), so
    // firing a probe report can't tell us if the account is actually signed
    // in. Instead we load the report page with this account's cookies and
    // check for the SNlM0e auth token — its presence is the ground truth.
    const started = Date.now();
    const probe = await probeAccountSignIn({
      id: t.id,
      cookie_bundle: t.cookie_bundle,
      headers_json: (t.headers_json ?? {}) as Record<string, string>,
      auth_user_index: t.auth_user_index ?? 0,
    });
    // Only mark expired when the probe conclusively saw Google reject the
    // session. Inconclusive results (relay/proxy fault, transient) become
    // "stale" so a subsequent fire still uses the template — no more good
    // cookies being nuked because the proxy blinked.
    const status = probe.signedIn ? "fresh" : probe.conclusive ? "expired" : "stale";

    await supabaseAdmin
      .from("fake_review_templates")
      .update({
        status,
        last_verified_at: new Date().toISOString(),
        last_error: probe.signedIn ? null : probe.reason,
      })
      .eq("id", t.id);

    return { ok: true, status, http_status: null, latency_ms: Date.now() - started };
  });

/**
 * Parse a cookies.txt (Netscape format) or a `key=value; key=value` cookie
 * header string. Returns a Map preserving the most recent value seen.
 */
function parseCookieText(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const text = raw.replace(/\r\n?/g, "\n").trim();
  // JSON array format (EditThisCookie / Cookie-Editor export):
  // [{ "name": "SID", "value": "...", "domain": ".google.com", ... }, ...]
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
            // Later entries win: exports list host-specific cookies after
            // domain-wide ones, and the host-specific value is the live one.
            if (name) map.set(name, value);
          }
        }
        if (map.size > 0) return map;
      }
    } catch {
      // Not valid JSON — fall through to the other formats.
    }
  }
  // Netscape format: lines of 7 tab-separated columns (domain, flag, path,
  // secure, expiration, name, value). Skip comments and blank lines.
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
  // Fall back to a raw Cookie header: `k=v; k2=v2` (may span multiple lines).
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

/**
 * Canonical Google Maps "Report review" request shape. Used as a synthetic
 * base when the templates table is empty, so admins/users can seed the very
 * first account by uploading cookies (no capture extension required).
 * The per-shot code mints a fresh `at` XSRF token from each account's cookies
 * before firing, so the placeholder token here is intentional.
 */
function canonicalBaseTemplate(): {
  endpoint_url: string;
  method: string;
  body_template: string;
  body_kind: "form";
  headers_json: Record<string, string>;
} {
  const endpoint_url =
    "https://www.google.com/_/LocalUserPostsRapUi/data/batchexecute" +
    "?rpcids=qVL8Rd&source-path=%2Flocal%2Fcontent%2Frap%2Freport%2Fsubmit" +
    "&hl=en&soc-app=162&soc-platform=1&soc-device=1&rt=c";
  // inner[3] = review id, inner[6] = free-text note, inner[7] = reason enum.
  // Numeric placeholders (0 / 1) here — rewriteBatchExecuteBody swaps them
  // per shot with the order's real review id + reason. If the swap ever
  // fails, sending a numeric 1 is still a well-formed request (reason
  // "off-topic / low quality") that Google won't reject on shape alone.
  const inner = JSON.stringify([
    null, null, null, "{{REVIEW_ID}}", 286732320, 1, "", 1,
  ]);
  const outer = JSON.stringify([[["qVL8Rd", inner, null, "generic"]]]);
  const params = new URLSearchParams();
  params.set("f.req", outer);
  params.set("at", "PLACEHOLDER");
  return {
    endpoint_url,
    method: "POST",
    body_template: params.toString(),
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

/**
 * Create a template from a pasted or uploaded cookies.txt.
 *
 * Reuses the endpoint URL, method, body template, and non-cookie headers
 * from the most recent existing template (all captured Google reports share
 * the same batchexecute endpoint). The Cookie header is rebuilt from the
 * uploaded file. Requires at least one of SAPISID / __Secure-1PAPISID /
 * __Secure-3PAPISID — without it Google refuses the request.
 */
export const addTemplateFromCookies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        label: z.string().min(1).max(120),
        google_email: z.string().email().optional().nullable(),
        auth_user_index: z.number().int().min(0).max(9).optional(),
        cookie_text: z.string().min(20).max(200_000),
        notes: z.string().max(500).optional().nullable(),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertSection(context);
    const cookies = parseCookieText(data.cookie_text);
    if (cookies.size === 0) throw new Error("Could not parse any cookies from that file.");
    const sapisid =
      cookies.get("SAPISID") ||
      cookies.get("__Secure-1PAPISID") ||
      cookies.get("__Secure-3PAPISID");
    if (!sapisid) {
      throw new Error(
        "No SAPISID / __Secure-1PAPISID / __Secure-3PAPISID cookie found — the session cannot authenticate.",
      );
    }
    const cookieBundle = Array.from(cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: baseErr } = await supabaseAdmin
      .from("fake_review_templates")
      .select("endpoint_url,method,body_template,body_kind,headers_json")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (baseErr) throw new Error(baseErr.message);
    const base = existing ?? canonicalBaseTemplate();

    const headers = { ...((base.headers_json ?? {}) as Record<string, string>) };
    // Normalize any existing cookie header to a single "Cookie" entry.
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "cookie") delete headers[k];
    }
    headers["Cookie"] = cookieBundle;

    const authuserMatch = /[?&]authuser=(\d+)/.exec(base.endpoint_url);
    const currentAuthUser = authuserMatch ? Number(authuserMatch[1]) : 0;
    const targetAuthUser = data.auth_user_index ?? currentAuthUser;
    const endpoint_url =
      targetAuthUser === currentAuthUser
        ? base.endpoint_url
        : base.endpoint_url.replace(/([?&]authuser=)\d+/, `$1${targetAuthUser}`);

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("fake_review_templates")
      .insert({
        label: data.label,
        google_email: data.google_email ?? null,
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
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { ok: true, id: inserted.id, cookies_parsed: cookies.size };
  });

/**
 * Bulk-create templates from multiple cookies.txt uploads in one call.
 *
 * Fetches the base template once, then parses + inserts each file. Files
 * missing the required SAPISID cookie are reported as failures rather than
 * aborting the whole batch, so one bad file doesn't block the rest.
 */
export const addTemplatesFromCookiesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        auth_user_index: z.number().int().min(0).max(9).optional(),
        google_email_prefix: z.string().max(120).optional().nullable(),
        tag: z.string().trim().min(1).max(40).regex(/^[^\]\[]+$/, "Tag can't contain brackets"),
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
    await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: baseErr } = await supabaseAdmin
      .from("fake_review_templates")
      .select("endpoint_url,method,body_template,body_kind,headers_json")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (baseErr) throw new Error(baseErr.message);
    const base = existing ?? canonicalBaseTemplate();

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

    const added: { label: string; cookies_parsed: number }[] = [];
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
        const hasSid = cookies.has("SID") || cookies.has("__Secure-1PSID") || cookies.has("__Secure-3PSID");
        const hint = hasSid
          ? "Session cookies found but SAPISID/__Secure-1PAPISID/__Secure-3PAPISID are missing — re-export from a fully signed-in google.com tab (open mail.google.com first, then export)."
          : "This export is from a SIGNED-OUT Google session (only anti-bot cookies present, no SID/SAPISID). Sign in to the Google account on google.com first, then export cookies again.";
        failed.push({ label: item.label, error: hint });
        continue;
      }
      const cookieBundle = Array.from(cookies.entries())
        .map(([k, val]) => `${k}=${val}`)
        .join("; ");
      const headers = { ...baseHeaders, Cookie: cookieBundle };
      const google_email =
        data.google_email_prefix?.trim()
          ? `${data.google_email_prefix.trim()}+${item.label.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}@gmail.com`
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
      if (insErr) {
        failed.push({ label: item.label, error: insErr.message });
      } else {
        added.push({ label: item.label, cookies_parsed: cookies.size });
      }
    }

    return {
      added: added.length,
      failed,
      total: data.items.length,
      added_items: added,
    };
  });

/* --------------------------------- orders --------------------------------- */

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let oq = supabaseAdmin
      .from("fake_review_orders")
      .select(
        "id,name,target_url,canonical_url,feature_id,review_id,reason_code,comment_tag,shots_per_template,template_ids,status,created_at,fired_at,done_at",
      )
      .order("created_at", { ascending: false });
    oq = scopeToOwner(oq, access.isAdmin, access.userId);
    const { data: orders, error } = await oq;
    if (error) throw new Error(error.message);
    const orderIds = (orders ?? []).map((o: any) => o.id);
    let shots: any[] = [];
    if (orderIds.length > 0) {
      const { data: sh, error: shotsErr } = await supabaseAdmin
        .from("fake_review_shots")
        .select("order_id,http_status,error")
        .in("order_id", orderIds);
      if (shotsErr) throw new Error(shotsErr.message);
      shots = sh ?? [];
    }
    return (orders ?? []).map((o: any): FakeOrderSummary => {
      const rows = shots.filter((s: any) => s.order_id === o.id);
      const ok = rows.filter((r: any) => r.http_status && r.http_status < 400).length;
      const err = rows.length - ok;
      return { ...o, shots_total: rows.length, shots_ok: ok, shots_err: err };
    });
  });

export const createOrder = createServerFn({ method: "POST" })
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
          // legacy aliases still accepted
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
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Non-admins can only build orders from templates they own; admins can
    // pool anyone's templates (including shared/null-owner captures).
    let tOwnerQ = supabaseAdmin
      .from("fake_review_templates")
      .select("id")
      .in("id", data.template_ids);
    tOwnerQ = scopeToOwner(tOwnerQ, access.isAdmin, access.userId);
    const { data: ownedTpls, error: ownedErr } = await tOwnerQ;
    if (ownedErr) throw new Error(ownedErr.message);
    if ((ownedTpls?.length ?? 0) !== data.template_ids.length) {
      throw new Error("One or more selected templates are not yours");
    }
    const { resolveProfileTarget } = await import("@/lib/profile-report.server");
    const resolved = await resolveProfileTarget(data.target_url);
    if (!resolved.ok || !resolved.canonical_url) {
      throw new Error(resolved.error || "Could not resolve target URL");
    }
    const featureId = resolved.place_id ?? null;
    const reviewMatch = resolved.canonical_url.match(/!2m5!1s([A-Za-z0-9_-]{15,})/);
    const reviewId = reviewMatch?.[1] ?? null;
    if (!reviewId) throw new Error("Target URL is missing a review id — open the specific review and copy its share link.");

    const { data: row, error } = await supabaseAdmin
      .from("fake_review_orders")
      .insert({
        name: data.name,
        target_url: data.target_url,
        canonical_url: resolved.canonical_url,
        feature_id: featureId,
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

export const getOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let oq = supabaseAdmin
      .from("fake_review_orders")
      .select(
        "id,name,target_url,canonical_url,feature_id,review_id,reason_code,comment_tag,shots_per_template,template_ids,status,created_at,fired_at,done_at,note",
      )
      .eq("id", data.id);
    oq = scopeToOwner(oq, access.isAdmin, access.userId);
    const { data: order, error } = await oq.maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { order: null, shots: [] as FakeShotRow[] };

    const { data: shots, error: shotsErr } = await supabaseAdmin
      .from("fake_review_shots")
      .select("id,template_id,sequence,http_status,latency_ms,error,fired_at,response_snippet")
      .eq("order_id", data.id)
      .order("fired_at", { ascending: true })
      .limit(4000);
    if (shotsErr) throw new Error(shotsErr.message);

    return { order, shots: (shots ?? []) as FakeShotRow[] };
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("fake_review_orders")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    q = scopeToOwner(q, access.isAdmin, access.userId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("fake_review_orders").delete().eq("id", data.id);
    q = scopeToOwner(q, access.isAdmin, access.userId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/**
 * Fires one wave for an order. Because a single Worker request has a
 * subrequest cap, we accept a `wave` window and let the client trigger it
 * repeatedly until all shots are done. Each call:
 *   1. Loads the order + only the templates in its pool that are 'fresh'.
 *   2. Fires up to `max` shots (chunked with Promise.allSettled).
 *   3. Records every result in fake_review_shots and updates counters.
 */
export const fireOrderWave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid(), max: z.number().int().min(1).max(200).default(120) }).parse(v),
  )
  .handler(async ({ context, data }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ownership check before firing: non-admins can only fire their own orders.
    let oq = supabaseAdmin.from("fake_review_orders").select("id").eq("id", data.id);
    oq = scopeToOwner(oq, access.isAdmin, access.userId);
    const { data: owned, error: ownErr } = await oq.maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    if (!owned) throw new Error("Order not found");
    const { fireOrderCore } = await import("@/lib/fake-reviews-fire.server");
    return fireOrderCore(supabaseAdmin, data.id, data.max);
  });


/* --------------------------- dashboard kpi rollup ------------------------- */

export const fakeReviewsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await assertSection(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tplQ = scopeToOwner(
      supabaseAdmin.from("fake_review_templates").select("status,shots_fired,created_by"),
      access.isAdmin,
      access.userId,
    );
    const ordQ = scopeToOwner(
      supabaseAdmin.from("fake_review_orders").select("id,status"),
      access.isAdmin,
      access.userId,
    );
    const [{ data: tpls }, { data: orders }] = await Promise.all([tplQ, ordQ]);
    const orderIds = (orders ?? []).map((o: any) => o.id);
    let shots: any[] = [];
    if (access.isAdmin) {
      const { data: sh } = await supabaseAdmin
        .from("fake_review_shots")
        .select("http_status,fired_at");
      shots = sh ?? [];
    } else if (orderIds.length > 0) {
      const { data: sh } = await supabaseAdmin
        .from("fake_review_shots")
        .select("http_status,fired_at")
        .in("order_id", orderIds);
      shots = sh ?? [];
    }
    const templates = tpls ?? [];
    const orderRows = orders ?? [];
    const shotRows = shots;
    const now = Date.now();
    const last24 = shotRows.filter((s: any) => now - new Date(s.fired_at).getTime() < 86400000);
    return {
      templates: {
        total: templates.length,
        fresh: templates.filter((t: any) => t.status === "fresh").length,
        stale: templates.filter((t: any) => t.status === "stale").length,
        expired: templates.filter((t: any) => t.status === "expired").length,
        disabled: templates.filter((t: any) => t.status === "disabled").length,
      },
      orders: {
        total: orderRows.length,
        firing: orderRows.filter((o: any) => o.status === "firing").length,
        done: orderRows.filter((o: any) => o.status === "done").length,
        cancelled: orderRows.filter((o: any) => o.status === "cancelled").length,
      },
      shots: {
        total: shotRows.length,
        ok: shotRows.filter((s: any) => s.http_status && s.http_status < 400).length,
        err: shotRows.filter((s: any) => !s.http_status || s.http_status >= 400).length,
        last24: last24.length,
      },
    };
  });

/* -------------------------------- drip feed ------------------------------- */

export const startDrip = createServerFn({ method: "POST" })
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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("fake_review_orders")
      .select("status,fired_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");
    if (order.status === "done" || order.status === "cancelled") throw new Error(`Order is ${order.status}`);
    const now = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("fake_review_orders")
      .update({ status: `drip:${data.min_sec}:${data.max_sec}`, done_at: now, fired_at: order.fired_at ?? now })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const pauseDrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fake_review_orders")
      .update({ status: "paused", done_at: null })
      .eq("id", data.id)
      .like("status", "drip:%");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
