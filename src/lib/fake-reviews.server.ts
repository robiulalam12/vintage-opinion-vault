/**
 * Server-only helpers for the Fake Reviews firehose. Never import this from a
 * component or a route module's top level.
 *
 * The system replays one captured authenticated Google "Report review"
 * request many times, interpolating the target review/feature ids and reason
 * code. The captured request lives in fake_review_templates. Because it
 * carries the reporter's cookies and SAPISID auth hash, we treat those
 * columns as sensitive and never return them to the browser.
 */

export type TemplateRow = {
  id: string;
  label: string;
  google_email: string | null;
  auth_user_index: number;
  endpoint_url: string;
  method: string;
  headers_json: Record<string, string>;
  cookie_bundle: string | null;
  body_template: string | null;
  body_kind: string;
  status: string;
  captured_at: string;
  last_verified_at: string | null;
  last_fired_at: string | null;
  last_error: string | null;
  shots_fired: number;
  notes: string | null;
};

/**
 * Reason code → Google's numeric enum in the qVL8Rd batchexecute submit body.
 *
 * Confirmed from real captures supplied by the user:
 *   HARMFUL = 5
 *   DISCRIMINATION = 7
 *
 * BULLYING = 6 is the best-effort value between the two confirmed codes,
 * matching the UI order. LOW_QUALITY, PROFANITY, PERSONAL and NOT_HELPFUL
 * remain unconfirmed; verify with a fresh capture if a specific reason stops
 * producing the expected Google response.
 */
export const REASON_CODES = {
  LOW_QUALITY: 1,
  PROFANITY: 2,
  HARMFUL: 5,
  BULLYING: 6,
  DISCRIMINATION: 7,
  PERSONAL: 8,
  NOT_HELPFUL: 9,
  // Legacy aliases kept so old orders still resolve to a sensible number.
  OFF_TOPIC: 1,
  SPAM: 1,
  CONFLICT: 3,
} as const;
export type ReasonKey = keyof typeof REASON_CODES;

export function interpolate(
  input: string | null | undefined,
  vars: {
    REVIEW_ID: string;
    FEATURE_ID: string;
    REASON: string;
    REASON_NAME: string;
    COMMENT?: string;
  },
): string {
  if (!input) return "";
  return input
    .replace(/\{\{\s*REVIEW_ID\s*\}\}/g, vars.REVIEW_ID)
    .replace(/\{\{\s*FEATURE_ID\s*\}\}/g, vars.FEATURE_ID)
    .replace(/\{\{\s*REASON\s*\}\}/g, vars.REASON)
    .replace(/\{\{\s*REASON_NAME\s*\}\}/g, vars.REASON_NAME)
    .replace(/\{\{\s*COMMENT\s*\}\}/g, vars.COMMENT ?? "");
}

/**
 * Rewrites the URL-encoded qVL8Rd batchexecute body so each replay carries the
 * order's real review id + reason + optional free-text comment instead of
 * whatever the template was captured with. The body shape we mutate:
 *
 *   at=<xsrf>&f.req=[[["qVL8Rd","[null,null,null,\"REVIEW_ID\",<d>,1,\"COMMENT\",REASON]",null,"generic"]]]
 *
 * inner[6] is Google's optional free-text note field. Falls back to the
 * original body when the shape doesn't match, so any future Google change
 * fails safely (the shot still fires, just without injection).
 */
export function rewriteBatchExecuteBody(
  rawBody: string,
  reviewId: string,
  reasonNum: number,
  comment: string = "",
): string {
  try {
    const params = new URLSearchParams(rawBody);
    const freq = params.get("f.req");
    if (!freq) return rawBody;
    const outer = JSON.parse(freq);
    // Google wraps calls as either [[[rpcid, innerJsonString, null, "generic"]]]
    // (multi-call batch) or [[rpcid, innerJsonString, null, "generic"]] (single).
    // Accept both shapes so a slightly-different capture still gets injected.
    let call: unknown[] | null = null;
    if (Array.isArray(outer?.[0]?.[0]) && typeof outer[0][0][1] === "string") {
      call = outer[0][0];
    } else if (Array.isArray(outer?.[0]) && typeof outer[0][1] === "string") {
      call = outer[0];
    }
    if (!call) return rawBody;
    const inner = JSON.parse(call[1] as string);
    if (!Array.isArray(inner)) return rawBody;
    // Pad shorter captures so index writes never fall off the end. Real
    // captures have been seen with 6, 7, and 8 fields depending on Google's
    // rollout — pad to 8 with nulls, then write the known offsets.
    while (inner.length < 8) inner.push(null);
    inner[3] = reviewId;
    inner[6] = comment ?? "";
    inner[7] = reasonNum;
    (call as unknown[])[1] = JSON.stringify(inner);
    params.set("f.req", JSON.stringify(outer));
    return params.toString();
  } catch {
    return rawBody;
  }
}

