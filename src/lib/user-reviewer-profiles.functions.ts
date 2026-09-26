import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_PROFILES_PER_USER = 100;

// Slugs that must not be taken by user profiles because they collide with
// real routes on the site.
const RESERVED_SLUGS = new Set([
  "admin",
  "app",
  "auth",
  "xrpuas-log",
  "sitemap.xml",
  "sitemap",
  "u",
  "api",
  "robiul-alam",
  "jonas-weber",
  "benedikt-herrmann",
  "afridi",
  "jordan",
  "index",
  "index-info",
  "assets",
  "static",
  "images",
  "review",
  "reviews",
  "login",
  "signup",
  "signin",
  "settings",
  "profile",
  "profiles",
  "dashboard",
  "public",
  "favicon.ico",
  "robots.txt",
]);

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "reviewer"
  );
}

async function pickSlug(supabase: any, name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  for (let i = 0; i < 30; i++) {
    if (!RESERVED_SLUGS.has(candidate)) {
      const { data } = await supabase
        .from("user_reviewer_profiles")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!data) return candidate;
    }
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function assertActiveKey(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_active_key", {
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Your access key is not active. Enter a key in Settings.");
}

export interface MyReviewerProfile {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  age: number;
  bio: string | null;
  created_at: string;
}

export const listMyReviewerProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyReviewerProfile[]> => {
    await assertActiveKey(context as never);
    const { data, error } = await context.supabase
      .from("user_reviewer_profiles")
      .select("id, slug, name, avatar_url, age, bio, created_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MyReviewerProfile[];
  });

export const createMyReviewerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { name: string; avatarUrl?: string; age?: number; bio?: string }) =>
      z
        .object({
          name: z.string().min(2).max(80),
          avatarUrl: z.string().url().max(600).optional().or(z.literal("")),
          age: z.number().int().min(8).max(80).optional(),
          bio: z.string().max(400).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<MyReviewerProfile> => {
    await assertActiveKey(context as never);
    const { count, error: countErr } = await context.supabase
      .from("user_reviewer_profiles")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", context.userId);
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) >= MAX_PROFILES_PER_USER) {
      throw new Error(`Maximum ${MAX_PROFILES_PER_USER} reviewer profiles per user.`);
    }
    const slug = await pickSlug(context.supabase, data.name);
    const age =
      data.age ?? 12 + Math.floor(Math.random() * 4); // 12–15 default
    const { data: row, error } = await context.supabase
      .from("user_reviewer_profiles")
      .insert({
        owner_id: context.userId,
        slug,
        name: data.name.trim(),
        avatar_url: data.avatarUrl || null,
        age,
        bio: data.bio?.trim() || null,
      })
      .select("id, slug, name, avatar_url, age, bio, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as MyReviewerProfile;
  });

export const updateMyReviewerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      name?: string;
      avatarUrl?: string;
      age?: number;
      bio?: string;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(2).max(80).optional(),
          avatarUrl: z.string().url().max(600).optional().or(z.literal("")),
          age: z.number().int().min(8).max(80).optional(),
          bio: z.string().max(400).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const patch: {
      name?: string;
      avatar_url?: string | null;
      age?: number;
      bio?: string | null;
    } = {};
    if (data.name != null) patch.name = data.name.trim();
    if (data.avatarUrl != null) patch.avatar_url = data.avatarUrl || null;
    if (data.age != null) patch.age = data.age;
    if (data.bio != null) patch.bio = data.bio.trim() || null;
    const { error } = await context.supabase
      .from("user_reviewer_profiles")
      .update(patch)
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyReviewerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { error } = await context.supabase
      .from("user_reviewer_profiles")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Public reads ----------

export type PublicReviewerProfile = {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  age: number;
  bio: string | null;
  created_at: string;
  owner_id: string;
};
export type PublicReviewerReview = {
  id: string;
  slug: string;
  headline: string;
  body: string;
  subject: string | null;
  rating: number;
  review_date: string;
  image_url: string | null;
};

function publicSb() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    }),
  );
}

export const publicReviewerBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) =>
    z.object({ slug: z.string().min(1).max(80) }).parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      profile: PublicReviewerProfile | null;
      reviews: PublicReviewerReview[];
    }> => {
      const sb = await publicSb();
      const { data: profile } = await sb
        .from("user_reviewer_profiles")
        .select("id, slug, name, avatar_url, age, bio, created_at, owner_id")
        .eq("slug", data.slug)
        .maybeSingle();
      if (!profile) return { profile: null, reviews: [] };
      const { data: reviews } = await sb
        .from("user_reviews")
        .select(
          "id, slug, headline, body, subject, rating, review_date, image_url",
        )
        .eq("reviewer_profile_id", (profile as PublicReviewerProfile).id)
        .eq("published", true)
        .order("review_date", { ascending: false });
      return {
        profile: profile as PublicReviewerProfile,
        reviews: (reviews ?? []) as PublicReviewerReview[],
      };
    },
  );

export const publicReviewerReview = createServerFn({ method: "GET" })
  .inputValidator((d: { profileSlug: string; reviewSlug: string }) =>
    z
      .object({
        profileSlug: z.string().min(1).max(80),
        reviewSlug: z.string().min(1).max(80),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      profile: PublicReviewerProfile | null;
      review: PublicReviewerReview | null;
    }> => {
      const sb = await publicSb();
      const { data: profile } = await sb
        .from("user_reviewer_profiles")
        .select("id, slug, name, avatar_url, age, bio, created_at, owner_id")
        .eq("slug", data.profileSlug)
        .maybeSingle();
      if (!profile) return { profile: null, review: null };
      const { data: review } = await sb
        .from("user_reviews")
        .select(
          "id, slug, headline, body, subject, rating, review_date, image_url",
        )
        .eq("reviewer_profile_id", (profile as PublicReviewerProfile).id)
        .eq("slug", data.reviewSlug)
        .eq("published", true)
        .maybeSingle();
      return {
        profile: profile as PublicReviewerProfile,
        review: (review as PublicReviewerReview | null) ?? null,
      };
    },
  );

/** Avatar upload scoped to the signed-in user's folder. */
export const uploadMyProfileAvatar = createServerFn({ method: "POST" })
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
    if (!/^image\/(png|jpeg|jpg|webp|gif|avif)$/i.test(data.contentType)) {
      throw new Error("Only PNG, JPG, WEBP, GIF or AVIF images are allowed.");
    }
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
    const ext = (data.filename.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `profiles/${context.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("review-images")
      .upload(path, bytes, { contentType: data.contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(error.message);
    return { url: `/api/public/review-image/${path}` };
  });
