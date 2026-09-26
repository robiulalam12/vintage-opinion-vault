import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export const AFRIDI_NAME = "Afridi";
export const AFRIDI_BASE = "/afridi";
const KEY = "afridi";

export interface AfridiReview {
  id: string;
  slug: string;
  headline: string;
  body: string;
  subject: string | null;
  image_url: string | null;
  rating: number;
  review_date: string;
  published: boolean;
  created_at: string;
}

const COLUMNS =
  "id, slug, headline, body, subject, image_url, rating, review_date, published, created_at";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
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
}

/** Public, SSR-readable list for /afridi */
export const listAfridiReviews = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient()
    .from("robiul_reviews")
    .select(COLUMNS)
    .eq("reviewer_key", KEY)
    .eq("published", true)
    .order("review_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AfridiReview[];
});

/** Public, SSR-readable single review for /afridi/<slug> */
export const getAfridiReviewBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await publicClient()
      .from("robiul_reviews")
      .select(COLUMNS)
      .eq("reviewer_key", KEY)
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as AfridiReview | null;
  });

/* ------------------------------ editor side ------------------------------ */

async function assertEditor(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("can_edit_reviewer", {
    _user_id: context.userId,
    _reviewer_key: KEY,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access not granted");
}

export const listAllAfridiReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertEditor(context);
    const { data, error } = await context.supabase
      .from("robiul_reviews")
      .select(COLUMNS)
      .eq("reviewer_key", KEY)
      .order("review_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AfridiReview[];
  });

const reviewInput = z.object({
  id: z.string().uuid().optional(),
  headline: z.string().trim().min(3).max(140),
  body: z.string().trim().min(20).max(6000),
  subject: z.string().trim().max(120).optional().default(""),
  image_url: z.string().trim().max(500).optional().default(""),
  rating: z.coerce.number().int().min(1).max(5),
  review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  published: z.boolean(),
});

export type AfridiReviewInput = z.input<typeof reviewInput>;

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70)
    .replace(/^-|-$/g, "");
  return base || "review";
}

export const saveAfridiReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context);

    const row = {
      headline: data.headline,
      body: data.body,
      subject: data.subject || null,
      image_url: data.image_url || null,
      rating: data.rating,
      review_date: data.review_date,
      published: data.published,
    };

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("robiul_reviews")
        .update(row)
        .eq("id", data.id)
        .eq("reviewer_key", KEY)
        .select("id, slug")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }

    const base = slugify(data.headline);
    for (let attempt = 0; attempt < 12; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data: inserted, error } = await context.supabase
        .from("robiul_reviews")
        .insert({ ...row, slug, reviewer_key: KEY, created_by: context.userId })
        .select("id, slug")
        .single();
      if (!error) return inserted;
      const duplicate = error.code === "23505" || /duplicate key/i.test(error.message);
      if (!duplicate) throw new Error(error.message);
    }
    throw new Error("Could not allocate a unique link for this review.");
  });

export const deleteAfridiReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertEditor(context);
    const { error } = await context.supabase
      .from("robiul_reviews")
      .delete()
      .eq("id", data.id)
      .eq("reviewer_key", KEY);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Image upload for this profile. Private bucket, served by /api/public/review-image/*. */
export const uploadAfridiImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filename: z.string().trim().min(1).max(200),
        contentType: z.string().trim().min(3).max(100),
        base64: z.string().min(16),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEditor(context);

    if (!/^image\/(png|jpeg|jpg|webp|gif|avif)$/i.test(data.contentType)) {
      throw new Error("Only PNG, JPG, WEBP, GIF or AVIF images are allowed.");
    }

    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");

    const ext = (data.filename.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `afridi/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "jpg"}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("review-images")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);

    return { url: `/api/public/review-image/${path}` };
  });