/**
 * Parses a Google batchexecute wrb.fr response and returns a normalised
 * result. Google returns HTTP 200 even when the submission is rejected —
 * the real signal lives inside the response envelope:
 *
 *   )]}'
 *   [["wrb.fr","qVL8Rd","[<payload>]",null,null,null,"generic"]]
 *
 * A well-formed accept payload is a JSON array whose first element is null
 * or 1. A rejection is either an "er" envelope, or a payload whose first
 * element is a numeric error code (7 = generic auth failure).
 */
export function parseBatchExecuteResult(raw: string): {
  accepted: boolean;
  errorCode: number | null;
  reason: string | null;
} {
  if (!raw) return { accepted: false, errorCode: null, reason: "empty response" };
  // Google prefixes the JSON with the anti-hijack ")]}'" line.
  const body = raw.replace(/^\)\]\}'\s*/, "").trim();
  try {
    // Response is line-delimited: first line is a length, second is the array.
    const jsonStart = body.indexOf("[");
    if (jsonStart < 0) return { accepted: false, errorCode: null, reason: "no envelope" };
    const parsed = JSON.parse(body.slice(jsonStart));
    if (!Array.isArray(parsed)) return { accepted: false, errorCode: null, reason: "bad envelope" };
    for (const frame of parsed) {
      if (!Array.isArray(frame)) continue;
      if (frame[0] === "er") {
        const code = typeof frame[5] === "number" ? frame[5] : null;
        return { accepted: false, errorCode: code, reason: `Google error frame (code ${code ?? "?"})` };
      }
      if (frame[0] === "wrb.fr" && typeof frame[2] === "string") {
        const inner = JSON.parse(frame[2]);
        if (Array.isArray(inner) && typeof inner[0] === "number" && inner[0] >= 2) {
          return {
            accepted: false,
            errorCode: inner[0],
            reason: `Google rejected report (code ${inner[0]}${inner[0] === 7 ? " — session/token invalid" : ""})`,
          };
        }
        // Accept: payload is null / [] / [null, ...] / [1, ...]
        return { accepted: true, errorCode: null, reason: null };
      }
    }
    return { accepted: false, errorCode: null, reason: "no wrb.fr frame" };
  } catch {
    return { accepted: false, errorCode: null, reason: "unparseable response" };
  }
}

/** Also rewrites the review id if it appears literally in the endpoint URL. */
export function rewriteEndpointUrl(url: string, reviewId: string): string {
  // Endpoint carries `postId=<REVIEW_ID>` on the legacy path — swap it too.
  return url.replace(/([?&]postId=)[^&]+/g, `$1${encodeURIComponent(reviewId)}`);
}

/**
 * Replays one captured template once. Returns HTTP status, latency, and a
 * short response snippet. Network errors are captured as `error`.
 */
/**
 * Builds the DataImpulse proxy URL for one template. `__cr.us` pins USA
 * exits; `;sid.<hash>` makes the IP sticky per Google account so the same
 * account always reports from the same residential IP for the whole order.
 */
export function proxyUrlForTemplate(templateId: string): string | null {
  const host = process.env["DATAIMPULSE_HOST"];
  const port = process.env["DATAIMPULSE_PORT"];
  const user = process.env["DATAIMPULSE_USER"];
  const pass = process.env["DATAIMPULSE_PASS"];
  const country = process.env["DATAIMPULSE_COUNTRY"] || "us";
  if (!host || !port || !user || !pass) return null;
  let hash = 0;
  for (let i = 0; i < templateId.length; i++) {
    hash = (hash * 31 + templateId.charCodeAt(i)) >>> 0;
  }
  const sid = hash.toString(36);
  // DataImpulse sticky-session format verified live: `sessid.<tag>` holds the
  // same exit IP across requests; `sid.` / `session.` do NOT stick.
  return `http://${user}__cr-${country};sessid.${sid}:${pass}@${host}:${port}`;
}

/** True when the relay + proxy are fully configured. */
export function relayConfigured(): boolean {
  return !!(process.env["RELAY_URL"] && process.env["RELAY_SECRET"]);
}

