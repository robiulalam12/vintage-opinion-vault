import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ProfileOrder {
  id: string;
  name: string;
  note: string | null;
  created_at: string;
  total: number;
  captured: number;
  failed: number;
}

export interface ProfileTarget {
  id: string;
  order_id: string;
  url: string;
  canonical_url: string | null;
  place_id: string | null;
  status: string;
  error: string | null;
  reviewer_profile_url: string | null;
  contributor_id: string | null;
  captured_at: string | null;
  created_at: string;
}

const linkList = z
  .array(z.object({ url: z.string().trim().url(), label: z.string().trim().max(160).optional() }))
  .max(2000);

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listProfileOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const { data: orders, error } = await context.supabase
      .from("profile_orders")
      .select("id, name, note, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: targets, error: targetError } = await context.supabase
      .from("profile_targets")
      .select("order_id, status, reviewer_profile_url");
    if (targetError) throw new Error(targetError.message);

    return (orders ?? []).map((order: any): ProfileOrder => {
      const rows = (targets ?? []).filter((t: any) => t.order_id === order.id);
      return {
        id: order.id,
        name: order.name,
        note: order.note,
        created_at: order.created_at,
        total: rows.length,
        captured: rows.filter((r: any) => r.reviewer_profile_url).length,
        failed: rows.filter((r: any) => r.status === "failed").length,
      };
    });
  });

export const getProfileOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: order, error } = await context.supabase
      .from("profile_orders")
      .select("id, name, note, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");

    const { data: targets, error: targetError } = await context.supabase
      .from("profile_targets")
      .select(
        "id, order_id, url, canonical_url, place_id, status, error, reviewer_profile_url, contributor_id, captured_at, created_at",
      )
      .eq("order_id", data.id)
      .order("created_at", { ascending: true });
    if (targetError) throw new Error(targetError.message);

    return { order, targets: (targets ?? []) as ProfileTarget[] };
  });

export const createProfileOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        note: z.string().trim().max(300).optional().default(""),
        links: linkList.default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: order, error } = await context.supabase
      .from("profile_orders")
      .insert({ name: data.name, note: data.note || null, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const added = await insertTargets(context, order.id, data.links.map((l) => l.url));
    return { id: order.id as string, ...added };
  });

async function insertTargets(
  context: { supabase: any; userId: string },
  orderId: string,
  urls: string[],
) {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (unique.length === 0) return { added: 0, skipped: 0 };

  const { data: existing } = await context.supabase
    .from("profile_targets")
    .select("url")
    .eq("order_id", orderId);
  const seen = new Set((existing ?? []).map((r: any) => r.url));
  const fresh = unique.filter((u) => !seen.has(u));

  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200).map((url) => ({
      order_id: orderId,
      url,
      created_by: context.userId,
    }));
    const { error } = await context.supabase.from("profile_targets").insert(chunk);
    if (error) throw new Error(error.message);
  }

  return { added: fresh.length, skipped: unique.length - fresh.length };
}

export const addProfileTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), links: linkList }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return insertTargets(context, data.orderId, data.links.map((l) => l.url));
  });

export const deleteProfileOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("profile_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProfileTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("profile_targets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFailedProfileTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: removed, error } = await context.supabase
      .from("profile_targets")
      .delete()
      .eq("order_id", data.orderId)
      .eq("status", "failed")
      .select("id");
    if (error) throw new Error(error.message);
    return { removed: (removed ?? []).length };
  });

/** Manual override / paste-in of a reviewer profile URL. */
export const setProfileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), profileUrl: z.string().trim().max(400) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { normaliseProfileUrl } = await import("@/lib/profile-report.server");

    if (!data.profileUrl) {
      const { error } = await context.supabase
        .from("profile_targets")
        .update({
          reviewer_profile_url: null,
          contributor_id: null,
          captured_at: null,
          status: "queued",
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, url: null };
    }

    const parsed = normaliseProfileUrl(data.profileUrl);
    if (!parsed) throw new Error("That is not a Google profile URL or contributor id.");

    const { error } = await context.supabase
      .from("profile_targets")
      .update({
        reviewer_profile_url: parsed.url,
        contributor_id: parsed.contributorId,
        captured_at: new Date().toISOString(),
        status: "captured",
        error: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, url: parsed.url };
  });

/**
 * "Fetch reviewer" step. Resolves a batch of pending links to their canonical
 * review permalink + place id and queues them for profile capture. Returns
 * progress so the UI can loop until the order is done.
 */
export const resolveProfileBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        limit: z.coerce.number().int().min(1).max(60).default(30),
        retryFailed: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { resolveProfileTargets } = await import("@/lib/profile-report.server");

    const statuses = data.retryFailed ? ["pending", "failed"] : ["pending"];
    const { data: rows, error } = await context.supabase
      .from("profile_targets")
      .select("id, url")
      .eq("order_id", data.orderId)
      .in("status", statuses)
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const batch = (rows ?? []) as { id: string; url: string }[];
    let resolved = 0;
    let failed = 0;

    if (batch.length > 0) {
      const results = await resolveProfileTargets(batch.map((r) => r.url));
      await Promise.all(
        batch.map(async (row, index) => {
          const result = results[index]!;
          if (result.ok) {
            resolved += 1;
            await context.supabase
              .from("profile_targets")
              .update({
                canonical_url: result.canonical_url ?? null,
                place_id: result.place_id ?? null,
                ...(result.reviewer_profile_url
                  ? {
                      reviewer_profile_url: result.reviewer_profile_url,
                      contributor_id: result.contributor_id ?? null,
                      captured_at: new Date().toISOString(),
                    }
                  : {}),
                status: result.reviewer_profile_url ? "captured" : "queued",
                error: result.reviewer_profile_url
                  ? null
                  : "Resolved, but Google returned no reviewer id for this review.",
              })
              .eq("id", row.id);
          } else {
            failed += 1;
            await context.supabase
              .from("profile_targets")
              .update({ status: "failed", error: result.error ?? "Could not resolve link" })
              .eq("id", row.id);
          }
        }),
      );
    }

    const { data: all, error: allError } = await context.supabase
      .from("profile_targets")
      .select("status, reviewer_profile_url")
      .eq("order_id", data.orderId);
    if (allError) throw new Error(allError.message);

    const total = (all ?? []).length;
    const pending = (all ?? []).filter((r: any) => r.status === "pending").length;

    return {
      processed: batch.length,
      resolved,
      failed,
      remaining: pending,
      total,
      queued: (all ?? []).filter((r: any) => r.status === "queued").length,
      captured: (all ?? []).filter((r: any) => r.reviewer_profile_url).length,
    };
  });
