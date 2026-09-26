import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DmcaTemplate {
  id: string;
  name: string;
  body: string;
  updated_at: string;
}

export const listDmcaTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("dmca_templates")
      .select("id, name, body, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as DmcaTemplate[];
  });

export const saveDmcaTemplate = createServerFn({ method: "POST" })
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
    if (data.id) {
      const { error } = await context.supabase
        .from("dmca_templates")
        .update({ name: data.name, body: data.body })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("dmca_templates")
      .insert({ name: data.name, body: data.body, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteDmcaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("dmca_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), templateId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("review_orders")
      .update({ dmca_template_id: data.templateId })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Per-order DMCA settings: which link to cite, and the random wait between reports. */
export const setOrderDmcaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        urlMode: z.enum(["site", "drive"]),
        delayMinSeconds: z.number().int().min(0).max(86400),
        delayMaxSeconds: z.number().int().min(0).max(86400),
      })
      .refine((v) => v.delayMaxSeconds >= v.delayMinSeconds, "Max wait must be at least the min wait")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("review_orders")
      .update({
        dmca_url_mode: data.urlMode,
        dmca_delay_min_seconds: data.delayMinSeconds,
        dmca_delay_max_seconds: data.delayMaxSeconds,
        // Changing the timing clears the countdown so new settings apply immediately.
        dmca_next_allowed_at: null,
      })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Store the archived snapshot that proves where and when the text first appeared. */
export const setSourceArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        archiveUrl: z.union([z.string().trim().url().max(1000), z.literal("")]),
        archiveDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("review_sources")
      .update({ archive_url: data.archiveUrl || null, archive_date: data.archiveDate || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
