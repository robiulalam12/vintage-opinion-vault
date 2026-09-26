import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Ctx = { supabase: any; userId: string };

async function assertUser(context: Ctx) {
  const { data: active, error } = await (context.supabase as any).rpc("has_active_key", {
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  if (!active) throw new Error("Your access key is not active. Activate it in Settings.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  context.supabase = supabaseAdmin;
}

/* -------------------- Types -------------------- */

export interface UserReviewOrder {
  id: string;
  name: string;
  note: string | null;
  status: string;
  created_at: string;
  reviewer_profile_id: string | null;
  dmca_template_id: string | null;
  dmca_url_mode: string;
  dmca_delay_min_seconds: number;
  dmca_delay_max_seconds: number;
  dmca_next_allowed_at: string | null;
  total: number;
  fetched: number;
  published: number;
  failed: number;
}

export interface UserReviewSource {
  id: string;
  order_id: string;
  url: string;
  label: string | null;
  status: string;
  error: string | null;
  review_text: string | null;
  review_headline: string | null;
  rating: number | null;
  business_name: string | null;
  reviewer_name: string | null;
  review_published_at: string | null;
  review_age_label: string | null;
  fetched_at: string | null;
  published_review_id: string | null;
  published_slug: string | null;
  published_path: string | null;
  published_review_date: string | null;
  date_fallback: boolean;
  dmca_publication_date: string | null;
  dmca_original_link: string | null;
  dmca_generated_at: string | null;
  dmca_report_id: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  screenshot_status: string;
  screenshot_error: string | null;
  screenshot_at: string | null;
  created_at: string;
  updated_at: string;
}

const SOURCE_COLS =
  "id, order_id, url, label, status, error, review_text, review_headline, rating, business_name, reviewer_name, review_published_at, review_age_label, fetched_at, published_review_id, published_slug, published_path, published_review_date, date_fallback, dmca_publication_date, dmca_original_link, dmca_generated_at, dmca_report_id, drive_file_id, drive_url, screenshot_status, screenshot_error, screenshot_at, created_at, updated_at";

function summarise(rows: { status: string; review_text: string | null; published_review_id: string | null }[]) {
  let fetched = 0, published = 0, failed = 0;
  for (const s of rows) {
    if (s.published_review_id) published++;
    if ((s.review_text ?? "").trim().length > 0) fetched++;
    if (s.status === "failed" || s.status === "empty") failed++;
  }
  return { total: rows.length, fetched, published, failed };
}

/* -------------------- Orders CRUD -------------------- */

export const listMyReviewOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertUser(context as Ctx);
    const { data: orders, error } = await context.supabase
      .from("user_review_orders")
      .select(
        "id, name, note, status, created_at, reviewer_profile_id, dmca_template_id, dmca_url_mode, dmca_delay_min_seconds, dmca_delay_max_seconds, dmca_next_allowed_at",
      )
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (orders ?? []).map((o: any) => o.id);
    let bySrc: Record<string, any[]> = {};
    if (ids.length) {
      const { data: srcs } = await context.supabase
        .from("user_review_sources")
        .select("order_id, status, review_text, published_review_id")
        .in("order_id", ids);
      for (const s of srcs ?? []) {
        (bySrc[s.order_id] ??= []).push(s);
      }
    }
    return (orders ?? []).map((o: any) => ({ ...o, ...summarise(bySrc[o.id] ?? []) })) as UserReviewOrder[];
  });

export const getMyReviewOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { data: order, error } = await context.supabase
      .from("user_review_orders")
      .select(
        "id, name, note, status, created_at, reviewer_profile_id, dmca_template_id, dmca_url_mode, dmca_delay_min_seconds, dmca_delay_max_seconds, dmca_next_allowed_at, dmca_rereport_count, owner_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order || order.owner_id !== context.userId) return { order: null };
    let reviewerProfileName: string | null = null;
    if (order.reviewer_profile_id) {
      const { data: profile, error: profileError } = await context.supabase
        .from("user_reviewer_profiles")
        .select("name")
        .eq("id", order.reviewer_profile_id)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      reviewerProfileName = profile?.name ?? null;
    }
    return { order: { ...order, reviewer_profile_name: reviewerProfileName } };
  });

