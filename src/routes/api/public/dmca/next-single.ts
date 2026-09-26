import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  checkKey,
  json,
  originalLinkFor,
  preflight,
  renderNoticeForSource,
  reviewerDisplayName,
} from "@/lib/dmca.server";

const input = z.object({ orderId: z.string().uuid() });

export const Route = createFileRoute("/api/public/dmca/next-single")({
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

        // The notice text always comes from the order's selected DMCA copy template.
        const { data: order, error: orderError } = await supabaseAdmin
          .from("review_orders")
          .select("reviewer_key, dmca_template_id, dmca_url_mode, dmca_next_allowed_at")
          .eq("id", parsed.orderId)
          .maybeSingle();
        if (orderError) return json({ error: orderError.message }, 500);
        if (!order) return json({ error: "This order no longer exists." }, 404);
        const urlMode = order.dmca_url_mode === "drive" ? "drive" : "site";

        // Safenet: server-enforced random wait between reports (set after each confirm).
        if (order.dmca_next_allowed_at) {
          const waitMs = new Date(order.dmca_next_allowed_at).getTime() - Date.now();
          if (waitMs > 1000) {
            const retryAfterSeconds = Math.ceil(waitMs / 1000);
            return json(
              {
                error: `Delay active — next review allowed in ${retryAfterSeconds}s.`,
                wait: true,
                delay: true,
                retryAfterSeconds,
              },
              409,
            );
          }
        }
        if (!order.dmca_template_id) {
          return json(
            { error: "No DMCA copy template selected for this order. Pick one on the order page first." },
            409,
          );
        }
        const { data: template, error: templateError } = await supabaseAdmin
          .from("dmca_templates")
          .select("name, body")
          .eq("id", order.dmca_template_id)
          .maybeSingle();
        if (templateError) return json({ error: templateError.message }, 500);
        if (!template) {
          return json({ error: "The order's DMCA copy template was deleted. Pick another one." }, 409);
        }


        // Recover abandoned claims: a claim that never reached Google (tab closed,
        // page reloaded, extension restarted) used to block its review forever,
        // so the run finished with links missing. Claims older than 15 minutes
        // (longer than any fill + captcha + submit cycle) go back into the pool.
        const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: stale, error: staleError } = await supabaseAdmin
          .from("dmca_reports")
          .select("id, review_source_id")
          .eq("order_id", parsed.orderId)
          .eq("mode", "single")
          .eq("status", "claimed")
          .lt("claimed_at", staleBefore);
        if (staleError) return json({ error: staleError.message }, 500);
        for (const r of stale ?? []) {
          if (r.review_source_id) {
            await supabaseAdmin
              .from("review_sources")
              .update({ dmca_report_id: null })
              .eq("id", r.review_source_id)
              .eq("dmca_report_id", r.id)
              .is("dmca_reported_at", null);
          }
          await supabaseAdmin
            .from("dmca_reports")
            .update({ status: "failed", error: "Abandoned claim — returned to the pool automatically." })
            .eq("id", r.id);
        }

        // Progress counters for the run panel.
        const { data: all, error: allError } = await supabaseAdmin
          .from("review_sources")
          .select("id, review_text, published_review_id, published_profile_review_id, dmca_report_id, dmca_reported_at")
          .eq("order_id", parsed.orderId);
        if (allError) return json({ error: allError.message }, 500);

        const eligible = (all ?? []).filter(
          (r) =>
            (r.published_review_id || r.published_profile_review_id) &&
            (r.review_text ?? "").trim().length > 0,
        );
        const done = eligible.filter((r) => r.dmca_reported_at).length;

        // Candidate pool: published, has text, never claimed by a batch or single report.
        const { data: pool, error: poolError } = await supabaseAdmin
          .from("review_sources")
          .select(
            "id, url, published_slug, published_path, published_review_date, review_text, reviewer_name, review_published_at, archive_url, archive_date, drive_url",
          )
          .eq("order_id", parsed.orderId)
          .or("published_review_id.not.is.null,published_profile_review_id.not.is.null")
          .is("dmca_report_id", null)
          .is("dmca_reported_at", null)
          .order("published_review_date", { ascending: true })
          .limit(25);
        if (poolError) return json({ error: poolError.message }, 500);

        const withText = (pool ?? []).filter(
          (r) => r.url && (r.review_text ?? "").trim().length > 0,
        );
        // Drive mode never falls back to our site URL: reviews without a Drive
        // screenshot wait until one is taken instead of being reported with the wrong link.
        const candidates =
          urlMode === "drive" ? withText.filter((r) => (r.drive_url ?? "").trim()) : withText;
        if (candidates.length === 0 && withText.length > 0) {
          return json(
            {
              error: `${withText.length} review(s) have no Drive screenshot link yet. Take screenshots on the order page — checking again shortly.`,
              wait: true,
              retryAfterSeconds: 60,
              progress: { done, total: eligible.length },
            },
            409,
          );
        }
        if (candidates.length === 0) {
          // Unreported reviews still exist but are claimed right now (in progress):
          // the run must wait for them, not finish.
          const waiting = eligible.filter((r) => !r.dmca_reported_at).length;
          if (waiting > 0) {
            return json(
              {
                error: `${waiting} review(s) are still in progress. Waiting for them before finishing.`,
                wait: true,
                progress: { done, total: eligible.length },
              },
              409,
            );
          }
          return json(
            {
              error: "No unreported published reviews left in this order.",
              done: true,
              progress: { done, total: eligible.length },
            },
            409,
          );
        }

        for (const candidate of candidates) {
          const { data: report, error: reportError } = await supabaseAdmin
            .from("dmca_reports")
            .insert({
              order_id: parsed.orderId,
              review_source_id: candidate.id,
              mode: "single",
              status: "claimed",
              google_url: candidate.url,
              our_url: originalLinkFor(candidate, urlMode),
              publication_date: candidate.published_review_date,
            })
            .select("id")
            .single();
          if (reportError) return json({ error: reportError.message }, 500);

          // Atomic claim — only wins if still unclaimed.
          const { data: claimed, error: claimError } = await supabaseAdmin
            .from("review_sources")
            .update({ dmca_report_id: report.id })
            .eq("id", candidate.id)
            .is("dmca_report_id", null)
            .select("id");
          if (claimError) {
            await supabaseAdmin.from("dmca_reports").delete().eq("id", report.id);
            return json({ error: claimError.message }, 500);
          }
          if (!claimed || claimed.length === 0) {
            // Someone else took it — drop the placeholder and try the next one.
            await supabaseAdmin.from("dmca_reports").delete().eq("id", report.id);
            continue;
          }

          const ourUrl = originalLinkFor(candidate, urlMode);

          return json({
            reportId: report.id,
            reviewSourceId: candidate.id,
            publicationDate: candidate.published_review_date,
            authorizedExampleUrl: ourUrl,
            ourUrl,
            urlMode,
            templateName: template.name,
            workDescription: await renderNoticeForSource(
              template.body,
              candidate,
              reviewerDisplayName(order.reviewer_key),
              urlMode,
            ),
            infringingUrls: [candidate.url],
            urlCount: 1,
            progress: { done, total: eligible.length },
          });
        }

        return json({ error: "All candidate links were just claimed. Try again." }, 409);
      },
    },
  },
});
