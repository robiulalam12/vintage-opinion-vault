/**
 * Server-only helpers for the Report One system.
 *
 * Rule: ONE saved session sends ONE report. No template pool multiplier,
 * no per-shot text randomisation beyond the single description you write.
 * The unique index on report_one_shots(order_id, template_id) enforces this.
 */

import { createHash } from "crypto";

const REPORT_ONE_ENDPOINT =
  "https://legalremovalsintake-pa.clients6.google.com/v1/forms/legal_other_geo:submit";
const REPORT_ONE_ORIGIN = "https://reportcontent.google.com";

export type ReportOneTemplate = {
  id: string;
  label: string;
  google_email: string | null;
  cookie_bundle: string | null;
  headers_json?: Record<string, string> | null;
  auth_user_index?: number | null;
};


export type ReportOneFormFields = {
  category: string; // e.g. child_sexual_abuse_and_exploitation
  reporterName: string;
  region: string; // ISO country code, e.g. "GB"
  reviewUrl: string;
  description: string;
};

/** Parses a Google Maps review URL into a compact shareable form. */
export function normaliseReviewUrl(input: string): string {
  const trimmed = (input || "").trim();
  return trimmed;
}

/** Extract the SAPISID (or __Secure-1PAPISID / __Secure-3PAPISID fallback) cookie. */
function pickSapisid(cookieBundle: string | null): string | null {
  if (!cookieBundle) return null;
  const pairs = cookieBundle.split(/;\s*/);
  const map = new Map<string, string>();
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return (
    map.get("SAPISID") ||
    map.get("__Secure-1PAPISID") ||
    map.get("__Secure-3PAPISID") ||
    null
  );
}

/** SAPISIDHASH = sha1(`${ts} ${sapisid} ${origin}`), header value: `SAPISIDHASH ${ts}_${hash}`. */
export function buildSapisidHash(sapisid: string, origin = REPORT_ONE_ORIGIN): string {
  const ts = Math.floor(Date.now() / 1000);
  const hash = createHash("sha1").update(`${ts} ${sapisid} ${origin}`).digest("hex");
  return `SAPISIDHASH ${ts}_${hash}`;
}

/** Builds the JSON+protobuf body Google expects for legal_other_geo:submit. */
export function buildReportOneBody(
  form: ReportOneFormFields,
  challengeToken: string,
): unknown[] {
  const fields: unknown[] = [
    ["geolocation", ["type.googleapis.com/google.protobuf.StringValue", [form.region]]],
    ["product", ["type.googleapis.com/google.protobuf.StringValue", ["geo"]]],
    ["representing-myself", ["type.googleapis.com/google.protobuf.StringValue", ["Myself"]]],
    ["region", ["type.googleapis.com/google.protobuf.StringValue", [form.region]]],
    ["confirm-to-report-anonymously", ["type.googleapis.com/google.protobuf.BoolValue", [1]]],
    ["full-name", ["type.googleapis.com/google.protobuf.StringValue", [form.reporterName]]],
    ["osa-priority-offence", ["type.googleapis.com/google.protobuf.StringValue", [form.category]]],
    ["german-defamation-url-box", ["type.googleapis.com/google.protobuf.StringValue", [form.reviewUrl]]],
    ["legal-consent-statement", ["type.googleapis.com/google.protobuf.BoolValue", [1]]],
    ["german-defamation-url-description", ["type.googleapis.com/google.protobuf.StringValue", [form.description]]],
    ["signature", ["type.googleapis.com/google.protobuf.StringValue", [form.reporterName]]],
  ];
  return [
    "forms/legal_other_geo",
    [fields, null, form.region],
    null,
    challengeToken,
    "product=geo&uraw&rd=1",
  ];
}

/** Fires the Report One request for one saved session. */
export async function fireReportOne(
  template: ReportOneTemplate,
  form: ReportOneFormFields,
  challengeToken: string,
  timeoutMs = 15000,
): Promise<{
  status: number | null;
  latency: number;
  snippet: string;
  error: string | null;
  accepted: boolean;
}> {
  const started = Date.now();
  // Prefer the full Cookie header captured in headers_json — that's where the
  // SAPISID actually lives. Fall back to cookie_bundle for legacy rows.
  const cookieHeader =
    (template.headers_json &&
      (template.headers_json["Cookie"] || template.headers_json["cookie"])) ||
    template.cookie_bundle ||
    "";
  const sapisid = pickSapisid(cookieHeader);
  if (!sapisid) {
    return {
      status: null,
      latency: 0,
      snippet: "",
      error: "No SAPISID cookie on this session — re-capture it.",
      accepted: false,
    };
  }
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) {
    return {
      status: null,
      latency: 0,
      snippet: "",
      error: "GOOGLE_API_KEY is not configured on the server.",
      accepted: false,
    };
  }

  const authUser = String(template.auth_user_index ?? 0);
  const headers = new Headers({
    "Content-Type": "application/json+protobuf",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-AuthUser": authUser,
    Authorization: buildSapisidHash(sapisid),
    Origin: REPORT_ONE_ORIGIN,
    Referer: `${REPORT_ONE_ORIGIN}/`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  });
  headers.set("cookie", cookieHeader);


  const body = JSON.stringify(buildReportOneBody(form, challengeToken));

  try {
    const res = await fetch(REPORT_ONE_ENDPOINT, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text().catch(() => "");
    // Google returns a JSON array on success; a 200 with a non-error body means the
    // submission was accepted by the intake API. Error bodies typically contain "error".
    const accepted =
      res.status === 200 && !/"error"/i.test(text) && text.trim().length > 0;
    return {
      status: res.status,
      latency: Date.now() - started,
      snippet: text.slice(0, 1024),
      error: null,
      accepted,
    };
  } catch (err) {
    return {
      status: null,
      latency: Date.now() - started,
      snippet: "",
      error: (err as Error).message || "network error",
      accepted: false,
    };
  }
}