export const createMyReviewOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        note: z.string().trim().max(400).optional().default(""),
        reviewerProfileId: z.string().uuid().nullable().optional().default(null),
        templateId: z.string().uuid().nullable().optional().default(null),
        links: z
          .array(
            z.object({
              url: z.string().trim().url(),
              label: z.string().trim().max(120).optional().default(""),
            }),
          )
          .max(500)
          .optional()
          .default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    if (data.reviewerProfileId) {
      const { data: owned } = await context.supabase
        .from("user_reviewer_profiles")
        .select("id")
        .eq("id", data.reviewerProfileId)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (!owned) throw new Error("That reviewer profile does not belong to you.");
    }
    const { data: order, error } = await context.supabase
      .from("user_review_orders")
      .insert({
        owner_id: context.userId,
        name: data.name,
        note: data.note || null,
        status: "active",
        reviewer_profile_id: data.reviewerProfileId,
        dmca_template_id: data.templateId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    let added = 0, skipped = 0;
    const seen = new Set<string>();
    for (const link of data.links) {
      const key = link.url.toLowerCase();
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      const { error: iErr } = await context.supabase.from("user_review_sources").insert({
        owner_id: context.userId,
        order_id: order.id,
        url: link.url,
        label: link.label || null,
        status: "pending",
      });
      if (iErr) skipped++; else added++;
    }
    return { id: order.id, added, skipped };
  });

export const deleteMyReviewOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { data: srcs } = await context.supabase
      .from("user_review_sources")
      .select("published_review_id")
      .eq("order_id", data.id)
      .eq("owner_id", context.userId);
    const reviewIds = (srcs ?? []).map((s: any) => s.published_review_id).filter(Boolean);
    if (reviewIds.length) {
      await context.supabase.from("user_reviews").delete().in("id", reviewIds).eq("owner_id", context.userId);
    }
    const { error } = await context.supabase
      .from("user_review_orders")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Order settings -------------------- */

export const setMyOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), templateId: z.string().uuid().nullable() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { error } = await context.supabase
      .from("user_review_orders")
      .update({ dmca_template_id: data.templateId })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMyOrderDmcaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        urlMode: z.enum(["review", "drive"]),
        delayMin: z.coerce.number().int().min(0).max(7200),
        delayMax: z.coerce.number().int().min(0).max(7200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    if (data.delayMax < data.delayMin) throw new Error("Max delay must be ≥ min delay.");
    const { error } = await context.supabase
      .from("user_review_orders")
      .update({
        dmca_url_mode: data.urlMode,
        dmca_delay_min_seconds: data.delayMin,
        dmca_delay_max_seconds: data.delayMax,
      })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Sources -------------------- */

export const listMyReviewSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { data: rows, error } = await context.supabase
      .from("user_review_sources")
      .select(SOURCE_COLS)
      .eq("order_id", data.orderId)
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as UserReviewSource[];
  });

export const addMyReviewSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        links: z
          .array(z.object({ url: z.string().trim().url(), label: z.string().trim().max(120).optional().default("") }))
          .min(1)
          .max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { data: order } = await context.supabase
      .from("user_review_orders")
      .select("id")
      .eq("id", data.orderId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!order) throw new Error("Order not found.");
    let added = 0, duplicates = 0;
    const seen = new Set<string>();
    for (const l of data.links) {
      const k = l.url.toLowerCase();
      if (seen.has(k)) { duplicates++; continue; }
      seen.add(k);
      const { error } = await context.supabase.from("user_review_sources").insert({
        owner_id: context.userId,
        order_id: data.orderId,
        url: l.url,
        label: l.label || null,
        status: "pending",
      });
      if (!error) added++; else duplicates++;
    }
    return { added, duplicates };
  });

export const deleteMyReviewSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { error } = await context.supabase
      .from("user_review_sources")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetMyReviewSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { error } = await context.supabase
      .from("user_review_sources")
      .update({ status: "pending", error: null })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyFailedSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { data: rows } = await context.supabase
      .from("user_review_sources")
      .select("id, review_text, published_review_id, status")
      .eq("order_id", data.orderId)
      .eq("owner_id", context.userId)
      .in("status", ["failed", "empty"]);
    const ids = (rows ?? [])
      .filter((r: any) => !r.published_review_id && !(r.review_text ?? "").trim())
      .map((r: any) => r.id);
    if (!ids.length) return { removed: 0 };
    const { error } = await context.supabase
      .from("user_review_sources")
      .delete()
      .in("id", ids)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { removed: ids.length };
  });