/**
 * Sends one request through the VPS relay (which exits via the per-template
 * residential proxy). The relay speaks: POST /forward with Bearer auth and a
 * JSON body {url, method, headers, body, proxyUrl}; it returns the upstream
 * status and body.
 */
/**
 * Origin tag on the relay response:
 *  - "upstream" = Google actually replied with the returned status/body.
 *  - "relay"    = the relay server itself refused (auth, bad request, etc.).
 *  - "proxy"    = the residential proxy refused (407 auth, exhausted, etc.).
 * Callers must only treat "upstream" 401/403 as an expired Google session.
 */
export type RelayOrigin = "upstream" | "relay" | "proxy";

async function fetchViaRelay(
  url: string,
  method: string,
  headers: Headers,
  body: string | undefined,
  templateId: string,
  timeoutMs: number,
): Promise<{ status: number; text: string; origin: RelayOrigin }> {
  const relayUrl = process.env["RELAY_URL"]!;
  const relaySecret = process.env["RELAY_SECRET"]!;
  const proxyUrl = proxyUrlForTemplate(templateId);
  const headerObj: Record<string, string> = {};
  headers.forEach((v, k) => {
    headerObj[k] = v;
  });
  const res = await fetch(relayUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${relaySecret}`,
    },
    body: JSON.stringify({ url, method, headers: headerObj, body: body ?? null, proxyUrl }),
    signal: AbortSignal.timeout(timeoutMs + 15000), // relay adds proxy latency
  });
  const data = (await res.json().catch(() => null)) as {
    status?: number;
    body?: string;
    error?: string;
    origin?: string;
  } | null;
  if (!res.ok || !data || typeof data.status !== "number") {
    // Relay-side failure. Tag it so callers do not misfile as Google-side auth loss.
    const err = new Error(data?.error || `relay error ${res.status}`) as Error & { origin?: RelayOrigin };
    err.origin = "relay";
    throw err;
  }
  // Relay may echo "proxy" in `origin` when the proxy refused the request
  // (407, connection refused). If it doesn't, default to "upstream".
  const origin: RelayOrigin = data.origin === "proxy" || data.origin === "relay" ? data.origin : "upstream";
  return { status: data.status, text: typeof data.body === "string" ? data.body : "", origin };
}

/**
 * The `at=` XSRF token in a captured batchexecute body is bound to the Google
 * session that created it. Replaying it with a different account's cookies
 * makes Google reject the call with error code 7 ("generic") — which is why
 * every replay of the shared captured token failed. Fix: before each shot,
 * load the report page with THIS template's own cookies and mint a fresh
 * token from the page's "SNlM0e" value. Cached 30 min per template.
 */
const atTokenCache = new Map<string, { token: string; expires: number }>();
const AT_TOKEN_TTL = 30 * 60 * 1000;

type MintResult = { ok: true; token: string } | { ok: false; conclusive: boolean; reason: string };

async function mintAtToken(
  template: Pick<TemplateRow, "id" | "cookie_bundle" | "headers_json" | "auth_user_index">,
  timeoutMs: number,
): Promise<MintResult> {
  const cached = atTokenCache.get(template.id);
  if (cached && cached.expires > Date.now()) return { ok: true, token: cached.token };
  if (!template.cookie_bundle) {
    return { ok: false, conclusive: true, reason: "no cookie bundle on template" };
  }

  const authuser = Number.isFinite(template.auth_user_index) ? template.auth_user_index : 0;
  const headers = new Headers();
  headers.set("cookie", template.cookie_bundle);
  const ua = template.headers_json?.["user-agent"] ?? template.headers_json?.["User-Agent"];
  headers.set(
    "user-agent",
    typeof ua === "string" && ua
      ? ua
      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  );
  headers.set("accept-language", "en-GB,en-US;q=0.9,en;q=0.8");
  headers.set("x-goog-authuser", String(authuser));

  // Maps home reliably embeds SNlM0e when signed in. The report/submit page
  // requires a review-specific payload and 400s / redirects to signin without
  // one, so it's useless for minting a fresh token in isolation.
  const pageUrl = `https://www.google.com/maps?authuser=${authuser}&hl=en`;

  let status: number | null = null;
  let location: string | null = null;
  let text = "";
  let origin: RelayOrigin = "upstream";
  try {
    if (relayConfigured()) {
      const res = await fetchViaRelay(pageUrl, "GET", headers, undefined, template.id, timeoutMs);
      status = res.status;
      text = res.text;
      origin = res.origin;
    } else {
      const res = await fetch(pageUrl, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      location = res.headers.get("location");
      text = await res.text().catch(() => "");
    }
  } catch (err) {
    const e = err as Error & { origin?: RelayOrigin };
    console.error(
      `[mintAtToken] tpl=${template.id} authuser=${authuser} transport error:`,
      e.message,
      e.origin ? `[${e.origin}]` : "",
    );
    return { ok: false, conclusive: false, reason: `${e.message}${e.origin ? ` [${e.origin}]` : ""}` };
  }

  // Infra fault: relay/proxy refused, not Google.
  if (origin !== "upstream") {
    console.error(`[mintAtToken] tpl=${template.id}: ${origin} fault (HTTP ${status})`);
    return { ok: false, conclusive: false, reason: `${origin} fault HTTP ${status}` };
  }

  // Redirect to sign-in: cookies conclusively dead.
  if (status !== null && status >= 300 && status < 400) {
    const looksSignIn = /ServiceLogin|accounts\.google\.com/i.test(location ?? "");
    console.error(
      `[mintAtToken] tpl=${template.id} authuser=${authuser}: HTTP ${status} redirect → ${location ?? "?"}` +
        (looksSignIn ? " (sign-in redirect: cookies expired)" : ""),
    );
    return {
      ok: false,
      conclusive: looksSignIn,
      reason: looksSignIn
        ? `redirected to sign-in for authuser=${authuser} — cookies expired`
        : `unexpected redirect → ${location ?? "?"}`,
    };
  }

  if (status === 401 || status === 403) {
    console.error(`[mintAtToken] tpl=${template.id} authuser=${authuser}: HTTP ${status}`);
    return { ok: false, conclusive: true, reason: `Google HTTP ${status} for authuser=${authuser}` };
  }

  const match = text.match(/"SNlM0e":"([^"]+)"/);
  const token = match?.[1];
  if (!token) {
    console.error(
      `[mintAtToken] tpl=${template.id} authuser=${authuser}: no SNlM0e (HTTP ${status ?? "?"}). ` +
        `HTML preview: ${text.slice(0, 180).replace(/\s+/g, " ")}`,
    );
    return {
      ok: false,
      conclusive: false,
      reason: `no SNlM0e token in report page (HTTP ${status ?? "?"}) — wrong authuser index or Google shape change`,
    };
  }

  atTokenCache.set(template.id, { token, expires: Date.now() + AT_TOKEN_TTL });
  return { ok: true, token };
}
/**
 * Sign-in probe used by the Templates "Verify" button. Loads the *same*
 * Maps report page the fire path uses, under the *same* authuser slot,
 * and looks for the "SNlM0e" XSRF token — its presence proves the cookies
 * authenticate for the Maps report surface (not a different Google surface
 * like Gmail, whose session validity is not guaranteed to be coextensive).
 *
 * Returns `conclusive:false` when we couldn't reach Google (relay/proxy
 * error, timeout). Callers should NOT flip the template to "expired" on
 * an inconclusive probe — infra flakiness has been marking good sessions
 * dead. Mark stale instead and retry.
 */
export async function probeAccountSignIn(
  template: Pick<TemplateRow, "id" | "cookie_bundle" | "headers_json" | "auth_user_index">,
  timeoutMs = 12000,
): Promise<{ signedIn: boolean; reason: string | null; conclusive: boolean }> {
  if (!template.cookie_bundle) return { signedIn: false, reason: "no cookie bundle", conclusive: true };
  const authuser = Number.isFinite(template.auth_user_index) ? template.auth_user_index : 0;
  const headers = new Headers();
  headers.set("cookie", template.cookie_bundle);
  const ua = template.headers_json?.["user-agent"] ?? template.headers_json?.["User-Agent"];
  headers.set(
    "user-agent",
    typeof ua === "string" && ua
      ? ua
      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  );
  headers.set("accept-language", "en-GB,en-US;q=0.9,en;q=0.8");
  headers.set("x-goog-authuser", String(authuser));

  const pageUrl = `https://www.google.com/local/content/rap/report/submit?authuser=${authuser}&hl=en`;
  try {
    let text = "";
    let status: number | null = null;
    let origin: RelayOrigin = "upstream";
    if (relayConfigured()) {
      const res = await fetchViaRelay(pageUrl, "GET", headers, undefined, template.id, timeoutMs);
      text = res.text;
      status = res.status;
      origin = res.origin;
    } else {
      const res = await fetch(pageUrl, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      text = await res.text().catch(() => "");
    }
    // If we didn't get an "upstream" response, the probe is inconclusive —
    // that's relay/proxy fault, not Google saying the session is dead.
    if (origin !== "upstream") {
      return { signedIn: false, reason: `${origin} error (HTTP ${status})`, conclusive: false };
    }
    // SNlM0e appears on the signed-in report page. Google's sign-in page
    // also embeds it, so pair its presence with a positive signed-in signal.
    const hasToken = /"SNlM0e":"([^"]+)"/.test(text);
    const looksSignedOut = /ServiceLogin|accounts\.google\.com\/(?:signin|ServiceLogin|AccountChooser)/i.test(text);
    if (hasToken && !looksSignedOut) {
      return { signedIn: true, reason: null, conclusive: true };
    }
    if (looksSignedOut) {
      return {
        signedIn: false,
        reason: `redirected to sign-in for authuser=${authuser} — cookies expired`,
        conclusive: true,
      };
    }
    if (status === 401 || status === 403) {
      return { signedIn: false, reason: `Google returned HTTP ${status} for authuser=${authuser}`, conclusive: true };
    }
    // 200 but no token and no sign-in markers: shape changed, or transient.
    return {
      signedIn: false,
      reason: `no SNlM0e token in Maps report page (HTTP ${status ?? "?"})`,
      conclusive: false,
    };
  } catch (err) {
    const e = err as Error & { origin?: RelayOrigin };
    return {
      signedIn: false,
      reason: (e.message || "network error") + (e.origin ? ` [${e.origin}]` : ""),
      conclusive: false,
    };
  }
}

