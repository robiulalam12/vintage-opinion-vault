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

async function assertOwnsOrder(context: Ctx, orderId: string) {
  const { data, error } = await (context.supabase as any)
    .from("policy_orders")
    .select("created_by, source")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.created_by !== context.userId || data.source !== "user") {
    throw new Error("That order does not belong to you.");
  }
}

async function assertOwnsItems(context: Ctx, ids: string[]) {
  const { data, error } = await (context.supabase as any)
    .from("policy_items")
    .select("id, order_id, policy_orders!inner(created_by, source)")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; policy_orders: { created_by: string; source: string } }[];
  if (rows.length !== ids.length) throw new Error("Some items were not found.");
  if (rows.some((r) => r.policy_orders.created_by !== context.userId || r.policy_orders.source !== "user")) {
    throw new Error("Some items do not belong to you.");
  }
}

export interface PolicyOrder {
  id: string;
  name: string;
  note: string | null;
  created_at: string;
  total: number;
  fetched: number;
  checked: number;
  violations: number;
  reports: number;
}

export interface PolicyItem {
  id: string;
  order_id: string;
  url: string;
  label: string | null;
  fetch_status: string;
  fetch_error: string | null;
  review_text: string | null;
  reviewer_name: string | null;
  rating: number | null;
  business_name: string | null;
  review_published_at: string | null;
  review_age_label: string | null;
  verdict: string | null;
  category: string | null;
  confidence: number | null;
  reason: string | null;
  verdict_manual: boolean;
  check_error: string | null;
  report_text: string | null;
  report_status: string;
  report_error: string | null;
  tags: { code: string; policy: string; severity: string; confidence: number; evidence: string[]; explanation: string; source_url: string | null }[];
  primary_tag: string | null;
  google_reason: string | null;
  language: string | null;
  translation: string | null;
  signals: string[];
}

export const listMyPolicyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PolicyOrder[]> => {
    await assertUser(context);
    const orders = await (context.supabase as any)
      .from("policy_orders")
      .select("id,name,note,created_at")
      .eq("created_by", context.userId)
      .eq("source", "user")
      .order("created_at", { ascending: false });
    if (orders.error) throw new Error(orders.error.message);
    const ids = (orders.data ?? []).map((o: any) => o.id);
    if (!ids.length) return [];
    const items = await (context.supabase as any)
      .from("policy_items")
      .select("order_id,fetch_status,verdict,report_status")
      .in("order_id", ids);
    const rows = (items.data ?? []) as { order_id: string; fetch_status: string; verdict: string | null; report_status: string }[];
    return (orders.data ?? []).map((o: any) => {
      const mine = rows.filter((r) => r.order_id === o.id);
      return {
        ...o,
        total: mine.length,
        fetched: mine.filter((r) => r.fetch_status === "done").length,
        checked: mine.filter((r) => r.verdict).length,
        violations: mine.filter((r) => r.verdict === "violates").length,
        reports: mine.filter((r) => r.report_status === "written" || r.report_status === "submitted").length,
      };
    });
  });

export const createMyPolicyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(2).max(120),
        note: z.string().max(300).default(""),
        links: z.array(z.object({ url: z.string().url(), label: z.string().max(200) })).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context);
    const { data: order, error } = await context.supabase
      .from("policy_orders")
      .insert({ name: data.name, note: data.note || null, created_by: context.userId, source: "user" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const seen = new Set<string>();
    const rows = data.links
      .filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
      .map((l) => ({ order_id: order.id, url: l.url, label: l.label || null }));
    if (rows.length) {
      const { error: e2 } = await (context.supabase as any).from("policy_items").insert(rows);
      if (e2) throw new Error(e2.message);
    }
    return { id: order.id as string, added: rows.length, skipped: data.links.length - rows.length };
  });