/* -------------------- Fetch text -------------------- */

export const fetchMySourceBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        limit: z.coerce.number().int().min(1).max(30).optional().default(10),
        retryFailed: z.boolean().optional().default(false),
        fallback: z.boolean().optional().default(true),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const sb = context.supabase;
    const q = sb
      .from("user_review_sources")
      .select("id, url, label")
      .eq("order_id", data.orderId)
      .eq("owner_id", context.userId);
    if (data.retryFailed) q.in("status", ["failed", "empty", "pending", "fetching"]);
    else q.in("status", ["pending", "fetching"]);
    const { data: pending, error } = await q.order("created_at", { ascending: true }).limit(data.limit);
    if (error) throw new Error(error.message);
    const batch = pending ?? [];
    if (!batch.length) return { processed: 0, imported: 0, failed: 0, remaining: 0 };

    await sb
      .from("user_review_sources")
      .update({ status: "fetching", error: null })
      .in("id", batch.map((s: any) => s.id));

    const { fetchReviewRaw } = await import("@/lib/review-age.server");
    const { headlineFromBody } = await import("@/lib/review-publish.server");
    let imported = 0, failed = 0;
    let cursor = 0;
    const worker = async (slot: number) => {
      await new Promise((r) => setTimeout(r, slot * 250));
      while (cursor < batch.length) {
        const src = batch[cursor++]!;
        const now = new Date().toISOString();
        try {
          let body = "", reviewerName: string | null = null, rating: number | null = null;
          let publishedAt: string | null = null, ageLabel: string | null = null, businessName: string | null = null;
          try {
            const r = await fetchReviewRaw(src.url);
            body = r.text ?? "";
            reviewerName = r.reviewer_name ?? null;
            rating = r.rating ?? null;
            publishedAt = r.published_at ?? null;
            ageLabel = r.age_label ?? null;
            businessName = r.business_name ?? null;
            if (!body.trim()) throw new Error("Google returned no review text.");
          } catch (rpcError) {
            if (!data.fallback) throw rpcError;
            const { fetchPageText, extractReviews } = await import("@/lib/review-scrape.server");
            const { text, title } = await fetchPageText(src.url);
            const reviews = await extractReviews(text, src.label || title, src.url);
            const best = [...reviews].sort((a, b) => b.body.length - a.body.length)[0];
            if (!best) throw rpcError;
            body = best.body;
            rating = rating ?? best.rating;
            const subj = best.subject?.trim();
            if (subj && subj !== (src.label || title)?.trim()) businessName = subj.slice(0, 120);
          }
          if (!publishedAt) {
            await new Promise((r) => setTimeout(r, 800));
            try {
              const again = await fetchReviewRaw(src.url);
              publishedAt = again.published_at ?? null;
              ageLabel = ageLabel ?? again.age_label ?? null;
              reviewerName = reviewerName ?? again.reviewer_name ?? null;
            } catch {}
          }
          if (!body.trim()) throw new Error("No review text could be read.");
          imported++;
          await sb.from("user_review_sources").update({
            status: "done",
            error: null,
            review_text: body,
            review_headline: headlineFromBody(body),
            rating,
            reviewer_name: reviewerName,
            review_published_at: publishedAt,
            review_age_label: ageLabel,
            ...(businessName ? { business_name: businessName } : {}),
            fetched_at: now,
          }).eq("id", src.id);
        } catch (e) {
          failed++;
          const msg = (e as Error).message.slice(0, 400);
          await sb.from("user_review_sources").update({
            status: "failed",
            error: msg,
            fetched_at: now,
          }).eq("id", src.id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, batch.length) }, (_, s) => worker(s)));

    const { count } = await sb
      .from("user_review_sources")
      .select("id", { count: "exact", head: true })
      .eq("order_id", data.orderId)
      .eq("owner_id", context.userId)
      .in("status", data.retryFailed ? ["failed", "empty", "pending", "fetching"] : ["pending", "fetching"]);
    return { processed: batch.length, imported, failed, remaining: count ?? 0 };
  });

