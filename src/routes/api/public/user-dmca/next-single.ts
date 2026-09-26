import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  json,
  originalLinkFor,
  preflight,
  renderNoticeForSource,
  resolveOwner,
} from "@/lib/user-dmca.server";

const input = z.object({ orderId: z.string().uuid() });

export const Route = createFileRoute("/api/public/user-dmca/next-single")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const auth = await resolveOwner(request);
        if ("error" in auth) return auth.error;

        let parsed: z.infer<typeof input>;
        try {
          parsed = input.parse(await request.json());
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: order, error: oErr } = await supabaseAdmin
          .from("user_review_orders")
          .select(
            "id, name, reviewer_profile_id, dmca_template_id, dmca_url_mode, dmca_next_allowed_at",
          )
          .eq("id", parsed.orderId)
          .eq("owner_id", auth.ownerId)
          .maybeSingle();
        if (oErr) return json({ error: oErr.message }, 500);
        if (!order) return json({ error: "This order no longer exists." }, 404);

        const urlMode = order.dmca_url_mode === "drive" ? "drive" : "review";

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
            { error: "No DMCA copy template selected for this order. Pick one on the order page." },
            409,
          );
        }
        const { data: template, error: tErr } = await supabaseAdmin
          .from("dmca_templates")
          .select("name, body, source, created_by")
          .eq("id", order.dmca_template_id)
          .maybeSingle();
        if (tErr) return json({ error: tErr.message }, 500);
        if (!template || (template.source !== "admin" && template.created_by !== auth.ownerId)) {
          return json({ error: "The order's DMCA template is unavailable. Pick another one." }, 409);
        }

        let reviewerName = "the author";
        if (order.reviewer_profile_id) {
          const { data: profile, error: profileError } = await supabaseAdmin
            .from("user_reviewer_profiles")
            .select("name")
            .eq("id", order.reviewer_profile_id)
            .eq("owner_id", auth.ownerId)
            .maybeSingle();
          if (profileError) return json({ error: profileError.message }, 500);
          if (profile?.name) reviewerName = profile.name;
        }

        // Release abandoned claims older than 15 minutes.
        const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: stale } = await supabaseAdmin
          .from("user_dmca_reports")
          .select("id, source_id")
          .eq("owner_id", auth.ownerId)
          .eq("order_id", parsed.orderId)
          .eq("status", "claimed")
          .lt("claimed_at", staleBefore);
        for (const r of stale ?? []) {
          if (r.source_id) {
            await supabaseAdmin
              .from("user_review_sources")
              .update({ dmca_report_id: null })
              .eq("id", r.source_id)
              .eq("dmca_report_id", r.id)
              .is("dmca_reported_at", null);
          }
          await supabaseAdmin
            .from("user_dmca_reports")
            .update({ status: "failed", error: "Abandoned claim — returned to the pool." })
            .eq("id", r.id);
        }

        const { data: all, error: aErr } = await supabaseAdmin
          .from("user_review_sources")
          .select("id, review_text, published_review_id, dmca_report_id, dmca_reported_at")
          .eq("order_id", parsed.orderId)
          .eq("owner_id", auth.ownerId);
        if (aErr) return json({ error: aErr.message }, 500);

        const eligible = (all ?? []).filter(
          (r) => r.published_review_id && (r.review_text ?? "").trim().length > 0,
        );
        const done = eligible.filter((r) => r.dmca_reported_at).length;

        const { data: pool, error: pErr } = await supabaseAdmin
          .from("user_review_sources")
          .select(
            "id, url, published_slug, published_path, published_review_date, review_text, reviewer_name, review_published_at, drive_url",
          )
          .eq("order_id", parsed.orderId)
          .eq("owner_id", auth.ownerId)
          .not("published_review_id", "is", null)
          .is("dmca_report_id", null)
          .is("dmca_reported_at", null)
          .order("published_review_date", { ascending: true })
          .limit(25);
        if (pErr) return json({ error: pErr.message }, 500);

        const withText = (pool ?? []).filter((r) => r.url && (r.review_text ?? "").trim().length > 0);
        const candidates =
          urlMode === "drive" ? withText.filter((r) => (r.drive_url ?? "").trim()) : withText;

        if (candidates.length === 0 && withText.length > 0) {
          return json(
            {
              error: `${withText.length} review(s) have no Drive screenshot yet. Take screenshots on the order page — checking again shortly.`,
              wait: true,
              retryAfterSeconds: 60,
              progress: { done, total: eligible.length },
            },
            409,
          );
        }
        if (candidates.length === 0) {
          const waiting = eligible.filter((r) => !r.dmca_reported_at).length;
          if (waiting > 0) {
            return json(
              {
                error: `${waiting} review(s) are still in progress. Waiting for them.`,
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
          const ourUrl = originalLinkFor(candidate, urlMode);
          const { data: report, error: rErr } = await supabaseAdmin
            .from("user_dmca_reports")
            .insert({
              owner_id: auth.ownerId,
              order_id: parsed.orderId,
              source_id: candidate.id,
              status: "claimed",
              claimed_at: new Date().toISOString(),
              google_url: candidate.url,
              our_url: ourUrl,
              drive_url: candidate.drive_url,
              reviewer_name: candidate.reviewer_name,
              review_text: candidate.review_text,
              publication_date: candidate.review_published_at
                ? candidate.review_published_at.slice(0, 10)
                : null,
              our_publish_date: candidate.published_review_date,
              template_id: order.dmca_template_id,
            })
            .select("id")
            .single();
          if (rErr) return json({ error: rErr.message }, 500);

          const { data: claimed, error: cErr } = await supabaseAdmin
            .from("user_review_sources")
            .update({ dmca_report_id: report.id })
            .eq("id", candidate.id)
            .is("dmca_report_id", null)
            .select("id");
          if (cErr) {
            await supabaseAdmin.from("user_dmca_reports").delete().eq("id", report.id);
            return json({ error: cErr.message }, 500);
          }
          if (!claimed || claimed.length === 0) {
            await supabaseAdmin.from("user_dmca_reports").delete().eq("id", report.id);
            continue;
          }

          const workDescription = await renderNoticeForSource(
            template.body,
            candidate,
            reviewerName,
            urlMode,
          );
          await supabaseAdmin
            .from("user_dmca_reports")
            .update({ notice_text: workDescription })
            .eq("id", report.id);

          return json({
            reportId: report.id,
            reviewSourceId: candidate.id,
            publicationDate: candidate.published_review_date,
            authorizedExampleUrl: ourUrl,
            ourUrl,
            urlMode,
            templateName: template.name,
            workDescription,
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