export const deleteMyPolicyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertUser(context);
    await assertOwnsOrder(context, data.id);
    const { error } = await (context.supabase as any).from("policy_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyPolicyOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertUser(context);
    await assertOwnsOrder(context, data.id);
    const [o, i] = await Promise.all([
      (context.supabase as any).from("policy_orders").select("id,name,note,created_at").eq("id", data.id).single(),
      (context.supabase as any).from("policy_items").select("*").eq("order_id", data.id).order("created_at"),
    ]);
    if (o.error) throw new Error(o.error.message);
    return { order: o.data as { id: string; name: string; note: string | null; created_at: string }, items: (i.data ?? []) as PolicyItem[] };
  });

const idsInput = (d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(10) }).parse(d);

export const fetchMyPolicyBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertUser(context);
    await assertOwnsItems(context, data.ids);
    const { fetchReviewRaw } = await import("./review-age.server");
    const { data: items } = await (context.supabase as any).from("policy_items").select("id,url").in("id", data.ids);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const list = (items ?? []) as { id: string; url: string }[];
    for (let n = 0; n < list.length; n++) {
      const it = list[n]!;
      if (n > 0) await wait(900);
      let text = "", reviewer: string | null = null, rating: number | null = null, business: string | null = null;
      let publishedAt: string | null = null, ageLabel: string | null = null;
      let firstError: Error | null = null;
      try {
        const r = await fetchReviewRaw(it.url);
        text = r.text ?? ""; reviewer = r.reviewer_name ?? null; rating = r.rating ?? null;
        business = r.business_name ?? null; publishedAt = r.published_at ?? null; ageLabel = r.age_label ?? null;
      } catch (e) {
        firstError = e as Error;
      }
      if (!text.trim() && !/place or profile link/i.test(firstError?.message ?? "")) {
        try {
          const { fetchPageText, extractReviews } = await import("./review-scrape.server");
          const page = await fetchPageText(it.url);
          const reviews = await extractReviews(page.text, page.title, it.url);
          const best = [...reviews].sort((a, b) => b.body.length - a.body.length)[0];
          if (best?.body?.trim()) {
            text = best.body.trim();
            rating = rating ?? best.rating ?? null;
            const subject = best.subject?.trim();
            if (!business && subject && subject !== page.title?.trim()) business = subject.slice(0, 120);
          }
        } catch (e) {
          firstError = firstError ?? (e as Error);
        }
      }
      if (text.trim() && !publishedAt) {
        await wait(2500);
        try {
          const again = await fetchReviewRaw(it.url);
          publishedAt = again.published_at ?? null;
          ageLabel = ageLabel ?? again.age_label ?? null;
          reviewer = reviewer ?? again.reviewer_name ?? null;
        } catch { /* keep text */ }
      }
      const ok = Boolean(text.trim());
      await context.supabase
        .from("policy_items")
        .update(ok
          ? { fetch_status: "done", fetch_error: null, review_text: text, reviewer_name: reviewer, rating, business_name: business, review_published_at: publishedAt, review_age_label: ageLabel }
          : { fetch_status: "failed", fetch_error: (firstError?.message ?? "No review text could be read from this link.").slice(0, 400) })
        .eq("id", it.id);
    }
    return { ok: true };
  });

async function loadTraining(supabase: any) {
  const { data } = await supabase.from("policy_training").select("*").order("created_at");
  return (data ?? []) as any[];
}

const DEFAULT_RULES = `Google Maps prohibited and restricted content policy: spam and fake engagement, off-topic content, restricted content, illegal content, terrorist content, sexually explicit content, offensive content (profanity, slurs), dangerous content, impersonation, conflict of interest, personal information, harassment, hate speech, misinformation.`;

