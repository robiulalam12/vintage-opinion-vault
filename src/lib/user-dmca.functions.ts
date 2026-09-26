import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

// ---------------- Templates (per-user) ----------------

export interface UserDmcaTemplate {
  id: string;
  name: string;
  body: string;
  updated_at: string;
  readonly?: boolean;
}

export const listMyDmcaTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertUser(context as Ctx);
    // User's own templates PLUS admin defaults (shared to every user, read-only).
    const { data, error } = await context.supabase
      .from("dmca_templates")
      .select("id, name, body, updated_at, source, created_by")
      .or(`and(source.eq.user,created_by.eq.${context.userId}),source.eq.admin`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((t: any) => ({
      id: t.id,
      name: t.source === "admin" ? `${t.name} (default)` : t.name,
      body: t.body,
      updated_at: t.updated_at,
      readonly: t.source === "admin",
    })) as UserDmcaTemplate[];
  });

export const saveMyDmcaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(120),
        body: z.string().trim().min(10).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    if (data.id) {
      const { error } = await context.supabase
        .from("dmca_templates")
        .update({ name: data.name, body: data.body })
        .eq("id", data.id)
        .eq("created_by", context.userId)
        .eq("source", "user");
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("dmca_templates")
      .insert({ name: data.name, body: data.body, created_by: context.userId, source: "user" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteMyDmcaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { error } = await context.supabase
      .from("dmca_templates")
      .delete()
      .eq("id", data.id)
      .eq("created_by", context.userId)
      .eq("source", "user");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Reports (per-user) ----------------

export interface UserDmcaReport {
  id: string;
  google_url: string;
  our_url: string | null;
  drive_url: string | null;
  status: string;
  note: string | null;
  reviewer_name: string | null;
  review_text: string | null;
  publication_date: string | null;
  our_publish_date: string | null;
  case_ref: string | null;
  notice_text: string | null;
  template_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUSES = ["pending", "submitted", "accepted", "rejected", "failed"] as const;

export const listMyDmcaReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertUser(context as Ctx);
    const { data, error } = await context.supabase
      .from("user_dmca_reports")
      .select(
        "id, google_url, our_url, drive_url, status, note, reviewer_name, review_text, publication_date, our_publish_date, case_ref, notice_text, template_id, submitted_at, created_at, updated_at",
      )
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as UserDmcaReport[];
  });

const reportInput = z.object({
  googleUrl: z.string().trim().url().max(1000),
  ourUrl: z.union([z.string().trim().url().max(1000), z.literal("")]).optional(),
  driveUrl: z.union([z.string().trim().url().max(1000), z.literal("")]).optional(),
  reviewerName: z.string().trim().max(120).optional(),
  reviewText: z.string().trim().max(10000).optional(),
  publicationDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  ourPublishDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  note: z.string().trim().max(4000).optional(),
  templateId: z.union([z.string().uuid(), z.literal("")]).optional(),
  noticeText: z.string().trim().max(20000).optional(),
});

export const createMyDmcaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reportInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { data: row, error } = await context.supabase
      .from("user_dmca_reports")
      .insert({
        owner_id: context.userId,
        google_url: data.googleUrl,
        our_url: data.ourUrl || null,
        drive_url: data.driveUrl || null,
        reviewer_name: data.reviewerName || null,
        review_text: data.reviewText || null,
        publication_date: data.publicationDate || null,
        our_publish_date: data.ourPublishDate || null,
        note: data.note || null,
        template_id: data.templateId || null,
        notice_text: data.noticeText || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateMyDmcaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(STATUSES).optional(),
        caseRef: z.union([z.string().trim().max(120), z.literal("")]).optional(),
        note: z.union([z.string().trim().max(4000), z.literal("")]).optional(),
        noticeText: z.union([z.string().trim().max(20000), z.literal("")]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) {
      patch["status"] = data.status;
      patch["submitted_at"] =
        data.status === "submitted" || data.status === "accepted" ? new Date().toISOString() : null;
    }
    if (data.caseRef !== undefined) patch["case_ref"] = data.caseRef || null;
    if (data.note !== undefined) patch["note"] = data.note || null;
    if (data.noticeText !== undefined) patch["notice_text"] = data.noticeText || null;
    const { error } = await context.supabase
      .from("user_dmca_reports")
      .update(patch as never)
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyDmcaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertUser(context as Ctx);
    const { error } = await context.supabase
      .from("user_dmca_reports")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Personal extension key ----------------

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "pobu_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const getMyExtensionKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertUser(context as Ctx);
    const { data } = await context.supabase
      .from("user_extension_keys")
      .select("token, created_at, last_used_at")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (data) return data as { token: string; created_at: string; last_used_at: string | null };
    const token = newToken();
    const { data: row, error } = await context.supabase
      .from("user_extension_keys")
      .insert({ owner_id: context.userId, token })
      .select("token, created_at, last_used_at")
      .single();
    if (error) throw new Error(error.message);
    return row as { token: string; created_at: string; last_used_at: string | null };
  });

export const rotateMyExtensionKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertUser(context as Ctx);
    const token = newToken();
    const { error } = await context.supabase
      .from("user_extension_keys")
      .upsert({ owner_id: context.userId, token, created_at: new Date().toISOString(), last_used_at: null });
    if (error) throw new Error(error.message);
    return { token };
  });
