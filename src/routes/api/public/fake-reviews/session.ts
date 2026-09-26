import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkCaptureExtensionKey, json, preflight, probeAccountSignIn } from "@/lib/fake-reviews.server";

const CAPTURE_EXTENSION_VERSION = "3.3.0";

/**
 * Session-only capture. The extension no longer intercepts the full "Report
 * review" request — we already know the canonical endpoint + body shape.
 * All we need per Gmail is the authenticated session bundle:
 *   - cookies for .google.com (drives SAPISID auth)
 *   - the `at` XSRF token (SNlM0e) scraped from the Maps HTML
 *   - the user-agent used when the cookies were minted
 *
 * v3.3.0 additionally captures the *live* URL + attestation headers from the
 * browser's own Report Review request, because Google now rejects a
 * reconstructed URL/headers that's missing `bl`, `f.sid`, `_reqid`,
 * `x-client-data`, or `x-browser-validation`.
 */

// Canonical Google endpoint. Used only as a fallback when the extension does
// not supply a live captured URL. `authuser=<N>` is baked in per-template so
// shared cookie jars route the request to the right signed-in account.
function canonicalEndpointFor(authuser: number, hl = "en-GB"): string {
  return (
    "https://www.google.com/_/LocalUserPostsRapUi/data/batchexecute" +
    `?rpcids=qVL8Rd&source-path=%2Flocal%2Fcontent%2Frap%2Freport%2Fsubmit` +
    `&authuser=${authuser}&hl=${encodeURIComponent(hl)}` +
    `&soc-app=162&soc-platform=1&soc-device=1&rt=c`
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

/**
 * Builds the header set Google expects. If the extension captured the live
 * request's headers, we forward them verbatim — including the attestation
 * headers that Google now appears to require:
 *
 *   x-client-data         — client variation IDs; missing → generic 400
 *   x-browser-validation  — signed attestation
 *   x-browser-channel / x-browser-year / x-browser-copyright
 *   sec-ch-ua*            — client hints
 */
function buildHeaders(
  userAgent: string,
  authuser: number,
  live?: {
    x_client_data?: string | null;
    x_browser_validation?: string | null;
    sec_ch_ua?: string | null;
    sec_ch_ua_platform?: string | null;
  },
): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "user-agent": userAgent,
    "x-same-domain": "1",
    "x-goog-authuser": String(authuser),
    origin: "https://www.google.com",
    referer: "https://www.google.com/",
    accept: "*/*",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
  };
  if (live?.x_client_data) h["x-client-data"] = live.x_client_data;
  if (live?.x_browser_validation) h["x-browser-validation"] = live.x_browser_validation;
  if (live?.sec_ch_ua) h["sec-ch-ua"] = live.sec_ch_ua;
  if (live?.sec_ch_ua_platform) h["sec-ch-ua-platform"] = live.sec_ch_ua_platform;
  // Browser attestation headers Google's UI always sends; safe defaults when
  // the extension didn't supply them.
  h["x-browser-channel"] = "stable";
  h["x-browser-year"] = String(new Date().getFullYear());
  h["x-browser-copyright"] = `Copyright ${new Date().getFullYear()} Google LLC. All Rights Reserved.`;
  return h;
}

/** Quick check before we bother the probe. */
function cookieBundleHasAuth(raw: string): { ok: true } | { ok: false; reason: string } {
  const required = ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"];
  const lower = raw.toLowerCase();
  const present = required.filter((n) => lower.includes(n.toLowerCase()));
  if (present.length === 0) {
    return {
      ok: false,
      reason: `Cookie bundle is missing all of ${required.join(", ")}. Google auth cannot be signed without at least one.`,
    };
  }
  return { ok: true };
}

