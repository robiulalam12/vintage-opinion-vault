import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await (context.supabase as any).rpc("can_use_section", {
    _user_id: context.userId,
    _section: "policy",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("You don't have access to the Policy violation tool.");
  // Caller verified above (admin or granted the "policy" section) — use the trusted server client.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  context.supabase = supabaseAdmin;
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

export interface TrainingEntry {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  label: string | null;
  code: string | null;
  source_url: string | null;
  created_at: string;
}

export const listPolicyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PolicyOrder[]> => {
    await assertAdmin(context);
    const [orders, items] = await Promise.all([
      (context.supabase as any).from("policy_orders").select("id,name,note,created_at").order("created_at", { ascending: false }),
      (context.supabase as any).from("policy_items").select("order_id,fetch_status,verdict,report_status"),
    ]);
    if (orders.error) throw new Error(orders.error.message);
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

export const createPolicyOrder = createServerFn({ method: "POST" })
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
    await assertAdmin(context);
    const { data: order, error } = await context.supabase
      .from("policy_orders")
      .insert({ name: data.name, note: data.note || null, created_by: context.userId })
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

export const deletePolicyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context.supabase as any).from("policy_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPolicyOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const [o, i] = await Promise.all([
      (context.supabase as any).from("policy_orders").select("id,name,note,created_at").eq("id", data.id).single(),
      (context.supabase as any).from("policy_items").select("*").eq("order_id", data.id).order("created_at"),
    ]);
    if (o.error) throw new Error(o.error.message);
    return { order: o.data as { id: string; name: string; note: string | null; created_at: string }, items: (i.data ?? []) as PolicyItem[] };
  });

const idsInput = (d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(10) }).parse(d);

/** Fetches review text + Google date for a small batch of items. */
export const fetchPolicyBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { fetchReviewRaw } = await import("./review-age.server");
    const { data: items } = await (context.supabase as any).from("policy_items").select("id,url").in("id", data.ids);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // Root cause of the 429s: every link in a batch hit Google at the same instant
    // and there was no fallback. Now: one link at a time, spaced out, and when
    // Google throttles we read the review page through the scraper instead.
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
        } catch { /* keep text; the date can be retried later */ }
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

async function loadTraining(supabase: any): Promise<TrainingEntry[]> {
  const { data } = await supabase.from("policy_training").select("*").order("created_at");
  return (data ?? []) as TrainingEntry[];
}

const DEFAULT_RULES = `Google Maps prohibited and restricted content policy: spam and fake engagement, off-topic content, restricted content, illegal content, terrorist content, sexually explicit content, offensive content (profanity, slurs), dangerous content, impersonation, conflict of interest, personal information, harassment, hate speech, misinformation.`;

export const classifyPolicyBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(10), force: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { azureChat } = await import("./azure-ai.server");
    const engine = await import("./policy-engine.server");
    const training = (await loadTraining(context.supabase)) as any[];
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

export const writeReportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { azureChat } = await import("./azure-ai.server");
    const engine = await import("./policy-engine.server");
    const training = (await loadTraining(context.supabase)) as any[];
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

export const updatePolicyItem = createServerFn({ method: "POST" })
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
    await assertAdmin(context);
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

export const listTraining = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return loadTraining(context.supabase);
  });

export const saveTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        kind: z.enum(["rule", "example", "report"]),
        title: z.string().max(200).default(""),
        body: z.string().min(1).max(20000),
        label: z.enum(["violates", "clean"]).nullable().default(null),
        code: z.string().max(60).default(""),
        source_url: z.string().max(400).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const row = { kind: data.kind, title: data.title || null, body: data.body, label: data.kind === "example" ? data.label : null, code: data.code.trim().toUpperCase() || null, source_url: data.source_url.trim() || null };
    const q = data.id
      ? (context.supabase as any).from("policy_training").update(row).eq("id", data.id)
      : (context.supabase as any).from("policy_training").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await (context.supabase as any).from("policy_training").delete().eq("id", data.id);
    return { ok: true };
  });