export const refetchMyGoogleDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { data: src, error } = await context.supabase
      .from("user_review_sources")
      .select("id, url, reviewer_name")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    const { fetchReviewRaw } = await import("@/lib/review-age.server");
    try {
      const r = await fetchReviewRaw(src.url);
      if (!r.published_at) return { ok: false as const, error: "Google did not return a date." };
      await context.supabase
        .from("user_review_sources")
        .update({
          review_published_at: r.published_at,
          review_age_label: r.age_label ?? null,
          reviewer_name: r.reviewer_name ?? src.reviewer_name,
        })
        .eq("id", src.id);
      return { ok: true as const, publishedAt: r.published_at };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const updateMySourceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        review_text: z.string().trim().max(4000).optional(),
        rating: z.coerce.number().int().min(1).max(5).optional(),
        business_name: z.string().trim().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const patch: any = {};
    if (data.review_text !== undefined) patch.review_text = data.review_text || null;
    if (data.rating !== undefined) patch.rating = data.rating;
    if (data.business_name !== undefined) patch.business_name = data.business_name || null;
    const { error } = await context.supabase
      .from("user_review_sources")
      .update(patch)
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Publish to user reviewer profile -------------------- */

function slugifyReview(v: string) {
  return (
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "review"
  );
}

export const publishMySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const sb = context.supabase;
    const { data: src, error } = await sb
      .from("user_review_sources")
      .select(
        "id, url, review_text, review_headline, rating, business_name, review_published_at, order_id, published_review_id, owner_id",
      )
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    if (src.published_review_id) throw new Error("Already published.");
    const body = (src.review_text ?? "").trim();
    if (body.length < 20) throw new Error("Fetch the review text first.");

    const { data: order } = await sb
      .from("user_review_orders")
      .select("reviewer_profile_id")
      .eq("id", src.order_id)
      .maybeSingle();
    const profileId = order?.reviewer_profile_id;
    if (!profileId) throw new Error("Pick a reviewer profile for this order first.");
    const { data: profile } = await sb
      .from("user_reviewer_profiles")
      .select("id, slug")
      .eq("id", profileId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("Reviewer profile not found.");

    const { dummyBusinessName, backdatedFromSourceDate, headlineFromBody } = await import(
      "@/lib/review-publish.server"
    );
    const business = src.business_name?.trim() || dummyBusinessName();
    const headline = ((src.review_headline ?? "").trim() || headlineFromBody(body)).slice(0, 140);
    const { date: reviewDate, fallback } = backdatedFromSourceDate(src.review_published_at);

    const base = slugifyReview(`${business}-${headline}`);
    let slug = base;
    let inserted: { id: string; slug: string } | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const trySlug = attempt === 0 ? base : `${base}-${Math.floor(Math.random() * 9999)}`;
      const { data: row, error: iErr } = await sb
        .from("user_reviews")
        .insert({
          owner_id: context.userId,
          reviewer_profile_id: profile.id,
          slug: trySlug,
          headline,
          body,
          subject: business,
          rating: src.rating ?? 5,
          review_date: reviewDate,
          published: true,
        })
        .select("id, slug")
        .single();
      if (!iErr) { inserted = row; slug = row.slug; break; }
      const dup = iErr.code === "23505" || /duplicate/i.test(iErr.message);
      if (!dup) throw new Error(iErr.message);
    }
    if (!inserted) throw new Error("Could not allocate a unique slug.");

    const path = `/${profile.slug}/${inserted.slug}`;
    await sb.from("user_review_sources").update({
      published_review_id: inserted.id,
      published_slug: inserted.slug,
      published_path: path,
      published_review_date: reviewDate,
      date_fallback: fallback,
      business_name: business,
      status: "published",
    }).eq("id", src.id);

    return { id: inserted.id, slug, path, reviewDate, fallback };
  });

/* -------------------- Screenshot -------------------- */

const SCREENSHOT_SITE = "https://peopleopinionbox.com";

