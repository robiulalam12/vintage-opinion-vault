import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export interface PublicReview {
  id: string;
  reviewer_name: string;
  reviewer_location: string | null;
  subject: string | null;
  headline: string;
  body: string;
  rating: number;
  review_date: string;
  slug: string | null;
}


const reviewInput = z.object({
  id: z.string().uuid().optional(),
  reviewer_name: z.string().trim().min(2).max(80),
  reviewer_location: z.string().trim().max(80).optional().or(z.literal("")),
  subject: z.string().trim().max(120).optional().or(z.literal("")),
  headline: z.string().trim().min(3).max(140),
  body: z.string().trim().min(20).max(4000),
  rating: z.coerce.number().int().min(1).max(5),
  review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  published: z.boolean(),
});

export type ReviewInput = z.infer<typeof reviewInput>;

/** Publicly readable, server-rendered so crawlers get the full review text. */
export const listPublicReviews = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data, error } = await client
    .from("reviews")
    .select(
      "id, reviewer_name, reviewer_location, subject, headline, body, rating, review_date, slug",
    )
    .eq("published", true)
    .order("review_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PublicReview[];
});

const publicSubmission = z.object({
  reviewer_name: z.string().trim().min(2).max(80),
  reviewer_location: z.string().trim().max(80).optional().default(""),
  subject: z.string().trim().max(120).optional().default(""),
  headline: z.string().trim().min(3).max(140),
  body: z.string().trim().min(20).max(4000),
  rating: z.coerce.number().int().min(1).max(5),
});

export type PublicSubmission = z.infer<typeof publicSubmission>;

/**
 * Visitor-submitted review. The date is set to today by the database
 * (CURRENT_DATE) and can never be supplied or changed by the client.
 * Submissions arrive unpublished and wait for editor approval.
 */
export const submitPublicReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicSubmission.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { error } = await client.rpc("submit_review", {
      _reviewer_name: data.reviewer_name,
      _reviewer_location: data.reviewer_location || "",
      _subject: data.subject || "",
      _headline: data.headline,
      _body: data.body,
      _rating: data.rating,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    return { isAdmin: Boolean(data) };
  });

export const listAllReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reviews")
      .select("*")
      .order("review_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const saveReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const row = {
      reviewer_name: data.reviewer_name,
      reviewer_location: data.reviewer_location || null,
      subject: data.subject || null,
      headline: data.headline,
      body: data.body,
      rating: data.rating,
      review_date: data.review_date,
      published: data.published,
    };

    if (data.id) {
      const { error } = await context.supabase.from("reviews").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: inserted, error } = await context.supabase
      .from("reviews")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const deleteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("reviews").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** One-time bootstrap: the first signed-in account becomes the editor. */

/** Editor-only: fetch a public CSV by URL so the browser is not blocked by CORS. */
export const fetchRemoteCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const target = new URL(data.url);
    if (target.protocol !== "https:") throw new Error("Only https links are allowed.");
    const response = await fetch(target.toString(), { redirect: "follow" });
    if (!response.ok) throw new Error(`Could not fetch the link (${response.status}).`);
    const csv = await response.text();
    if (csv.length > 500_000) throw new Error("That file is too large to import.");
    return { csv };
  });

/* ------------------------------------------------------------------ *
 * Google review links: saved as sources, then fetched 5 at a time.
 * ------------------------------------------------------------------ */

export interface ReviewSource {
  id: string;
  url: string;
  label: string | null;
  status: string;
  error: string | null;
  reviews_found: number;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
  review_text: string | null;
  review_headline: string | null;
  rating: number | null;
  business_name: string | null;
  published_review_id: string | null;
  published_profile_review_id: string | null;
  published_path: string | null;
  date_fallback: boolean;
  published_slug: string | null;
  published_review_date: string | null;
  dmca_publication_date: string | null;
  dmca_original_link: string | null;
  dmca_generated_at: string | null;

  order_id: string | null;
  reviewer_name: string | null;
  review_published_at: string | null;
  review_age_label: string | null;
  text_checked_at: string | null;
  text_error: string | null;
  archive_url: string | null;
  archive_date: string | null;
  drive_url: string | null;
  screenshot_status: string;
  screenshot_error: string | null;
}

export interface ReviewOrder {
  id: string;
  name: string;
  note: string | null;
  reviewer_key: string;
  created_at: string;
  total: number;
  fetched: number;
  published: number;
  failed: number;
}

