import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Access status ----------

export interface MyAccessStatus {
  active: boolean;
  keyStatus: "none" | "pending" | "active" | "expired" | "revoked";
  expiresAt: string | null;
  isAdmin: boolean;
  email: string;
}

export const myAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccessStatus> => {
    const [adminRes, keyRes, userRes] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase
        .from("access_keys")
        .select("expires_at, activated_at, revoked_at")
        .eq("owner_id", context.userId)
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase.auth.getUser(),
    ]);

    const isAdmin = Boolean(adminRes.data);
    const email = userRes.data.user?.email ?? "";
    const key = keyRes.data;
    let keyStatus: MyAccessStatus["keyStatus"] = "none";
    let expiresAt: string | null = null;

    if (key) {
      expiresAt = key.expires_at;
      if (key.revoked_at) keyStatus = "revoked";
      else if (new Date(key.expires_at) <= new Date()) keyStatus = "expired";
      else if (!key.activated_at) keyStatus = "pending";
      else keyStatus = "active";
    }

    return {
      active: isAdmin || keyStatus === "active",
      keyStatus,
      expiresAt,
      isAdmin,
      email,
    };
  });

// ---------- Activate a key by token ----------

export const activateKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(4).max(128) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("activate_access_key", {
      _token: data.token.trim(),
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; error?: string; expires_at?: string };
  });

// ---------- Profile ----------

export interface MyProfile {
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
}

function slugifyHandle(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "user";
}