/** Swaps the `at` parameter inside a URL-encoded batchexecute body. */
function replaceAtToken(rawBody: string, at: string): string {
  try {
    const params = new URLSearchParams(rawBody);
    // .set() upserts — do NOT gate on params.has("at"), otherwise a body
    // that lost its `at=` (manual edit, Google format change) silently
    // fires with a stale/missing token.
    params.set("at", at);
    return params.toString();
  } catch {
    return rawBody;
  }
}

/**
 * Ensures the endpoint URL carries `authuser=<N>` matching the template's
 * captured slot. Google's multi-login cookie jar is shared across accounts;
 * without this param the call runs as the default (slot 0) account and
 * fails with error code 7 for every other slot.
 */
function ensureAuthuser(url: string, authuser: number): string {
  if (/[?&]authuser=/.test(url)) {
    return url.replace(/([?&]authuser=)\d+/, `$1${authuser}`);
  }
  return url + (url.includes("?") ? "&" : "?") + `authuser=${authuser}`;
}

export async function fireOnce(
  template: Pick<
    TemplateRow,
    | "id"
    | "endpoint_url"
    | "method"
    | "headers_json"
    | "cookie_bundle"
    | "body_template"
    | "body_kind"
    | "auth_user_index"
  >,
  vars: {
    REVIEW_ID: string;
    FEATURE_ID: string;
    REASON: string;
    REASON_NAME: string;
    COMMENT?: string;
  },
  timeoutMs = 12000,
): Promise<{
  status: number | null;
  latency: number;
  snippet: string;
  error: string | null;
  injected: boolean;
  /** True only when Google itself rejected the caller's session (401/403 upstream, or wrb.fr code 7). */
  authFailed: boolean;
}> {
  const authuser = Number.isFinite(template.auth_user_index) ? template.auth_user_index : 0;
  let url = interpolate(template.endpoint_url, vars);
  url = rewriteEndpointUrl(url, vars.REVIEW_ID);
  url = ensureAuthuser(url, authuser);
  const rawHeaders = template.headers_json ?? {};
  const headers = new Headers();
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (typeof v !== "string") continue;
    const key = k.toLowerCase();
    if (["host", "content-length", "connection", "accept-encoding"].includes(key)) continue;
    headers.set(k, interpolate(v, vars));
  }
  if (template.cookie_bundle) headers.set("cookie", template.cookie_bundle);
  // Route this request to the correct signed-in account in the shared jar.
  headers.set("x-goog-authuser", String(authuser));

  const method = (template.method || "POST").toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  };

  let injected = false;
  if (method !== "GET" && method !== "HEAD") {
    let body = interpolate(template.body_template, vars);
    if (body && (url.includes("qVL8Rd") || body.includes("qVL8Rd"))) {
      const reasonNum = Number(vars.REASON) || 1;
      const rewritten = rewriteBatchExecuteBody(body, vars.REVIEW_ID, reasonNum, vars.COMMENT ?? "");
      if (rewritten !== body) injected = true;
      body = rewritten;
    }
    // Always mint a fresh per-account token — do NOT gate on body.includes("at=").
    // If a template ever lacks the param, replaceAtToken() will insert it via .set().
    if (body) {
      const mint = await mintAtToken(template, timeoutMs);
      if (!mint.ok) {
        console.error(
          `[fireOnce] tpl=${template.id} authuser=${authuser}: mint failed (conclusive=${mint.conclusive}) — ${mint.reason}`,
        );
        return {
          status: null,
          latency: 0,
          snippet: "",
          error: mint.conclusive
            ? `Google session rejected for authuser=${authuser} — re-upload cookies (${mint.reason})`
            : `Could not reach Google to mint token — infra fault, not account (${mint.reason})`,
          injected,
          // Only flip the template to "expired" when we're sure it's the account.
          authFailed: mint.conclusive,
        };
      }
      body = replaceAtToken(body, mint.token);
    }
    init.body = body;
  }

  const started = Date.now();
  try {
    let status: number;
    let text: string;
    let origin: RelayOrigin = "upstream";
    if (relayConfigured()) {
      const body = typeof init.body === "string" ? init.body : undefined;
      const relayRes = await fetchViaRelay(url, method, headers, body, template.id, timeoutMs);
      status = relayRes.status;
      text = relayRes.text;
      origin = relayRes.origin;
    } else {
      const res = await fetch(url, init);
      status = res.status;
      text = await res.text().catch(() => "");
    }
    // HTTP 200 is not proof of acceptance for the qVL8Rd batchexecute call —
    // Google returns 200 for auth failures too, with the real error inside
    // the wrb.fr envelope. Parse it so a rejected report is surfaced as an
    // error instead of being logged as a silent success.
    let error: string | null = null;
    let authFailed = false;
    if (origin !== "upstream") {
      // Relay/proxy fault — do NOT flip templates to "expired" on this.
      error = `${origin} error (HTTP ${status}) — infra fault, not account`;
    } else if (status === 200 && (url.includes("batchexecute") || text.includes("wrb.fr"))) {
      const parsed = parseBatchExecuteResult(text);
      if (!parsed.accepted && parsed.reason) {
        error = parsed.reason;
        // wrb.fr inner code 7 = generic session/token invalid — auth failure.
        if (parsed.errorCode === 7) authFailed = true;
      }
    } else if (status >= 400) {
      error = `HTTP ${status}`;
      if (status === 401 || status === 403) authFailed = true;
    }
    return {
      status,
      latency: Date.now() - started,
      snippet: text.slice(0, 512),
      error,
      injected,
      authFailed,
    };
  } catch (err) {
    const e = err as Error & { origin?: RelayOrigin };
    return {
      status: null,
      latency: Date.now() - started,
      snippet: "",
      error: (e.message || "network error") + (e.origin ? ` [${e.origin}]` : ""),
      injected,
      // Network/relay throw is not a Google-side auth verdict.
      authFailed: false,
    };
  }
}

/** Cloudflare Workers subrequest cap in mind: keep parallel chunks small. */
export const FIRE_CHUNK = 40;

export async function fireInChunks<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  chunk = FIRE_CHUNK,
): Promise<void> {
  for (let i = 0; i < items.length; i += chunk) {
    const slice = items.slice(i, i + chunk);
    await Promise.allSettled(slice.map((item, offset) => worker(item, i + offset)));
  }
}

/** CORS + key-check helpers reused across the capture endpoints. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-api-key, x-extension-version",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkExtensionKey(request: Request): boolean {
  const provided =
    request.headers.get("x-api-key") ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided) return false;
  const candidates = [process.env["DMCA_EXTENSION_KEY"], process.env["POB_EXTENSION_KEY"]].filter(
    (v): v is string => !!v,
  );
  return candidates.some((expected) => safeEqual(expected, provided));
}

export function checkCaptureExtensionKey(request: Request): boolean {
  if (checkExtensionKey(request)) return true;
  const provided =
    request.headers.get("x-api-key") ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const legacy = process.env["POB_EXTENSION_KEY_LEGACY"];
  return !!provided && !!legacy && safeEqual(legacy, provided);
}
