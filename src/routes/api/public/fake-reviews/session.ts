import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkCaptureExtensionKey, json, preflight, probeAccountSignIn } from "@/lib/fake-reviews.server";

const CAPTURE_EXTENSION_VERSION = "3.2.0";

/**
 * Session-only capture. The extension no longer intercepts the full "Report
 * review" request — we already know the canonical endpoint + body shape.
 * All we need per Gmail is the authenticated session bundle:
 *   - cookies for .google.com (drives SAPISID auth)
 *   - the `at` XSRF token (SNlM0e) scraped from the Maps HTML
 *   - the user-agent used when the cookies were minted
 *
 * The server materialises a full replayable template using these values
 * so the firehose can inject any {{REVIEW_ID}} / {{REASON}} at fire time.
 */

// Canonical Google endpoint for the Maps "Report review" submit RPC.
// rpcids=qVL8Rd + source-path=/local/content/rap/report/submit is what the
// live Maps UI posts. `authuser=<N>` is baked in per-template so shared
// cookie jars route the request to the right signed-in account.
function canonicalEndpointFor(authuser: number): string {
  return (
    "https://www.google.com/_/LocalUserPostsRapUi/data/batchexecute" +
    `?rpcids=qVL8Rd&source-path=%2Flocal%2Fcontent%2Frap%2Freport%2Fsubmit` +
    `&authuser=${authuser}&hl=en&soc-app=162&soc-platform=1&soc-device=1&rt=c`
  );
}

// Canonical URL-encoded body. rewriteBatchExecuteBody() in fake-reviews.server
// mutates inner[3]=REVIEW_ID and inner[7]=REASON at fire time.
function buildBodyTemplate(atToken: string): string {
  const inner = JSON.stringify([null, null, null, "{{REVIEW_ID}}", 286732320, 1, "", "{{REASON_NUM}}"]);
  const outer = JSON.stringify([[["qVL8Rd", inner, null, "generic"]]]);
  const params = new URLSearchParams();
  params.set("f.req", outer);
  params.set("at", atToken);
  return params.toString();
}

function buildHeaders(userAgent: string, authuser: number): Record<string, string> {
  return {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "user-agent": userAgent,
    "x-same-domain": "1",
    "x-goog-authuser": String(authuser),
    origin: "https://www.google.com",
    referer: "https://www.google.com/maps",
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
  };
}

const schema = z.object({
  label: z.string().trim().min(1).max(120),
  google_email: z.string().trim().email().optional().nullable(),
  auth_user_index: z.number().int().min(0).max(9).optional().default(0),
  cookie_bundle: z.string().min(20),
  at_token: z.string().min(10),
  user_agent: z.string().min(10),
  notes: z.string().max(500).optional().nullable(),
});

function cookieBundleHasAuth(bundle: string): { ok: true } | { ok: false; reason: string } {
  const names = new Set(
    bundle
      .split(";")
      .map((part) => part.trim().split("=", 1)[0]?.toUpperCase())
      .filter((name): name is string => Boolean(name)),
  );
  if (!["SAPISID", "__SECURE-3PAPISID"].some((name) => names.has(name))) {
    return { ok: false, reason: "Cookie bundle is missing a Google authentication cookie." };
  }
  return { ok: true };
}

export const Route = createFileRoute("/api/public/fake-reviews/session")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async () => json({ ok: true, extension_version: CAPTURE_EXTENSION_VERSION }),
      POST: async ({ request }) => {
        if (!checkCaptureExtensionKey(request)) {
          return json({ error: "Extension access expired. Download the latest capture extension." }, 401);
        }
        let parsed: z.infer<typeof schema>;
        try {
          parsed = schema.parse(await request.json());
        } catch (err) {
          return json({ error: "Invalid payload", detail: (err as Error).message }, 400);
        }

        const authuser = parsed.auth_user_index ?? 0;

        // Reject obviously-wrong bundles immediately (cheap).
        const cookieCheck = cookieBundleHasAuth(parsed.cookie_bundle);
        if (!cookieCheck.ok) {
          return json({ error: cookieCheck.reason }, 400);
        }

        // Prove the cookies actually authenticate for THIS authuser slot
        // before we persist. Without this, a dead bundle is stored as
        // status="fresh" and only fails days later at fire time.
        const probeId = crypto.randomUUID();
        const probe = await probeAccountSignIn({
          id: probeId,
          cookie_bundle: parsed.cookie_bundle,
          headers_json: buildHeaders(parsed.user_agent, authuser),
          auth_user_index: authuser,
        });

        if (!probe.signedIn && probe.conclusive) {
          return json(
            {
              error:
                `Google rejected this session for authuser=${authuser}: ${probe.reason}. ` +
                `Re-export cookies from the currently-signed-in account, and make sure the authuser index matches (0 = primary, 1/2/… = extras).`,
            },
            422,
          );
        }

        // Inconclusive probes (relay/proxy down, Google HTML shape change)
        // still get stored — but as "stale" so they don't enter orders as
        // if they were verified.
        const initialStatus = probe.signedIn ? "fresh" : "stale";
        const probeNote = probe.signedIn
          ? `verified sign-in at upload (authuser=${authuser})`
          : `unverified at upload — probe inconclusive: ${probe.reason ?? "unknown"}`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("fake_review_templates")
          .insert({
            label: parsed.label,
            google_email: parsed.google_email ?? null,
            auth_user_index: authuser,
            endpoint_url: canonicalEndpointFor(authuser),
            method: "POST",
            headers_json: buildHeaders(parsed.user_agent, authuser),
            cookie_bundle: parsed.cookie_bundle,
            body_template: buildBodyTemplate(parsed.at_token),
            body_kind: "form",
            status: initialStatus,
            last_verified_at: probe.signedIn ? new Date().toISOString() : null,
            notes:
              (parsed.notes ? parsed.notes + " — " : "") +
              `${probeNote}; captured at=${parsed.at_token.slice(0, 6)}…`,
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({
          ok: true,
          id: data.id,
          status: initialStatus,
          probe: { signedIn: probe.signedIn, conclusive: probe.conclusive, reason: probe.reason },
        });
      },
    },
  },
});