const SOURCE_COLUMNS =
  "id, url, label, status, error, reviews_found, fetched_at, created_at, updated_at, review_text, review_headline, rating, business_name, published_review_id, published_profile_review_id, published_path, date_fallback, published_slug, published_review_date, dmca_publication_date, dmca_original_link, dmca_generated_at, order_id, reviewer_name, review_published_at, review_age_label, text_checked_at, text_error, archive_url, archive_date, drive_url, screenshot_status, screenshot_error";



export const listReviewSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ orderId: z.string().uuid().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase.from("review_sources").select(SOURCE_COLUMNS);
    if (data.orderId) query = query.eq("order_id", data.orderId);
    const { data: rows, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ReviewSource[];
  });

function summarise(
  sources: {
    status: string;
    review_text: string | null;
    published_review_id: string | null;
    published_profile_review_id?: string | null;
  }[],
) {
  let fetched = 0;
  let published = 0;
  let failed = 0;
  for (const s of sources) {
    if (s.published_review_id || s.published_profile_review_id) published++;
    if ((s.review_text ?? "").trim().length > 0) fetched++;
    if (s.status === "failed" || s.status === "empty") failed++;
  }
  return { total: sources.length, fetched, published, failed };
}

/** Orders (batches) with their live progress counts. */
export const listReviewOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: orders, error } = await context.supabase
      .from("review_orders")
      .select("id, name, note, reviewer_key, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: sources, error: sourcesError } = await context.supabase
      .from("review_sources")
      .select("order_id, status, review_text, published_review_id, published_profile_review_id");
    if (sourcesError) throw new Error(sourcesError.message);

    return (orders ?? []).map((order) => {
      const own = (sources ?? []).filter((s) => s.order_id === order.id);
      return { ...order, ...summarise(own) } as ReviewOrder;
    });
  });

export const getReviewOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("review_orders")
      .select(
        "id, name, note, reviewer_key, created_at, dmca_template_id, dmca_url_mode, dmca_delay_min_seconds, dmca_delay_max_seconds, dmca_next_allowed_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("This order no longer exists. It may have been deleted.");
    return order;
  });

export const createReviewOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        note: z.string().trim().max(400).optional().default(""),
        reviewerKey: z.enum(["robiul", "jonas", "benedikt"]).optional().default("robiul"),
        templateId: z.string().uuid().nullable().optional().default(null),
        links: z
          .array(z.object({ url: z.string().trim().url(), label: z.string().trim().max(120).optional().default("") }))
          .max(500)
          .optional()
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("review_orders")
      .insert({
        name: data.name,
        note: data.note || null,
        reviewer_key: data.reviewerKey,
        dmca_template_id: data.templateId,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);


    let added = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const link of data.links) {
      const key = link.url.toLowerCase();
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      const { error: insertError } = await context.supabase.from("review_sources").insert({
        url: link.url,
        label: link.label || null,
        status: "pending",
        created_by: context.userId,
        order_id: order.id,
      });
      if (insertError) skipped++;
      else added++;
    }

    return { id: order.id, added, skipped };
  });

