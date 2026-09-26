import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkCaptureExtensionKey, json, preflight } from "@/lib/fake-reviews.server";

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
// live Maps UI posts. f.sid / bl / _reqid are optional in practice.
const CANONICAL_ENDPOINT =
  "https://www.google.com/_/LocalUserPostsRapUi/data/batchexecute" +
  "?rpcids=qVL8Rd&source-path=%2Flocal%2Fcontent%2Frap%2Freport%2Fsubmit" +
  "&hl=en&soc-app=162&soc-platform=1&soc-device=1&rt=c";

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

function buildHeaders(userAgent: string): Record<string, string> {
  return {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "user-agent": userAgent,
    "x-same-domain": "1",
    "origin": "https://www.google.com",
    "referer": "https://www.google.com/maps",
    "accept": "*/*",
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("fake_review_templates")
          .insert({
            label: parsed.label,
            google_email: parsed.google_email ?? null,
            auth_user_index: parsed.auth_user_index ?? 0,
            endpoint_url: CANONICAL_ENDPOINT,
            method: "POST",
            headers_json: buildHeaders(parsed.user_agent),
            cookie_bundle: parsed.cookie_bundle,
            body_template: buildBodyTemplate(parsed.at_token),
            body_kind: "form",
            status: "fresh",
            notes:
              (parsed.notes ? parsed.notes + " — " : "") +
              `session-only capture at=${parsed.at_token.slice(0, 6)}…`,
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, id: data.id });
      },
    },
  },
});