export const classifyMyPolicyBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(10), force: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context);
    await assertOwnsItems(context, data.ids);
    const { azureChat } = await import("./azure-ai.server");
    const engine = await import("./policy-engine.server");
    const training = await loadTraining(context.supabase);
    if (!training.some((t) => t.kind === "rule")) training.push({ kind: "rule", code: "GENERAL", title: "Policy", body: DEFAULT_RULES, label: null, source_url: null });
    const system = engine.buildClassifySystem(training);

    const { data: items } = await (context.supabase as any)
      .from("policy_items")
      .select("id,review_text,rating,business_name,verdict_manual")
      .in("id", data.ids);

    const queue = (items ?? []).filter((it: any) => it.review_text && (data.force || !it.verdict_manual));
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const it = queue[cursor++]!;
        try {
          const raw = await azureChat(
            system,
            `Business: ${it.business_name ?? "unknown"}\nStars: ${it.rating ?? "unknown"}\nReview:\n"""${it.review_text}"""`,
          );
          const c = engine.validateClassification(raw, it.review_text, training);
          await (context.supabase as any)
            .from("policy_items")
            .update({
              verdict: c.verdict,
              category: c.category,
              confidence: c.confidence,
              reason: c.reason,
              tags: c.tags,
              primary_tag: c.primary_tag,
              google_reason: c.google_reason,
              language: c.language,
              translation: c.translation,
              signals: c.signals,
              verdict_manual: false,
              check_error: null,
            })
            .eq("id", it.id);
        } catch (e) {
          await (context.supabase as any)
            .from("policy_items")
            .update({ check_error: (e as Error).message.slice(0, 400) })
            .eq("id", it.id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
    return { ok: true };
  });

export const writeMyReportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertUser(context);
    await assertOwnsItems(context, data.ids);
    const { azureChat } = await import("./azure-ai.server");
    const engine = await import("./policy-engine.server");
    const training = await loadTraining(context.supabase);
    const system = engine.buildReportSystem(training);

    const { data: items } = await (context.supabase as any)
      .from("policy_items")
      .select("id,url,review_text,reviewer_name,rating,business_name,review_published_at,translation,google_reason,primary_tag,tags")
      .in("id", data.ids)
      .eq("verdict", "violates");

    const queue = items ?? [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const it = queue[cursor++]!;
        try {
          let text = (await azureChat(system, engine.buildReportUser(it), false)).trim();
          if (!engine.reportHasRequiredFormat(text, it.tags ?? [], it.primary_tag)) {
            text = (
              await azureChat(
                system,
                `${engine.buildReportUser(it)}

The previous draft below failed the mandatory format or length check. Rewrite it completely. Keep the exact headline, "The Violation:" and "Why it violates policy:" labels, preserve only validated policy names and exact quotes, include the final full-removal request, and stay under 900 characters.

PREVIOUS DRAFT:
${text}`,
                false,
              )
            ).trim();
          }
          if (!engine.reportHasRequiredFormat(text, it.tags ?? [], it.primary_tag)) {
            text = engine.buildGuaranteedReport(it.tags ?? [], it.primary_tag);
          }
          await (context.supabase as any)
            .from("policy_items")
            .update({ report_text: text.trim(), report_status: "written", report_error: null })
            .eq("id", it.id);
        } catch (e) {
          await (context.supabase as any)
            .from("policy_items")
            .update({ report_error: (e as Error).message.slice(0, 400) })
            .eq("id", it.id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
    return { ok: true };
  });

export const updateMyPolicyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        verdict: z.enum(["violates", "clean", "unsure"]).optional(),
        report_text: z.string().max(10000).optional(),
        report_status: z.enum(["none", "written", "submitted"]).optional(),
        remove: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertUser(context);
    await assertOwnsItems(context, [data.id]);
    if (data.remove) {
      await (context.supabase as any).from("policy_items").delete().eq("id", data.id);
      return { ok: true };
    }
    const patch: Record<string, unknown> = {};
    if (data.verdict) Object.assign(patch, { verdict: data.verdict, verdict_manual: true });
    if (data.report_text !== undefined) patch["report_text"] = data.report_text;
    if (data.report_status) patch["report_status"] = data.report_status;
    const { error } = await (context.supabase as any).from("policy_items").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