export const deleteReviewOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // Remove every review this order published before deleting the order.
    const { data: srcs, error: sErr } = await sb
      .from("review_sources")
      .select("id, published_review_id, published_profile_review_id")
      .eq("order_id", data.id);
    if (sErr) throw new Error(sErr.message);
    const sourceIds = (srcs ?? []).map((s) => s.id);
    const reviewIds = (srcs ?? []).map((s) => s.published_review_id).filter(Boolean) as string[];
    const profileIds = (srcs ?? [])
      .map((s) => s.published_profile_review_id)
      .filter(Boolean) as string[];
    if (sourceIds.length) {
      const { error: uErr } = await sb
        .from("review_sources")
        .update({ published_review_id: null, published_profile_review_id: null })
        .in("id", sourceIds);
      if (uErr) throw new Error(uErr.message);
      const { error: rsErr } = await sb.from("reviews").delete().in("source_id", sourceIds);
      if (rsErr) throw new Error(rsErr.message);
    }
    if (reviewIds.length) {
      const { error: rErr } = await sb.from("reviews").delete().in("id", reviewIds);
      if (rErr) throw new Error(rErr.message);
    }
    if (profileIds.length) {
      const { error: pErr } = await sb.from("robiul_reviews").delete().in("id", profileIds);
      if (pErr) throw new Error(pErr.message);
    }
    const { error } = await sb.from("review_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


const sourceListInput = z.object({
  orderId: z.string().uuid().optional(),
  links: z
    .array(
      z.object({
        url: z.string().trim().url(),
        label: z.string().trim().max(120).optional().default(""),
      }),
    )
    .min(1)
    .max(500),
});

export const addReviewSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sourceListInput.parse(input))
  .handler(async ({ data, context }) => {
    const seen = new Set<string>();
    const rows = data.links
      .filter((l) => {
        const key = l.url.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((l) => ({
        url: l.url,
        label: l.label || null,
        status: "pending",
        created_by: context.userId,
        ...(data.orderId ? { order_id: data.orderId } : {}),
      }));

    let added = 0;
    let duplicates = 0;
    for (const row of rows) {
      const { error } = await context.supabase.from("review_sources").insert(row);
      if (!error) added++;
      else if (error.code === "23505") duplicates++;
      else if (/duplicate key/i.test(error.message)) duplicates++;
      else throw new Error(error.message);
    }
    return { added, duplicates };
  });

export const deleteReviewSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("review_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetReviewSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("review_sources")
      .update({ status: "pending", error: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Deletes every link in an order that could not be read (failed/empty) and that
 * was never published. Those links are usually rating-only reviews with no text.
 */
export const deleteFailedSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("review_sources")
      .select("id, review_text, published_review_id, published_profile_review_id, status")
      .eq("order_id", data.orderId)
      .in("status", ["failed", "empty"]);
    if (error) throw new Error(error.message);

    const ids = (rows ?? [])
      .filter((r) => !r.published_review_id && !r.published_profile_review_id && !(r.review_text ?? "").trim())
      .map((r) => r.id);
    if (ids.length === 0) return { removed: 0 };

    const { error: delError } = await context.supabase
      .from("review_sources")
      .delete()
      .in("id", ids);
    if (delError) throw new Error(delError.message);
    return { removed: ids.length };
  });

/**
 * Fetches the review text for up to `limit` pending links and stores it next to
 * each link as a draft. Nothing is published here. The free Google place-card
 * endpoint is tried first; links it cannot handle fall back to the page scraper.
 * Call repeatedly until `remaining` is 0.
 */
export const fetchSourceBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.coerce.number().int().min(1).max(60).optional().default(30),
        orderId: z.string().uuid().optional(),
        refreshAll: z.boolean().optional().default(false),
        /** Slow AI/page-scrape fallback. Off for bulk runs so 500 links stay fast. */
        fallback: z.boolean().optional().default(false),
        /** Re-run links that previously failed. */
        retryFailed: z.boolean().optional().default(false),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const pendingQuery = supabase.from("review_sources").select("id, url, label");
    if (data.orderId) pendingQuery.eq("order_id", data.orderId);
    if (data.retryFailed) pendingQuery.in("status", ["failed", "empty", "pending", "fetching"]);
    else if (!data.refreshAll) pendingQuery.in("status", ["pending", "fetching"]);
    else pendingQuery.is("published_review_id", null).is("published_profile_review_id", null);

    const { data: pending, error: pendingError } = await pendingQuery
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (pendingError) throw new Error(pendingError.message);

    const batch = pending ?? [];
    if (batch.length === 0) return { processed: 0, imported: 0, failed: 0, remaining: 0 };

    await supabase
      .from("review_sources")
      .update({ status: "fetching", error: null, text_error: null })
      .in(
        "id",
        batch.map((s) => s.id),
      );

    const { fetchReviewRaw } = await import("@/lib/review-age.server");
    const { headlineFromBody } = await import("@/lib/review-publish.server");

    let imported = 0;
    let failed = 0;

    // 12 parallel reads made Google 429 the whole batch. Four in flight, each
    // worker started a beat apart, stays under the throttle; fetchReviewRaw
    // also retries a 429 with backoff.
    let cursor = 0;
    const worker = async (slot: number) => {
      await new Promise((r) => setTimeout(r, slot * 250));
      while (cursor < batch.length) {
        const source = batch[cursor++]!;
        const now = new Date().toISOString();
        try {
          let body = "";
          let reviewerName: string | null = null;
          let rating: number | null = null;
          let publishedAt: string | null = null;
          let ageLabel: string | null = null;
          let businessName: string | null = null;

          try {
            const result = await fetchReviewRaw(source.url);
            body = result.text ?? "";
            reviewerName = result.reviewer_name ?? null;
            rating = result.rating ?? null;
            publishedAt = result.published_at ?? null;
            ageLabel = result.age_label ?? null;
            businessName = result.business_name ?? null;
            if (!body.trim()) throw new Error("Google returned the date but no review text.");
          } catch (rpcError) {
            // The page scraper + AI pass costs 10-30s per link, so bulk runs skip it.
            if (!data.fallback) throw rpcError;
            const { fetchPageText, extractReviews } = await import("@/lib/review-scrape.server");
            const { text, title } = await fetchPageText(source.url);
            const reviews = await extractReviews(text, source.label || title, source.url);
            const best = [...reviews].sort((a, b) => b.body.length - a.body.length)[0];
            if (!best) throw rpcError;
            body = best.body;
            rating = rating ?? best.rating;
            const subject = best.subject?.trim();
            // extractReviews falls back to the page title; only keep a real name.
            if (subject && subject !== (source.label || title)?.trim()) businessName = subject.slice(0, 120);
          }

          // Google often throttles the first read (429). The scraper can't see
          // dates, so take one more date-only pass before giving up on it.
          if (!publishedAt) {
            await new Promise((r) => setTimeout(r, 800));
            try {
              const again = await fetchReviewRaw(source.url);
              publishedAt = again.published_at ?? null;
              ageLabel = ageLabel ?? again.age_label ?? null;
              reviewerName = reviewerName ?? again.reviewer_name ?? null;
            } catch {
              // keep going without a date; the Retry Google date button can fix it later
            }
          }

          if (!body.trim()) throw new Error("No review text could be read from this link.");
          imported++;

          await supabase
            .from("review_sources")
            .update({
              status: "done",
              error: null,
              text_error: null,
              reviews_found: 1,
              review_text: body,
              review_headline: headlineFromBody(body),
              rating,
              reviewer_name: reviewerName,
              review_published_at: publishedAt,
              review_age_label: ageLabel,
              ...(businessName ? { business_name: businessName } : {}),
              text_checked_at: now,
              fetched_at: now,
            })
            .eq("id", source.id);
        } catch (error) {
          failed++;
          const message = (error as Error).message.slice(0, 400);
          await supabase
            .from("review_sources")
            .update({
              status: "failed",
              error: message,
              text_error: message,
              text_checked_at: now,
              fetched_at: now,
            })
            .eq("id", source.id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, batch.length) }, (_, slot) => worker(slot)));

    const remainingQuery = supabase
      .from("review_sources")
      .select("id", { count: "exact", head: true })
      .in(
        "status",
        data.retryFailed ? ["failed", "empty", "pending", "fetching"] : ["pending", "fetching"],
      );
    if (data.orderId) remainingQuery.eq("order_id", data.orderId);
    const { count } = await remainingQuery;

    return {
      processed: batch.length,
      imported,
      failed,
      remaining: count ?? 0,
    };
  });

/**
 * Re-reads only the Google review date (plus reviewer name / age label) for one
 * link. If the review is already live and was dated from today, its public date
 * is recalculated from the real Google date.
 */
export const refetchGoogleDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: source, error } = await supabase
      .from("review_sources")
      .select("id, url, published_profile_review_id, date_fallback, reviewer_name")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const { fetchReviewRaw } = await import("@/lib/review-age.server");
    let result;
    try {
      result = await fetchReviewRaw(source.url);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    if (!result.published_at) {
      return { ok: false as const, error: "Google did not return a date for this review." };
    }

    const patch: Database["public"]["Tables"]["review_sources"]["Update"] = {
      review_published_at: result.published_at,
      review_age_label: result.age_label ?? null,
      reviewer_name: result.reviewer_name ?? source.reviewer_name,
    };

    if (source.published_profile_review_id && source.date_fallback) {
      const { backdatedFromSourceDate } = await import("@/lib/review-publish.server");
      const { date, fallback } = backdatedFromSourceDate(result.published_at);
      const { error: upErr } = await supabase
        .from("robiul_reviews")
        .update({ review_date: date })
        .eq("id", source.published_profile_review_id);
      if (upErr) throw new Error(upErr.message);
      patch.published_review_date = date;
      patch.date_fallback = fallback;
    }

    const { error: saveErr } = await supabase.from("review_sources").update(patch).eq("id", source.id);
    if (saveErr) throw new Error(saveErr.message);
    return { ok: true as const, publishedAt: result.published_at, reviewDate: patch.published_review_date ?? null };
  });