export const myProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyProfile> => {
    const { data: existing } = await context.supabase
      .from("user_profiles")
      .select("handle, display_name, bio, avatar_url")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (existing) {
      return {
        handle: existing.handle,
        displayName: existing.display_name,
        bio: existing.bio,
        avatarUrl: existing.avatar_url,
      };
    }

    const { data: userData } = await context.supabase.auth.getUser();
    const email = userData.user?.email ?? "user";
    const base = slugifyHandle(email.split("@")[0] ?? "user");
    let handle = base;
    for (let i = 0; i < 5; i++) {
      const { data: taken } = await context.supabase
        .from("user_profiles")
        .select("id")
        .eq("handle", handle)
        .maybeSingle();
      if (!taken) break;
      handle = `${base}-${Math.floor(Math.random() * 9999)}`;
    }

    const { data: created, error } = await context.supabase
      .from("user_profiles")
      .insert({
        owner_id: context.userId,
        handle,
        display_name: email.split("@")[0] ?? handle,
      })
      .select("handle, display_name, bio, avatar_url")
      .single();
    if (error) throw new Error(error.message);
    return {
      handle: created.handle,
      displayName: created.display_name,
      bio: created.bio,
      avatarUrl: created.avatar_url,
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { displayName?: string; bio?: string; avatarUrl?: string }) =>
    z
      .object({
        displayName: z.string().min(1).max(80).optional(),
        bio: z.string().max(500).optional(),
        avatarUrl: z.string().url().max(500).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: { display_name?: string; bio?: string | null; avatar_url?: string | null } = {};
    if (data.displayName != null) patch.display_name = data.displayName;
    if (data.bio != null) patch.bio = data.bio || null;
    if (data.avatarUrl != null) patch.avatar_url = data.avatarUrl || null;
    const { error } = await context.supabase
      .from("user_profiles")
      .update(patch)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Generic per-user CRUD helpers ----------

async function assertActiveKey(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_active_key", {
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Your access key is not active. Enter a key in Settings.");
}

// ---------- Review orders ----------

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveKey(context as never);
    const { data, error } = await context.supabase
      .from("user_review_orders")
      .select("id, name, note, status, created_at, updated_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; note?: string; reviewerProfileId?: string }) =>
    z
      .object({
        name: z.string().min(1).max(120),
        note: z.string().max(1000).optional(),
        reviewerProfileId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    let reviewerProfileId: string | null = null;
    if (data.reviewerProfileId) {
      const { data: owned } = await context.supabase
        .from("user_reviewer_profiles")
        .select("id")
        .eq("id", data.reviewerProfileId)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (!owned) throw new Error("That reviewer profile does not belong to you.");
      reviewerProfileId = data.reviewerProfileId;
    }
    const { data: row, error } = await context.supabase
      .from("user_review_orders")
      .insert({
        owner_id: context.userId,
        name: data.name,
        note: data.note ?? null,
        reviewer_profile_id: reviewerProfileId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { error } = await context.supabase
      .from("user_review_orders")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Post Reviews (user_reviews) ----------

function slugifyReview(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `review-${Date.now()}`
  );
}

export const listMyReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveKey(context as never);
    const { data, error } = await context.supabase
      .from("user_reviews")
      .select(
        "id, slug, headline, body, subject, rating, review_date, image_url, published, created_at, reviewer_profile_id",
      )
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      headline: string;
      body: string;
      subject?: string;
      rating: number;
      reviewDate: string;
      imageUrl?: string;
      published: boolean;
      reviewerProfileId?: string;
    }) =>
      z
        .object({
          headline: z.string().min(3).max(140),
          body: z.string().min(10).max(4000),
          subject: z.string().max(140).optional(),
          rating: z.number().int().min(1).max(5),
          reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          imageUrl: z.string().url().max(500).optional().or(z.literal("")),
          published: z.boolean(),
          reviewerProfileId: z.string().uuid().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    let reviewerProfileId: string | null = null;
    let profileSlug: string | null = null;
    if (data.reviewerProfileId) {
      const { data: owned } = await context.supabase
        .from("user_reviewer_profiles")
        .select("id, slug")
        .eq("id", data.reviewerProfileId)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (!owned) throw new Error("That reviewer profile does not belong to you.");
      reviewerProfileId = owned.id;
      profileSlug = owned.slug;
    }
    const base = slugifyReview(data.headline);
    let slug = base;
    for (let i = 0; i < 5; i++) {
      const { data: taken } = await context.supabase
        .from("user_reviews")
        .select("id")
        .eq("owner_id", context.userId)
        .eq("slug", slug)
        .maybeSingle();
      if (!taken) break;
      slug = `${base}-${Math.floor(Math.random() * 9999)}`;
    }
    const { data: row, error } = await context.supabase
      .from("user_reviews")
      .insert({
        owner_id: context.userId,
        slug,
        headline: data.headline,
        body: data.body,
        subject: data.subject ?? null,
        rating: data.rating,
        review_date: data.reviewDate,
        image_url: data.imageUrl || null,
        published: data.published,
        reviewer_profile_id: reviewerProfileId,
      })
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return { ...row, profileSlug };
  });

export const togglePublishReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; published: boolean }) =>
    z.object({ id: z.string().uuid(), published: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { error } = await context.supabase
      .from("user_reviews")
      .update({ published: data.published })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { error } = await context.supabase
      .from("user_reviews")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- DMCA reports ----------

export const listMyDmca = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveKey(context as never);
    const { data, error } = await context.supabase
      .from("user_dmca_reports")
      .select("id, google_url, our_url, status, note, created_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyDmca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { googleUrl: string; ourUrl?: string; note?: string }) =>
    z
      .object({
        googleUrl: z.string().url().max(500),
        ourUrl: z.string().url().max(500).optional().or(z.literal("")),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { data: row, error } = await context.supabase
      .from("user_dmca_reports")
      .insert({
        owner_id: context.userId,
        google_url: data.googleUrl,
        our_url: data.ourUrl || null,
        note: data.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMyDmca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { error } = await context.supabase
      .from("user_dmca_reports")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Policy items ----------

export const listMyPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveKey(context as never);
    const { data, error } = await context.supabase
      .from("user_policy_items")
      .select("id, url, review_text, verdict, report_text, status, created_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; reviewText?: string }) =>
    z
      .object({
        url: z.string().url().max(500),
        reviewText: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { data: row, error } = await context.supabase
      .from("user_policy_items")
      .insert({
        owner_id: context.userId,
        url: data.url,
        review_text: data.reviewText ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMyPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { error } = await context.supabase
      .from("user_policy_items")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Fake review orders ----------

export const listMyFakeReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveKey(context as never);
    const { data, error } = await context.supabase
      .from("user_fake_review_orders")
      .select("id, name, target_url, reason_code, status, note, created_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyFakeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; targetUrl: string; reasonCode?: string; note?: string }) =>
    z
      .object({
        name: z.string().min(1).max(120),
        targetUrl: z.string().url().max(500),
        reasonCode: z.string().max(40).optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { data: row, error } = await context.supabase
      .from("user_fake_review_orders")
      .insert({
        owner_id: context.userId,
        name: data.name,
        target_url: data.targetUrl,
        reason_code: data.reasonCode ?? "generic",
        note: data.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMyFakeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertActiveKey(context as never);
    const { error } = await context.supabase
      .from("user_fake_review_orders")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Support chat ----------

export interface SupportThread {
  id: string;
  ownerId: string;
  email: string;
  lastMessageAt: string;
  unreadAdmin: number;
  unreadUser: number;
}

async function ensureMyThread(context: {
  supabase: any;
  userId: string;
}): Promise<string> {
  const { data: existing } = await context.supabase
    .from("support_threads")
    .select("id")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await context.supabase
    .from("support_threads")
    .insert({ owner_id: context.userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export const getMyThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const id = await ensureMyThread(context as never);
    return { threadId: id };
  });

export const listMyMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const id = await ensureMyThread(context as never);
    const { data, error } = await context.supabase
      .from("support_messages")
      .select("id, sender, body, created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    await context.supabase
      .from("support_threads")
      .update({ unread_user: 0 })
      .eq("id", id);
    return { threadId: id, messages: data ?? [] };
  });

export const sendMyMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { body: string }) =>
    z.object({ body: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const id = await ensureMyThread(context as never);
    const { error } = await context.supabase
      .from("support_messages")
      .insert({ thread_id: id, sender: "user", body: data.body });
    if (error) throw new Error(error.message);
    await context.supabase
      .from("support_threads")
      .update({ last_message_at: new Date().toISOString(), unread_admin: 999 })
      .eq("id", id);
    return { ok: true };
  });

// ---------- Admin: user management ----------

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin only");
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase.rpc("admin_list_users");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

function randomToken(len = 32) {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alpha[bytes[i]! % alpha.length];
  return out;
}

export const adminGenerateKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; days?: number }) =>
    z.object({ userId: z.string().uuid(), days: z.number().int().min(1).max(90).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    // revoke any active keys for that user
    await context.supabase
      .from("access_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("owner_id", data.userId)
      .is("revoked_at", null);
    const token = randomToken(32);
    const days = data.days ?? 7;
    const expires = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
    const { error } = await context.supabase.from("access_keys").insert({
      owner_id: data.userId,
      token,
      issued_by: context.userId,
      expires_at: expires,
      activated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { token, expiresAt: expires };
  });

export const adminGenerateUnassignedKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) =>
    z.object({ days: z.number().int().min(1).max(90).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const token = randomToken(32);
    const days = data.days ?? 7;
    const expires = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
    const { error } = await context.supabase.from("access_keys").insert({
      token,
      issued_by: context.userId,
      expires_at: expires,
    });
    if (error) throw new Error(error.message);
    return { token, expiresAt: expires };
  });

export const adminRevokeKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("access_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("owner_id", data.userId)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListThreadMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    // ensure a thread exists
    let { data: t } = await context.supabase
      .from("support_threads")
      .select("id")
      .eq("owner_id", data.userId)
      .maybeSingle();
    if (!t) {
      const ins = await context.supabase
        .from("support_threads")
        .insert({ owner_id: data.userId })
        .select("id")
        .single();
      if (ins.error) throw new Error(ins.error.message);
      t = ins.data;
    }
    const { data: msgs, error } = await context.supabase
      .from("support_messages")
      .select("id, sender, body, created_at")
      .eq("thread_id", t!.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    await context.supabase
      .from("support_threads")
      .update({ unread_admin: 0 })
      .eq("id", t!.id);
    return { threadId: t!.id, messages: msgs ?? [] };
  });

export const adminSendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; body: string }) =>
    z.object({ userId: z.string().uuid(), body: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    let { data: t } = await context.supabase
      .from("support_threads")
      .select("id")
      .eq("owner_id", data.userId)
      .maybeSingle();
    if (!t) {
      const ins = await context.supabase
        .from("support_threads")
        .insert({ owner_id: data.userId })
        .select("id")
        .single();
      if (ins.error) throw new Error(ins.error.message);
      t = ins.data;
    }
    const { error } = await context.supabase
      .from("support_messages")
      .insert({ thread_id: t!.id, sender: "admin", body: data.body });
    if (error) throw new Error(error.message);
    await context.supabase
      .from("support_threads")
      .update({ last_message_at: new Date().toISOString(), unread_user: 999 })
      .eq("id", t!.id);
    return { ok: true };
  });

// ---------- Public reads for /u/$handle ----------

export type PublicProfile = {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  owner_id: string;
  created_at: string;
};
export type PublicReview = {
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
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    }),
  );
}

export const publicProfileByHandle = createServerFn({ method: "GET" })
  .inputValidator((d: { handle: string }) =>
    z.object({ handle: z.string().min(1).max(60) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ profile: PublicProfile | null; reviews: PublicReview[] }> => {
    const sb = await publicSb();
    const { data: profile } = await sb
      .from("user_profiles")
      .select("handle, display_name, avatar_url, bio, owner_id, created_at")
      .eq("handle", data.handle)
      .maybeSingle();
    if (!profile) return { profile: null, reviews: [] };
    const { data: reviews } = await sb
      .from("user_reviews")
      .select("id, slug, headline, body, subject, rating, review_date, image_url")
      .eq("owner_id", profile.owner_id)
      .eq("published", true)
      .order("review_date", { ascending: false });
    return { profile: profile as PublicProfile, reviews: (reviews ?? []) as PublicReview[] };
  });

export const publicReviewByHandleSlug = createServerFn({ method: "GET" })
  .inputValidator((d: { handle: string; slug: string }) =>
    z.object({ handle: z.string().min(1).max(60), slug: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ profile: PublicProfile | null; review: PublicReview | null }> => {
    const sb = await publicSb();
    const { data: profile } = await sb
      .from("user_profiles")
      .select("handle, display_name, avatar_url, bio, owner_id, created_at")
      .eq("handle", data.handle)
      .maybeSingle();
    if (!profile) return { profile: null, review: null };
    const { data: review } = await sb
      .from("user_reviews")
      .select("id, slug, headline, body, subject, rating, review_date, image_url")
      .eq("owner_id", profile.owner_id)
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    return { profile: profile as PublicProfile, review: (review as PublicReview | null) ?? null };
  });