export const screenshotMySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const sb = context.supabase;
    const { data: src, error } = await sb
      .from("user_review_sources")
      .select("id, published_path, published_slug, drive_file_id, order_id")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    if (!src.published_path) return { ok: false as const, error: "Publish this review first." };
    let orderName = "User order";
    if (src.order_id) {
      const { data: o } = await sb.from("user_review_orders").select("name").eq("id", src.order_id).maybeSingle();
      if (o?.name) orderName = o.name;
    }
    await sb.from("user_review_sources").update({ screenshot_status: "pending", screenshot_error: null }).eq("id", src.id);
    try {
      const { screenshotToDrive, deleteDriveFile } = await import("@/lib/review-screenshot.server");
      const r = await screenshotToDrive(
        `${SCREENSHOT_SITE}${src.published_path}`,
        `${src.published_slug ?? src.id}.png`,
        orderName,
      );
      if (src.drive_file_id && src.drive_file_id !== r.fileId) {
        await deleteDriveFile(src.drive_file_id).catch(() => {});
      }
      await sb.from("user_review_sources").update({
        drive_file_id: r.fileId,
        drive_url: r.url,
        screenshot_status: "done",
        screenshot_error: null,
        screenshot_at: new Date().toISOString(),
      }).eq("id", src.id);
      return { ok: true as const, url: r.url };
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      await sb.from("user_review_sources").update({ screenshot_status: "failed", screenshot_error: msg }).eq("id", src.id);
      return { ok: false as const, error: msg };
    }
  });

/* -------------------- DMCA sync -------------------- */

export const syncMyOrderDmca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orderId: z.string().uuid(), siteUrl: z.string().url() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const sb = context.supabase;
    const base = data.siteUrl.replace(/\/+$/, "");
    const { data: order, error: oErr } = await sb
      .from("user_review_orders")
      .select("id, name, reviewer_profile_id, dmca_template_id, dmca_url_mode, dmca_delay_min_seconds, dmca_delay_max_seconds, dmca_next_allowed_at")
      .eq("id", data.orderId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Order not found.");

    let ourReviewerName: string | null = null;
    if (order.reviewer_profile_id) {
      const { data: profile, error: profileError } = await sb
        .from("user_reviewer_profiles")
        .select("name")
        .eq("id", order.reviewer_profile_id)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      ourReviewerName = profile?.name ?? null;
    }

    let templateBody: string | null = null;
    let templateName: string | null = null;
    if (order.dmca_template_id) {
      const { data: t } = await sb
        .from("dmca_templates")
        .select("id, name, body, source, created_by")
        .eq("id", order.dmca_template_id)
        .maybeSingle();
      if (t && (t.source === "admin" || t.created_by === context.userId)) {
        templateBody = t.body;
        templateName = t.name;
      }
    }

    const { data: rows, error } = await sb
      .from("user_review_sources")
      .select(
        "id, url, review_text, reviewer_name, review_published_at, review_age_label, published_review_id, published_slug, published_path, published_review_date, drive_url, dmca_report_id",
      )
      .eq("order_id", order.id)
      .eq("owner_id", context.userId)
      .not("published_review_id", "is", null);
    if (error) throw new Error(error.message);
    const published = rows ?? [];
    if (!published.length) return { updated: 0, skipped: 0, total: 0 };

    const { renderTemplate } = await import("@/lib/dmca-template");
    let updated = 0, skipped = 0;
    let nextAllowed = order.dmca_next_allowed_at ? new Date(order.dmca_next_allowed_at).getTime() : 0;
    const now = Date.now();

    for (const r of published) {
      const path = r.published_path;
      const date = r.published_review_date;
      if (!path || !date) { skipped++; continue; }
      const ourUrl = `${base}${path}`;
      const linkForNotice = order.dmca_url_mode === "drive" ? r.drive_url : ourUrl;
      if (order.dmca_url_mode === "drive" && !r.drive_url) { skipped++; continue; }

      let noticeText: string | null = null;
      if (templateBody) {
        const rendered = renderTemplate(templateBody, {
          url: r.url,
          reviewer_name: r.reviewer_name,
          review_published_at: r.review_published_at,
          review_text: r.review_text,
          archive_url: linkForNotice,
          archive_date: date,
          our_review_url: linkForNotice,
          our_publish_date: date,
          our_reviewer_name: ourReviewerName,
          drive_url: r.drive_url,
        });
        noticeText = rendered.text;
      }

      const payload = {
        owner_id: context.userId,
        google_url: r.url,
        our_url: ourUrl,
        drive_url: r.drive_url,
        reviewer_name: r.reviewer_name,
        review_text: r.review_text,
        publication_date: r.review_published_at ? r.review_published_at.slice(0, 10) : null,
        our_publish_date: date,
        template_id: order.dmca_template_id,
        notice_text: noticeText,
        status: "pending" as const,
        note: templateName ? `From order "${order.name}" · ${templateName}` : `From order "${order.name}"`,
        source_id: r.id,
      };

      if (r.dmca_report_id) {
        const { error: uErr } = await sb.from("user_dmca_reports").update(payload).eq("id", r.dmca_report_id).eq("owner_id", context.userId);
        if (uErr) throw new Error(uErr.message);
      } else {
        const { data: ins, error: iErr } = await sb.from("user_dmca_reports").insert(payload).select("id").single();
        if (iErr) throw new Error(iErr.message);
        await sb.from("user_review_sources").update({
          dmca_report_id: ins.id,
          dmca_publication_date: date,
          dmca_original_link: linkForNotice,
          dmca_generated_at: new Date().toISOString(),
        }).eq("id", r.id);
      }

      // Delay window between reports.
      const minMs = (order.dmca_delay_min_seconds ?? 0) * 1000;
      const maxMs = (order.dmca_delay_max_seconds ?? 0) * 1000;
      const jitter = maxMs > minMs ? Math.floor(Math.random() * (maxMs - minMs + 1)) : 0;
      const wait = minMs + jitter;
      if (wait > 0) nextAllowed = Math.max(now, nextAllowed) + wait;

      updated++;
    }

    if (nextAllowed) {
      await sb.from("user_review_orders").update({ dmca_next_allowed_at: new Date(nextAllowed).toISOString() }).eq("id", order.id);
    }
    return { updated, skipped, total: published.length };
  });

