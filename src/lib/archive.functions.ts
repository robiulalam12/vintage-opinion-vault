import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OldSiteReviewRow {
  id: string;
  reviewer_name: string;
  review_date: string | null;
  review_text: string;
  business_name: string | null;
  created_at: string;
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Access not granted");
}

export const listOldSiteReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { data, error } = await context.supabase
      .from("old_site_reviews")
      .select("id, reviewer_name, review_date, review_text, business_name, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const { count, error: countError } = await context.supabase
      .from("old_site_reviews")
      .select("id", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);

    return { rows: (data ?? []) as OldSiteReviewRow[], total: count ?? 0 };
  });

const rowSchema = z.object({
  reviewer_name: z.string().trim().min(1).max(200),
  review_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  review_text: z.string().trim().min(1).max(20000),
  business_name: z.string().trim().max(300).nullable().optional(),
});

export const importOldSiteReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(rowSchema).min(1).max(5000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const payload = data.rows.map((r) => ({
      reviewer_name: r.reviewer_name,
      review_date: r.review_date ?? null,
      review_text: r.review_text,
      business_name: r.business_name || null,
      created_by: context.userId,
    }));

    let inserted = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { data: rows, error } = await context.supabase
        .from("old_site_reviews")
        .insert(chunk)
        .select("id");
      if (error) throw new Error(error.message);
      inserted += (rows ?? []).length;
    }
    return { inserted };
  });

export const deleteOldSiteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await context.supabase.from("old_site_reviews").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