const schema = z.object({
  label: z.string().trim().min(1).max(120),
  google_email: z.string().trim().email().optional().nullable(),
  auth_user_index: z.number().int().min(0).max(9).optional().default(0),
  cookie_bundle: z.string().min(20),
  at_token: z.string().min(10),
  user_agent: z.string().min(10),
  notes: z.string().max(500).optional().nullable(),

  // ── v3.3.0 live-capture fields (all optional for backward compat) ───────
  // When present, these override the reconstructed URL/headers so we send
  // exactly what the browser sent. This is the fix for the 400/code-4 path.
  endpoint_url: z.string().url().optional().nullable(),
  hl: z.string().min(2).max(10).optional().nullable(),
  f_sid: z.string().optional().nullable(),
  bl: z.string().optional().nullable(),
  reqid: z.string().optional().nullable(),
  x_client_data: z.string().optional().nullable(),
  x_browser_validation: z.string().optional().nullable(),
  sec_ch_ua: z.string().optional().nullable(),
  sec_ch_ua_platform: z.string().optional().nullable(),
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

        const authuser = parsed.auth_user_index ?? 0;
        const hl = (parsed.hl || "en-GB").trim();

        const cookieCheck = cookieBundleHasAuth(parsed.cookie_bundle);
        if (!cookieCheck.ok) {
          return json({ error: cookieCheck.reason }, 400);
        }

        // Prefer the live captured URL verbatim; otherwise reconstruct. If we
        // have f.sid/bl/_reqid but no full URL, splice them into the fallback.
        let endpointUrl: string;
        if (parsed.endpoint_url) {
          endpointUrl = parsed.endpoint_url;
        } else {
          endpointUrl = canonicalEndpointFor(authuser, hl);
          if (parsed.f_sid) endpointUrl += `&f.sid=${encodeURIComponent(parsed.f_sid)}`;
          if (parsed.bl) endpointUrl += `&bl=${encodeURIComponent(parsed.bl)}`;
          if (parsed.reqid) endpointUrl += `&_reqid=${encodeURIComponent(parsed.reqid)}`;
        }

        const headers = buildHeaders(parsed.user_agent, authuser, {
          x_client_data: parsed.x_client_data,
          x_browser_validation: parsed.x_browser_validation,
          sec_ch_ua: parsed.sec_ch_ua,
          sec_ch_ua_platform: parsed.sec_ch_ua_platform,
        });

        // Probe sign-in against the exact slot we're about to use.
        const probe = await probeAccountSignIn({
          id: `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          cookie_bundle: parsed.cookie_bundle,
          headers_json: headers,
          auth_user_index: authuser,
        });

        if (!probe.signedIn && probe.conclusive) {
          return json(
            {
              error:
                `Google rejected this session for authuser=${authuser}: ${probe.reason}. ` +
                `Re-export cookies from the currently-signed-in account and confirm the authuser index.`,
            },
            422,
          );
        }

        const initialStatus = probe.signedIn ? "fresh" : "stale";
        const probeNote = probe.signedIn
          ? `verified sign-in at upload (authuser=${authuser}, hl=${hl})`
          : `unverified at upload — probe inconclusive: ${probe.reason ?? "unknown"}`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("fake_review_templates")
          .insert({
            label: parsed.label,
            google_email: parsed.google_email ?? null,
            auth_user_index: authuser,
            endpoint_url: endpointUrl,
            method: "POST",
            headers_json: headers,
            cookie_bundle: parsed.cookie_bundle,
            body_template: buildBodyTemplate(parsed.at_token),
            body_kind: "form",
            status: initialStatus,
            last_verified_at: probe.signedIn ? new Date().toISOString() : null,
            notes:
              (parsed.notes ? parsed.notes + " — " : "") + `${probeNote}; captured at=${parsed.at_token.slice(0, 6)}…`,
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);

        return json({
          ok: true,
          id: data.id,
          status: initialStatus,
          probe: {
            signedIn: probe.signedIn,
            conclusive: probe.conclusive,
            reason: probe.reason,
          },
          endpoint_url_used: endpointUrl,
          has_client_data: !!parsed.x_client_data,
        });
      },
    },
  },
});