/** Admin edits the fetched text / rating before publishing. */
export const updateSourceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        review_text: z.string().trim().max(4000).optional(),
        rating: z.coerce.number().int().min(1).max(5).optional(),
        business_name: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      review_text?: string | null;
      rating?: number;
      business_name?: string | null;
    } = {};
    if (data.review_text !== undefined) patch.review_text = data.review_text || null;
    if (data.rating !== undefined) patch.rating = data.rating;
    if (data.business_name !== undefined) patch.business_name = data.business_name || null;

    const { error } = await context.supabase
      .from("review_sources")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Publishes one fetched draft as a Jordan review on its own permanent slug
 * (rh01, rh02, …). Slugs come from a database counter and are never reused.
 * The review date is randomised between 12 and 15 years ago.
 */
export const publishSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: source, error: sourceError } = await supabase
      .from("review_sources")
      .select(
        "id, url, label, review_text, review_headline, rating, business_name, review_published_at, order_id, published_review_id, published_profile_review_id",
      )
      .eq("id", data.id)
      .single();
    if (sourceError) throw new Error(sourceError.message);
    if (source.published_review_id || source.published_profile_review_id) {
      throw new Error("This review is already published.");
    }

    const body = (source.review_text ?? "").trim();
    if (body.length < 20) throw new Error("Fetch the review text first (it looks empty).");

    const { dummyBusinessName, backdatedFromSourceDate, headlineFromBody, slugifyHeadline } =
      await import("@/lib/review-publish.server");

    // Which reviewer profile this order publishes to.
    let reviewerKey: "robiul" | "jonas" | "benedikt" = "robiul";
    if (source.order_id) {
      const { data: order } = await supabase
        .from("review_orders")
        .select("reviewer_key")
        .eq("id", source.order_id)
        .maybeSingle();
      if (order?.reviewer_key === "jonas") reviewerKey = "jonas";
      else if (order?.reviewer_key === "benedikt") reviewerKey = "benedikt";
    }

    const business = source.business_name?.trim() || dummyBusinessName();
    const headline = ((source.review_headline ?? "").trim() || headlineFromBody(body)).slice(0, 140);
    const { date: reviewDate, fallback } = backdatedFromSourceDate(source.review_published_at);

    const { shortReviewSlug } = await import("@/lib/review-slug");
    const reviewerLabel =
      reviewerKey === "jonas" ? "Jonas Weber" : reviewerKey === "benedikt" ? "Benedikt Herrmann" : "Robiul Alam";
    void slugifyHeadline;
    let inserted: { id: string; slug: string; review_date: string } | null = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const slug = shortReviewSlug(reviewerLabel, business, attempt);
      const { data: row, error: insertError } = await supabase
        .from("robiul_reviews")
        .insert({
          reviewer_key: reviewerKey,
          slug,
          headline,
          body,
          subject: business,
          rating: source.rating ?? 5,
          review_date: reviewDate,
          published: true,
          created_by: userId,
        })
        .select("id, slug, review_date")
        .single();
      if (!insertError) {
        inserted = row as { id: string; slug: string; review_date: string };
        break;
      }
      const duplicate = insertError.code === "23505" || /duplicate key/i.test(insertError.message);
      if (!duplicate) throw new Error(insertError.message);
    }
    if (!inserted) throw new Error("Could not allocate a unique link for this review.");

    const profileBase =
      reviewerKey === "jonas"
        ? "/Jonas-Weber"
        : reviewerKey === "benedikt"
          ? "/Benedikt-Herrmann"
          : "/robiul-alam";
    const path = `${profileBase}/${inserted.slug}`;

    await supabase
      .from("review_sources")
      .update({
        published_profile_review_id: inserted.id,
        published_slug: inserted.slug,
        published_path: path,
        published_review_date: inserted.review_date,
        date_fallback: fallback,
        business_name: business,
        status: "published",
      })
      .eq("id", source.id);

    return {
      id: inserted.id,
      slug: inserted.slug,
      path,
      reviewerKey,
      fallback,
      reviewDate: inserted.review_date,
    };
  });

