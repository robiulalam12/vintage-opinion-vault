/* Shared firing core used by instant waves and the drip-feed ticker. */
import { fireOnce, fireInChunks, REASON_CODES } from "@/lib/fake-reviews.server";

export async function fireOrderCore(supabaseAdmin: any, orderId: string, max: number) {
    const data = { id: orderId, max };
    const { data: order, error } = await supabaseAdmin
      .from("fake_review_orders")
      .select("id,review_id,feature_id,reason_code,comment_tag,shots_per_template,template_ids,status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");
    if (order.status === "cancelled") return { ok: false, done: true, fired: 0, remaining: 0 };
    if (!order.review_id) throw new Error("Order has no review id");

    const { data: templates, error: tErr } = await supabaseAdmin
      .from("fake_review_templates")
      .select("*")
      .in("id", order.template_ids)
      .in("status", ["fresh", "stale"]);
    if (tErr) throw new Error(tErr.message);
    if (!templates || templates.length === 0) {
      await supabaseAdmin
        .from("fake_review_orders")
        .update({ status: "done", done_at: new Date().toISOString() })
        .eq("id", order.id);
      return { ok: true, done: true, fired: 0, remaining: 0, reason: "no-templates" };
    }

    // Count what's already been fired to know what's left.
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("fake_review_shots")
      .select("template_id")
      .eq("order_id", order.id);
    if (exErr) throw new Error(exErr.message);
    const firedBy = new Map<string, number>();
    for (const row of existing ?? []) {
      const key = String(row.template_id ?? "");
      firedBy.set(key, (firedBy.get(key) ?? 0) + 1);
    }

    // Build the wave by interleaving templates: each successive shot comes from
    // a different (randomly picked) template, instead of draining one template
    // fully before moving to the next.
    const perTemplate = order.shots_per_template;
    const plan: Array<{ template: any; sequence: number }> = [];
    const pool = templates
      .map((t: any) => ({
        template: t,
        next: firedBy.get(t.id) ?? 0,
        remaining: Math.max(0, perTemplate - (firedBy.get(t.id) ?? 0)),
      }))
      .filter((p: any) => p.remaining > 0);
    let lastId: string | null = null;
    while (plan.length < data.max && pool.length > 0) {
      let choices = pool.filter((p: any) => p.template.id !== lastId);
      if (choices.length === 0) choices = pool;
      const pick = choices[Math.floor(Math.random() * choices.length)]!;
      plan.push({ template: pick.template, sequence: pick.next });
      pick.next += 1;
      pick.remaining -= 1;
      lastId = pick.template.id;
      if (pick.remaining <= 0) pool.splice(pool.indexOf(pick), 1);
    }


    let totalRemaining = 0;
    for (const t of templates) {
      totalRemaining += Math.max(0, perTemplate - (firedBy.get(t.id) ?? 0));
    }

    if (plan.length === 0) {
      await supabaseAdmin
        .from("fake_review_orders")
        .update({ status: "done", done_at: new Date().toISOString() })
        .eq("id", order.id);
      return { ok: true, done: true, fired: 0, remaining: 0 };
    }

    if (order.status !== "firing" && !String(order.status).startsWith("drip:")) {
      const patch: { status: string; fired_at?: string } = { status: "firing" };
      if (order.status === "draft") patch.fired_at = new Date().toISOString();
      await supabaseAdmin.from("fake_review_orders").update(patch).eq("id", order.id);
    }

    const reasonNum = String(REASON_CODES[order.reason_code as keyof typeof REASON_CODES] ?? 1);

    // Pool of active comments; one is picked at random per shot to fill
    // Google's optional inner[6] free-text field instead of leaving it "".
    let commentQuery = supabaseAdmin
      .from("fake_review_comments")
      .select("id,text,times_used")
      .eq("active", true);
    if (order.comment_tag) commentQuery = commentQuery.eq("tag", order.comment_tag);
    const { data: commentRows } = await commentQuery;
    const commentPool = (commentRows ?? []) as Array<{
      id: string;
      text: string;
      times_used: number;
    }>;
    const pickComment = (): { id: string | null; text: string } => {
      if (commentPool.length === 0) return { id: null, text: "" };
      const row = commentPool[Math.floor(Math.random() * commentPool.length)]!;
      return { id: row.id, text: row.text };
    };
    const commentUsage = new Map<string, number>();

    const shotRows: Array<{
      order_id: string;
      template_id: string;
      sequence: number;
      http_status: number | null;
      latency_ms: number;
      response_snippet: string;
      error: string | null;
    }> = [];
    const expired = new Set<string>();

    await fireInChunks(plan, async (job) => {
      const picked = pickComment();
      if (picked.id) commentUsage.set(picked.id, (commentUsage.get(picked.id) ?? 0) + 1);
      const res = await fireOnce(job.template, {
        REVIEW_ID: order.review_id!,
        FEATURE_ID: order.feature_id ?? "0x0:0x0",
        REASON: reasonNum,
        REASON_NAME: String(order.reason_code),
        COMMENT: picked.text,
      });
      // Only Google-side auth rejection marks a template expired. Relay/proxy
      // faults (407, timeouts, relay 401) used to flip good sessions dead,
      // which is why "valid cookies → expired" happened even for one report.
      if (res.authFailed) {
        expired.add(job.template.id);
      }
      shotRows.push({
        order_id: order.id,
        template_id: job.template.id,
        sequence: job.sequence,
        http_status: res.status,
        latency_ms: res.latency,
        response_snippet: res.snippet,
        error: res.error,
      });
    });

    for (const [id, n] of commentUsage) {
      const row = commentPool.find((c) => c.id === id);
      if (!row) continue;
      await supabaseAdmin
        .from("fake_review_comments")
        .update({ times_used: row.times_used + n })
        .eq("id", id);
    }

    if (shotRows.length > 0) {
      await supabaseAdmin.from("fake_review_shots").insert(shotRows);
      // Bump per-template counters.
      const perTpl = new Map<string, number>();
      for (const r of shotRows) perTpl.set(r.template_id, (perTpl.get(r.template_id) ?? 0) + 1);
      for (const [id, n] of perTpl) {
        const tpl = templates.find((x: any) => x.id === id);
        await supabaseAdmin
          .from("fake_review_templates")
          .update({
            shots_fired: (tpl?.shots_fired ?? 0) + n,
            last_fired_at: new Date().toISOString(),
            ...(expired.has(id) ? { status: "expired", last_error: "auth rejected during fire" } : {}),
          })
          .eq("id", id);
      }
    }

    const remaining = Math.max(0, totalRemaining - shotRows.length);
    if (remaining === 0) {
      await supabaseAdmin
        .from("fake_review_orders")
        .update({ status: "done", done_at: new Date().toISOString() })
        .eq("id", order.id);
    }

    return { ok: true, done: remaining === 0, fired: shotRows.length, remaining };
}

