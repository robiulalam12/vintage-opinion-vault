/**
 * Admin CRUD for the pool of optional comment strings that get injected
 * into each fake-review report. Google's report submit body has an
 * optional free-text field at inner[6] — captured as "" in our template.
 * At fire time the firehose picks one active comment at random per shot
 * so each report to Google carries a unique note instead of blank.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface FakeCommentRow {
  id: string;
  text: string;
  active: boolean;
  times_used: number;
  created_at: string;
}

/** Admins, plus any account granted the "fake_reviews" dashboard section. */
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("can_use_section", {
    _user_id: context.userId,
    _section: "fake_reviews",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access not granted");
}

export const listComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("fake_review_comments")
      .select("id,text,active,times_used,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as FakeCommentRow[];
  });

/**
 * Accepts a bulk paste: one comment per line, blank lines ignored.
 * Trimmed, deduplicated against the existing rows, inserted as active=true.
 */
export const addComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ text: z.string().min(1).max(200000) }).parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
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
      .in("text", lines);
    const seen = new Set((existing ?? []).map((r: any) => r.text as string));
    const fresh = lines.filter((l) => !seen.has(l));
    if (fresh.length === 0) return { added: 0, skipped: lines.length };

    const rows = fresh.map((text) => ({ text, created_by: context.userId }));
    const { error } = await supabaseAdmin.from("fake_review_comments").insert(rows);
    if (error) throw new Error(error.message);
    return { added: fresh.length, skipped: lines.length - fresh.length };
  });

export const toggleComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(v),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fake_review_comments")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fake_review_comments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAllComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fake_review_comments")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