const SCREENSHOT_SITE = "https://peopleopinionbox.com";

async function runScreenshot(
  supabase: import("@supabase/supabase-js").SupabaseClient<Database>,
  id: string,
) {
  const { data: source, error } = await supabase
    .from("review_sources")
    .select("id, published_path, published_slug, order_id, drive_file_id")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (!source.published_path) return { ok: false as const, error: "Publish this review first." };

  let orderName = "Order";
  if (source.order_id) {
    const { data: order } = await supabase
      .from("review_orders")
      .select("name")
      .eq("id", source.order_id)
      .maybeSingle();
    if (order?.name) orderName = order.name;
  }

  await supabase
    .from("review_sources")
    .update({ screenshot_status: "pending", screenshot_error: null } as never)
    .eq("id", id);

  try {
    const { screenshotToDrive } = await import("@/lib/review-screenshot.server");
    const result = await screenshotToDrive(
      `${SCREENSHOT_SITE}${source.published_path}`,
      `${source.published_slug ?? source.id}.png`,
      orderName,
    );
    const oldFileId = (source as { drive_file_id?: string | null }).drive_file_id;
    if (oldFileId && oldFileId !== result.fileId) {
      const { deleteDriveFile } = await import("@/lib/review-screenshot.server");
      await deleteDriveFile(oldFileId).catch((e) => console.error("old screenshot delete failed", e));
    }
    await supabase
      .from("review_sources")
      .update({
        drive_file_id: result.fileId,
        drive_url: result.url,
        screenshot_status: "done",
        screenshot_error: null,
        screenshot_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
    return { ok: true as const, url: result.url };
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    console.error("screenshot failed", id, message);
    await supabase
      .from("review_sources")
      .update({ screenshot_status: "failed", screenshot_error: message } as never)
      .eq("id", id);
    return { ok: false as const, error: message };
  }
}

/** Full-page screenshot of one published review, uploaded to Drive as a public file. */
export const screenshotSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => runScreenshot(context.supabase, data.id));


/**
 * Locks in the DMCA fields for every published review of an order: the
 * publication date becomes the live review date on our site, and the original
 * publication link becomes the real live URL of that review page.
 */
export const syncOrderDmca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ orderId: z.string().uuid(), siteUrl: z.string().url() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const base = data.siteUrl.replace(/\/+$/, "");

    const { data: rows, error } = await supabase
      .from("review_sources")
      .select(
        "id, published_review_id, published_profile_review_id, published_slug, published_path, published_review_date",
      )
      .eq("order_id", data.orderId)
      .or("published_review_id.not.is.null,published_profile_review_id.not.is.null");
    if (error) throw new Error(error.message);

    const published = rows ?? [];
    if (published.length === 0) {
      return { updated: 0, skipped: 0, total: 0 };
    }

    // Read the real, current dates + slugs from whichever table holds the review.
    const legacyIds = published.map((r) => r.published_review_id).filter(Boolean) as string[];
    const profileIds = published
      .map((r) => r.published_profile_review_id)
      .filter(Boolean) as string[];

    const legacy = legacyIds.length
      ? (await supabase.from("reviews").select("id, slug, review_date").in("id", legacyIds)).data ?? []
      : [];
    const profile = profileIds.length
      ? (
          await supabase
            .from("robiul_reviews")
            .select("id, slug, review_date, reviewer_key")
            .in("id", profileIds)
        ).data ?? []
      : [];

    const legacyById = new Map(legacy.map((r) => [r.id, r]));
    const profileById = new Map(profile.map((r) => [r.id, r]));
    let updated = 0;
    let skipped = 0;

    for (const row of published) {
      let slug: string | null = row.published_slug;
      let date: string | null = row.published_review_date;
      let path: string | null = row.published_path;

      const prof = row.published_profile_review_id
        ? profileById.get(row.published_profile_review_id)
        : null;
      if (prof) {
        slug = prof.slug;
        date = prof.review_date;
        path = `${prof.reviewer_key === "jonas" ? "/Jonas-Weber" : prof.reviewer_key === "benedikt" ? "/Benedikt-Herrmann" : "/robiul-alam"}/${prof.slug}`;
      } else if (row.published_review_id) {
        const review = legacyById.get(row.published_review_id);
        slug = review?.slug ?? slug;
        date = review?.review_date ?? date;
        if (slug) path = `/Jordan/reviews/${slug}`;
      }

      if (!slug || !date || !path) {
        skipped++;
        continue;
      }
      const { error: updateError } = await supabase
        .from("review_sources")
        .update({
          published_slug: slug,
          published_path: path,
          published_review_date: date,
          dmca_publication_date: date,
          dmca_original_link: `${base}${path}`,
          dmca_generated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      updated++;
    }

    return { updated, skipped, total: published.length };
  });


/** Public, SSR-friendly read of a single review page by its permanent slug. */
export const getPublicReviewBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data: review, error } = await client
      .from("reviews")
      .select(
        "id, reviewer_name, reviewer_location, subject, headline, body, rating, review_date, slug",
      )
      .eq("published", true)
      .eq("slug", data.slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (review as PublicReview | null) ?? null;
  });
