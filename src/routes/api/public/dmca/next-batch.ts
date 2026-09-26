import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  checkKey,
  originalLinkFor,
  json,
  preflight,
  renderNoticeForSource,
  reviewerDisplayName,
} from "@/lib/dmca.server";

const input = z.object({
  orderId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(90),
});

export const Route = createFileRoute("/api/public/dmca/next-batch")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        if (!checkKey(request)) return json({ error: "Unauthorized" }, 401);

        let parsed: z.infer<typeof input>;
        try {
          parsed = input.parse(await request.json());
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: order, error: orderError } = await supabaseAdmin
          .from("review_orders")
          .select("reviewer_key, dmca_template_id, dmca_url_mode")
          .eq("id", parsed.orderId)
          .maybeSingle();
        if (orderError) return json({ error: orderError.message }, 500);
        if (!order) return json({ error: "This order no longer exists." }, 404);
        if (!order.dmca_template_id) {
          return json(
            { error: "No DMCA copy template selected for this order. Pick one on the order page first." },
            409,
          );
        }
        const { data: template } = await supabaseAdmin
          .from("dmca_templates")
          .select("name, body")
          .eq("id", order.dmca_template_id)
          .maybeSingle();
        if (!template) {
          return json({ error: "The order's DMCA copy template was deleted. Pick another one." }, 409);
        }


        // Candidate pool: published reviews with text that were never put in a batch.
        const { data: pool, error: poolError } = await supabaseAdmin
          .from("review_sources")
          .select("id, url, published_slug, published_path, published_review_date, review_text")
          .eq("order_id", parsed.orderId)
          .or("published_review_id.not.is.null,published_profile_review_id.not.is.null")
          .is("dmca_batch_id", null)
          .order("published_review_date", { ascending: true })
          .limit(parsed.limit * 2);
        if (poolError) return json({ error: poolError.message }, 500);

        const candidates = (pool ?? [])
          .filter((r) => (r.review_text ?? "").trim().length > 0 && r.url)
          .slice(0, parsed.limit);

        if (candidates.length === 0) {
          return json({ error: "No unreported published reviews left in this order." }, 409);
        }

        const { data: batch, error: batchError } = await supabaseAdmin
          .from("dmca_batches")
          .insert({ order_id: parsed.orderId, status: "reserved", url_count: 0 })
          .select("id")
          .single();
        if (batchError) return json({ error: batchError.message }, 500);

        // Atomic claim: only rows still unclaimed get stamped with this batch id.
        const { data: claimed, error: claimError } = await supabaseAdmin
          .from("review_sources")
          .update({ dmca_batch_id: batch.id })
          .in(
            "id",
            candidates.map((c) => c.id),
          )
          .is("dmca_batch_id", null)
          .select(
            "id, url, published_slug, published_path, published_review_date, review_text, reviewer_name, review_published_at, archive_url, archive_date, drive_url",
          );
        if (claimError) {
          await supabaseAdmin.from("dmca_batches").delete().eq("id", batch.id);
          return json({ error: claimError.message }, 500);
        }

        const rows = claimed ?? [];
        if (rows.length === 0) {
          await supabaseAdmin.from("dmca_batches").delete().eq("id", batch.id);
          return json({ error: "Those links were just claimed by another batch. Try again." }, 409);
        }

        const dates = rows
          .map((r) => r.published_review_date)
          .filter((d): d is string => Boolean(d))
          .sort();
        const publicationDate = dates[0] ?? null;

        await supabaseAdmin
          .from("dmca_batches")
          .update({ url_count: rows.length, publication_date: publicationDate })
          .eq("id", batch.id);

        const urlMode = order.dmca_url_mode === "drive" ? "drive" : "site";
        const authorizedExampleUrl = originalLinkFor(rows[0] ?? {}, urlMode);

        return json({
          batchId: batch.id,
          urlCount: rows.length,
          publicationDate,
          authorizedExampleUrl,
          templateName: template.name,
          workDescription: (
            await Promise.all(
              rows.map((r) =>
                renderNoticeForSource(template.body, r, reviewerDisplayName(order.reviewer_key), urlMode),
              ),
            )
          ).join("\n\n"),
          // Raw Google review URLs — never our own review pages.
          infringingUrls: rows.map((r) => r.url),
          ourReviewUrls: rows.map((r) => originalLinkFor(r, urlMode)),
          urlMode,
        });
      },
    },
  },
});
