import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DmcaOrderProgress {
  id: string;
  name: string;
  reviewer_key: string;
  published: number;
  reported: number;
  reserved: number;
  remaining: number;
}

export interface DmcaBatchRow {
  id: string;
  order_id: string | null;
  order_name: string | null;
  status: string;
  url_count: number;
  publication_date: string | null;
  google_case_ref: string | null;
  created_at: string;
  submitted_at: string | null;
}

/** Admin-only: the key that the browser extension pastes into its options page. */
export const getDmcaExtensionKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    if (!isAdmin) throw new Error("Forbidden");
    return { key: process.env["DMCA_EXTENSION_KEY"] ?? "" };
  });

export const listDmcaProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: orders, error } = await context.supabase
      .from("review_orders")
      .select("id, name, reviewer_key, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: sources, error: sourcesError } = await context.supabase
      .from("review_sources")
      .select(
        "order_id, review_text, published_review_id, published_profile_review_id, dmca_batch_id, dmca_report_id, dmca_reported_at",
      );
    if (sourcesError) throw new Error(sourcesError.message);

    const rows = sources ?? [];
    return (orders ?? []).map((order) => {
      const eligible = rows.filter(
        (s) =>
          s.order_id === order.id &&
          (s.published_review_id || s.published_profile_review_id) &&
          (s.review_text ?? "").trim().length > 0,
      );
      return {
        id: order.id,
        name: order.name,
        reviewer_key: order.reviewer_key,
        published: eligible.length,
        reported: eligible.filter((s) => s.dmca_reported_at).length,
        reserved: eligible.filter((s) => s.dmca_batch_id && !s.dmca_reported_at).length,
        remaining: eligible.filter((s) => !s.dmca_batch_id && !s.dmca_report_id).length,
      } as DmcaOrderProgress;
    });
  });

export const listDmcaBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("dmca_batches")
      .select("id, order_id, status, url_count, publication_date, google_case_ref, created_at, submitted_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const { data: orders, error: orderError } = await context.supabase
      .from("review_orders")
      .select("id, name");
    if (orderError) throw new Error(orderError.message);
    const names = new Map((orders ?? []).map((o) => [o.id, o.name]));

    return (data ?? []).map((b) => ({
      ...b,
      order_name: b.order_id ? (names.get(b.order_id) ?? null) : null,
    })) as DmcaBatchRow[];
  });

export const setDmcaCaseRef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), caseRef: z.string().trim().max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("dmca_batches")
      .update({ google_case_ref: data.caseRef || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Put a reserved batch's links back in the pool (admin side of /api/public/dmca/release). */
export const releaseDmcaBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: batch, error: readError } = await context.supabase
      .from("dmca_batches")
      .select("id, status")
      .eq("id", data.id)
      .single();
    if (readError) throw new Error(readError.message);
    if (batch.status === "submitted") throw new Error("Already submitted to Google.");

    const { data: rows, error } = await context.supabase
      .from("review_sources")
      .update({ dmca_batch_id: null })
      .eq("dmca_batch_id", data.id)
      .is("dmca_reported_at", null)
      .select("id");
    if (error) throw new Error(error.message);

    const { error: statusError } = await context.supabase
      .from("dmca_batches")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (statusError) throw new Error(statusError.message);

    return { released: (rows ?? []).length };
  });

/** Mark a batch submitted from the dashboard, if the extension did not do it. */
export const markDmcaBatchSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), caseRef: z.string().trim().max(120).optional().default("") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("dmca_batches")
      .update({ status: "submitted", submitted_at: now, google_case_ref: data.caseRef || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { data: rows, error: sourceError } = await context.supabase
      .from("review_sources")
      .update({ dmca_reported_at: now })
      .eq("dmca_batch_id", data.id)
      .select("id");
    if (sourceError) throw new Error(sourceError.message);

    return { reported: (rows ?? []).length };
  });

export interface DmcaReportRow {
  id: string;
  order_id: string | null;
  order_name: string | null;
  status: string;
  google_url: string | null;
  our_url: string | null;
  publication_date: string | null;
  case_ref: string | null;
  error: string | null;
  claimed_at: string;
  submitted_at: string | null;
}

/** One-by-one reports, newest first. */
export const listDmcaReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("dmca_reports")
      .select(
        "id, order_id, status, google_url, our_url, publication_date, case_ref, error, claimed_at, submitted_at",
      )
      .order("claimed_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const { data: orders, error: orderError } = await context.supabase
      .from("review_orders")
      .select("id, name");
    if (orderError) throw new Error(orderError.message);
    const names = new Map((orders ?? []).map((o) => [o.id, o.name]));

    return (data ?? []).map((r) => ({
      ...r,
      order_name: r.order_id ? (names.get(r.order_id) ?? null) : null,
    })) as DmcaReportRow[];
  });

/** Put a stuck single report's review back into the reporting pool. */
export const releaseDmcaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: report, error: readError } = await context.supabase
      .from("dmca_reports")
      .select("id, status, review_source_id")
      .eq("id", data.id)
      .single();
    if (readError) throw new Error(readError.message);
    if (report.status === "submitted") throw new Error("Already submitted to Google.");

    if (report.review_source_id) {
      const { error } = await context.supabase
        .from("review_sources")
        .update({ dmca_report_id: null })
        .eq("id", report.review_source_id)
        .is("dmca_reported_at", null);
      if (error) throw new Error(error.message);
    }

    const { error: statusError } = await context.supabase
      .from("dmca_reports")
      .update({ status: "released" })
      .eq("id", data.id);
    if (statusError) throw new Error(statusError.message);

    return { ok: true };
  });

/**
 * Admin-only: put every review in an order back into the extension queue so it
 * can be reported again. Past report history is kept; only the "already
 * reported / claimed" markers on the reviews are cleared.
 */
export const resetOrderDmcaForReReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Close open claims so they don't linger.
    await supabaseAdmin
      .from("dmca_reports")
      .update({ status: "failed", error: "Reset by admin for re-report." })
      .eq("order_id", data.orderId)
      .in("status", ["claimed", "pending"]);
    const { data: rows, error } = await supabaseAdmin
      .from("review_sources")
      .update({ dmca_report_id: null, dmca_reported_at: null, dmca_batch_id: null })
      .eq("order_id", data.orderId)
      .select("id");
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("review_orders")
      .update({ dmca_next_allowed_at: null })
      .eq("id", data.orderId);
    return { reset: rows?.length ?? 0 };
  });