/* -------------------- Templates for order dialog -------------------- */

export const listMyOrderTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertUser(context as Ctx);
    const { data, error } = await context.supabase
      .from("dmca_templates")
      .select("id, name, body, source, created_by")
      .or(`and(source.eq.user,created_by.eq.${context.userId}),source.eq.admin`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((t: any) => ({
      id: t.id as string,
      name: (t.source === "admin" ? `${t.name} (default)` : t.name) as string,
      body: t.body as string,
    }));
  });

/* -------------------- Reviewer profiles helper (list only) -------------------- */

export type _Database = Database;

const MAX_USER_REREPORTS = 3;

/** Put the user's own order back in their extension queue. Max 3 times per order. */
export const rereportMyOrderDmca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await (supabaseAdmin as any)
      .from("user_review_orders")
      .select("id, owner_id, dmca_rereport_count")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order || order.owner_id !== context.userId) throw new Error("Order not found");
    const used = order.dmca_rereport_count ?? 0;
    if (used >= MAX_USER_REREPORTS) {
      throw new Error(`Re-report limit reached (${MAX_USER_REREPORTS} of ${MAX_USER_REREPORTS} used).`);
    }
    // Claim the slot first so double clicks can't exceed the limit.
    const { data: bumped, error: bumpError } = await (supabaseAdmin as any)
      .from("user_review_orders")
      .update({ dmca_rereport_count: used + 1, dmca_next_allowed_at: null })
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .eq("dmca_rereport_count", used)
      .select("id");
    if (bumpError) throw new Error(bumpError.message);
    if (!bumped?.length) throw new Error("Please try again.");

    await supabaseAdmin
      .from("user_dmca_reports")
      .update({ status: "failed", error: "Reset for re-report." })
      .eq("order_id", data.id)
      .eq("owner_id", context.userId)
      .in("status", ["claimed", "pending"]);
    const { data: rows, error: resetError } = await supabaseAdmin
      .from("user_review_sources")
      .update({ dmca_report_id: null, dmca_reported_at: null })
      .eq("order_id", data.id)
      .eq("owner_id", context.userId)
      .select("id");
    if (resetError) throw new Error(resetError.message);
    return { reset: rows?.length ?? 0, used: used + 1, max: MAX_USER_REREPORTS };
  });