/* ------------------------------- drip feed -------------------------------- */
/**
 * Drip orders store their config in the status column as "drip:MIN:MAX"
 * (seconds) and their next due time in done_at. When the order finishes,
 * fireOrderCore flips status to "done" and done_at to the real finish time.
 */
export function parseDrip(status: string): { min: number; max: number } | null {
  const m = /^drip:(\d+):(\d+)$/.exec(status ?? "");
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

function randomDelayMs(min: number, max: number) {
  return (min + Math.random() * Math.max(0, max - min)) * 1000;
}

/** Runs for up to `budgetMs`, firing one shot per due drip order. */
export async function runDripTick(supabaseAdmin: any, budgetMs = 50_000) {
  const started = Date.now();
  let fired = 0;
  const log: string[] = [];
  for (let loop = 0; loop < 200; loop++) {
    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabaseAdmin
      .from("fake_review_orders")
      .select("id,status")
      .like("status", "drip:%")
      .lte("done_at", nowIso)
      .limit(20);
    if (error) throw new Error(error.message);
    for (const o of due ?? []) {
      const cfg = parseDrip(o.status);
      if (!cfg) continue;
      // Atomic claim: push next due far out so concurrent ticks skip it.
      const { data: claimed } = await supabaseAdmin
        .from("fake_review_orders")
        .update({ done_at: new Date(Date.now() + 10 * 60_000).toISOString() })
        .eq("id", o.id)
        .eq("status", o.status)
        .lte("done_at", nowIso)
        .select("id");
      if (!claimed || claimed.length === 0) continue;
      let next = new Date(Date.now() + randomDelayMs(cfg.min, cfg.max)).toISOString();
      try {
        const res = await fireOrderCore(supabaseAdmin, o.id, 1);
        fired += res.fired;
        log.push(`${o.id.slice(0, 8)}: fired ${res.fired}, remaining ${res.remaining}`);
        if (res.done) continue; // core already set status=done
      } catch (err) {
        log.push(`${o.id.slice(0, 8)}: error ${(err as Error).message}`);
        next = new Date(Date.now() + 60_000).toISOString();
      }
      await supabaseAdmin
        .from("fake_review_orders")
        .update({ done_at: next })
        .eq("id", o.id)
        .eq("status", o.status);
    }
    // Sleep until the next due drip if it lands inside our budget.
    const left = budgetMs - (Date.now() - started);
    if (left < 2000) break;
    const { data: upcoming } = await supabaseAdmin
      .from("fake_review_orders")
      .select("done_at")
      .like("status", "drip:%")
      .order("done_at", { ascending: true })
      .limit(1);
    const nextAt = upcoming?.[0]?.done_at ? new Date(upcoming[0].done_at).getTime() : null;
    if (!nextAt) break;
    const wait = Math.max(500, nextAt - Date.now());
    if (wait > left - 1000) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  return { fired, log, ms: Date.now() - started };
}
