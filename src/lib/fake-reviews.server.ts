/**
 * Server-only helpers for the Fake Reviews firehose. Never import this from a
 * component or a route module's top level.
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
 * CONFIRMED 2026-09-26 from a live manual capture of the "Inappropriate"
 * reason: Google now serialises it as `10`. The other values below are
 * historical guesses and are NOT verified against the current Google UI.
 *
 * If an order fires with a code Google no longer recognises, the wrb.fr
 * envelope returns `["e",4,...]` — "invalid argument". That is the symptom of
 * a stale enum, not dead cookies. Re-capture each reason you support and
 * update this table with the observed value.
 */
export const REASON_CODES = {
  // Confirmed from a 2026-09-26 live capture (Maps UI "Inappropriate").
  INAPPROPRIATE: 10,

  // Unverified. Re-capture each of these from the current Maps UI before
  // trusting them in production orders.
  LOW_QUALITY: 1,
  PROFANITY: 2,
  HARMFUL: 5,
  BULLYING: 6,
  DISCRIMINATION: 7,
  PERSONAL: 8,
  NOT_HELPFUL: 9,

  // Legacy aliases.
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

/* ----------------------------------------------------------------------------
 * Cookie helpers
 * -------------------------------------------------------------------------- */

function extractCookie(bundle: string, name: string): string | null {
  const re = new RegExp(`(?:^|;\\s*)${name.replace(/-/g, "\\-")}=([^;]+)`);
  const m = bundle.match(re);
  return m?.[1] ?? null;
}

/**
 * Computes Google's SAPISIDHASH Authorization header from a SAPISID cookie.
 * Sent as belt-and-suspenders; the qVL8Rd endpoint authenticates primarily
 * via `at=<SNlM0e>` in the body, but adding the header costs nothing and
 * some edge deployments now require it.
 */
async function makeSapisidHash(sapisid: string, origin: string): Promise<string | null> {
  try {
    const ts = Math.floor(Date.now() / 1000);
    const input = `${ts} ${sapisid} ${origin}`;
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `SAPISIDHASH ${ts}_${hex}`;
  } catch (err) {
    console.error("[makeSapisidHash] crypto error:", err);
    return null;
  }
}

/* ----------------------------------------------------------------------------
 * Body rewriting (unchanged from your working version)
 * -------------------------------------------------------------------------- */

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
    let call: unknown[] | null = null;
    if (Array.isArray(outer?.[0]?.[0]) && typeof outer[0][0][1] === "string") {
      call = outer[0][0];
    } else if (Array.isArray(outer?.[0]) && typeof outer[0][1] === "string") {
      call = outer[0];
    }
    if (!call) return rawBody;
    const inner = JSON.parse(call[1] as string);
    if (!Array.isArray(inner)) return rawBody;
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

export function parseBatchExecuteResult(raw: string): {
  accepted: boolean;
  errorCode: number | null;
  reason: string | null;
} {
  if (!raw) return { accepted: false, errorCode: null, reason: "empty response" };
  const body = raw.replace(/^\)\]\}'\s*/, "").trim();
  try {
    const jsonStart = body.indexOf("[");
    if (jsonStart < 0) return { accepted: false, errorCode: null, reason: "no envelope" };
    const parsed = JSON.parse(body.slice(jsonStart));
    if (!Array.isArray(parsed)) return { accepted: false, errorCode: null, reason: "bad envelope" };
    for (const frame of parsed) {
      if (!Array.isArray(frame)) continue;
      if (frame[0] === "er") {
        let innerCode: number | null = null;
        let innerType: string | null = null;
        if (typeof frame[2] === "string") {
          try {
            const innerPayload = JSON.parse(frame[2]);
            if (Array.isArray(innerPayload)) {
              if (typeof innerPayload[0] === "string") innerType = innerPayload[0];
              if (typeof innerPayload[1] === "number") innerCode = innerPayload[1];
            }
          } catch {
            /* ignore */
          }
        }
        const outerCode = typeof frame[5] === "number" ? frame[5] : null;
        const displayCode = innerCode ?? outerCode;
        const detail =
          innerType === "e" && innerCode === 4
            ? "invalid argument (body payload rejected — check reason enum + review_id shape)"
            : innerType === "e" && innerCode === 7
              ? "session/token invalid"
              : `code ${displayCode ?? "?"}`;
        return {
          accepted: false,
          errorCode: displayCode,
          reason: `Google rejected report (HTTP ${outerCode ?? "?"}; inner ${innerType ?? "?"}/${innerCode ?? "?"} — ${detail})`,
        };
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
        return { accepted: true, errorCode: null, reason: null };
      }
    }
    return { accepted: false, errorCode: null, reason: "no wrb.fr frame" };
  } catch {
    return { accepted: false, errorCode: null, reason: "unparseable response" };
  }
}

export function rewriteEndpointUrl(url: string, reviewId: string): string {
  return url.replace(/([?&]postId=)[^&]+/g, `$1${encodeURIComponent(reviewId)}`);
}

/* ----------------------------------------------------------------------------
 * Proxy / relay (unchanged)
 * -------------------------------------------------------------------------- */

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
  return `http://${user}__cr-${country};sessid.${sid}:${pass}@${host}:${port}`;
}

export function relayConfigured(): boolean {
  return !!(process.env["RELAY_URL"] && process.env["RELAY_SECRET"]);
}

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
    signal: AbortSignal.timeout(timeoutMs + 15000),
  });
  const data = (await res.json().catch(() => null)) as {
    status?: number;
    body?: string;
    error?: string;
    origin?: string;
  } | null;
  if (!res.ok || !data || typeof data.status !== "number") {
    const err = new Error(data?.error || `relay error ${res.status}`) as Error & {
      origin?: RelayOrigin;
    };
    err.origin = "relay";
    throw err;
  }
  const origin: RelayOrigin = data.origin === "proxy" || data.origin === "relay" ? data.origin : "upstream";
  return {
    status: data.status,
    text: typeof data.body === "string" ? data.body : "",
    origin,
  };
}

/* ----------------------------------------------------------------------------
 * at= XSRF token minting
 *
 * IMPORTANT: Google does NOT serve HTML at /local/content/rap/report/submit.
 * A bare GET there returns HTTP 400 with an empty body, which is why the
 * previous implementation never found SNlM0e. The token lives on pages
 * Google actually renders as HTML. We try a list of known-good ones.
 *
 * Cache is 30 min per template. A `conclusive:false` result means we could
 * not reach Google (relay/proxy fault, timeout) — callers must NOT mark the
 * template as expired in that case.
 * -------------------------------------------------------------------------- */

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
  headers.set("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  headers.set("x-goog-authuser", String(authuser));

  // Google serves SNlM0e on every signed-in HTML page. These three are the
  // most reliable:
  const candidatePages = [
    `https://www.google.com/maps/contrib/me/reviews?authuser=${authuser}&hl=en`,
    `https://www.google.com/search?q=hello&authuser=${authuser}&hl=en`,
    `https://myaccount.google.com/?authuser=${authuser}&hl=en`,
  ];

  let lastError = "";
  for (const pageUrl of candidatePages) {
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
      lastError = `${e.message}${e.origin ? ` [${e.origin}]` : ""}`;
      console.error(`[mintAtToken] tpl=${template.id} ${pageUrl} transport error: ${lastError}`);
      continue;
    }

    if (origin !== "upstream") {
      lastError = `${origin} fault HTTP ${status}`;
      console.error(`[mintAtToken] tpl=${template.id} ${pageUrl}: ${lastError}`);
      continue;
    }

    if (status === 401 || status === 403) {
      console.error(`[mintAtToken] tpl=${template.id} authuser=${authuser}: HTTP ${status}`);
      return {
        ok: false,
        conclusive: true,
        reason: `Google HTTP ${status} for authuser=${authuser}`,
      };
    }

    if (status !== null && status >= 300 && status < 400) {
      const looksSignIn = /ServiceLogin|accounts\.google\.com/i.test(location ?? "");
      if (looksSignIn) {
        console.error(`[mintAtToken] tpl=${template.id} authuser=${authuser}: sign-in redirect from ${pageUrl}`);
        return {
          ok: false,
          conclusive: true,
          reason: `redirected to sign-in for authuser=${authuser} — cookies expired`,
        };
      }
      lastError = `redirect from ${pageUrl} → ${location ?? "?"}`;
      continue;
    }

    const match = text.match(/"SNlM0e":"([^"]+)"/);
    const token = match?.[1];
    if (!token) {
      lastError = `no SNlM0e in ${pageUrl} (HTTP ${status ?? "?"})`;
      console.error(
        `[mintAtToken] tpl=${template.id} ${pageUrl}: ${lastError}. ` +
          `HTML preview: ${text.slice(0, 120).replace(/\s+/g, " ")}`,
      );
      continue;
    }

    atTokenCache.set(template.id, { token, expires: Date.now() + AT_TOKEN_TTL });
    console.error(`[mintAtToken] tpl=${template.id}: minted from ${pageUrl}`);
    return { ok: true, token };
  }

  return {
    ok: false,
    conclusive: false,
    reason: `all candidate pages failed: ${lastError}`,
  };
}

/* ----------------------------------------------------------------------------
 * Sign-in probe — same URL fix as mintAtToken
 * -------------------------------------------------------------------------- */

export async function probeAccountSignIn(
  template: Pick<TemplateRow, "id" | "cookie_bundle" | "headers_json" | "auth_user_index">,
  timeoutMs = 12000,
): Promise<{ signedIn: boolean; reason: string | null; conclusive: boolean }> {
  if (!template.cookie_bundle) {
    return { signedIn: false, reason: "no cookie bundle", conclusive: true };
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
  headers.set("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  headers.set("x-goog-authuser", String(authuser));

  const candidatePages = [
    `https://www.google.com/maps/contrib/me/reviews?authuser=${authuser}&hl=en`,
    `https://myaccount.google.com/?authuser=${authuser}&hl=en`,
  ];

  let lastReason = "no candidate pages tried";
  for (const pageUrl of candidatePages) {
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
      lastReason = `${e.message}${e.origin ? ` [${e.origin}]` : ""}`;
      continue;
    }

    if (origin !== "upstream") {
      lastReason = `${origin} fault HTTP ${status}`;
      continue;
    }

    const looksSignedOut =
      (status !== null &&
        status >= 300 &&
        status < 400 &&
        /ServiceLogin|accounts\.google\.com/i.test(location ?? "")) ||
      /ServiceLogin|accounts\.google\.com\/(?:signin|ServiceLogin|AccountChooser)/i.test(text);

    if (looksSignedOut) {
      return {
        signedIn: false,
        reason: `redirected to sign-in for authuser=${authuser} — cookies expired`,
        conclusive: true,
      };
    }

    if (status === 401 || status === 403) {
      return {
        signedIn: false,
        reason: `Google returned HTTP ${status} for authuser=${authuser}`,
        conclusive: true,
      };
    }

    if (status === 200 && text.length > 0) {
      // A signed-in account page always contains one of these markers.
      const signedInMarker =
        /"SNlM0e":"[^"]+"/.test(text) || /data-ogsr-up|og_user_avatar|\/maps\/contrib\/me/i.test(text);
      if (signedInMarker) {
        return { signedIn: true, reason: null, conclusive: true };
      }
      lastReason = `200 but no sign-in markers on ${pageUrl}`;
      continue;
    }

    lastReason = `HTTP ${status ?? "?"} from ${pageUrl}`;
  }

  return {
    signedIn: false,
    reason: `all candidate pages failed: ${lastReason}`,
    conclusive: false,
  };
}

/* ----------------------------------------------------------------------------
 * Body token replacement + fire path
 * -------------------------------------------------------------------------- */

function replaceAtToken(rawBody: string, at: string): string {
  try {
    const params = new URLSearchParams(rawBody);
    // .set() upserts — do NOT gate on params.has("at").
    params.set("at", at);
    return params.toString();
  } catch {
    return rawBody;
  }
}

function ensureAuthuser(url: string, authuser: number): string {
  if (/[?&]authuser=/.test(url)) {
    return url.replace(/([?&]authuser=)\d+/, `$1${authuser}`);
  }
  return url + (url.includes("?") ? "&" : "?") + `authuser=${authuser}`;
}

function looksLikeProtobufReviewId(id: string): boolean {
  return /^Ci[A-Za-z0-9+/=]{20,}$/.test(id);
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
  headers.set("x-goog-authuser", String(authuser));

  // Belt-and-suspenders: also send SAPISIDHASH. Some Google edge deployments
  // now require it even when `at=` is present.
  if (template.cookie_bundle) {
    const sapisid =
      extractCookie(template.cookie_bundle, "SAPISID") ??
      extractCookie(template.cookie_bundle, "__Secure-1PAPISID") ??
      extractCookie(template.cookie_bundle, "__Secure-3PAPISID");
    if (sapisid) {
      const hash = await makeSapisidHash(sapisid, "https://www.google.com");
      if (hash) headers.set("authorization", hash);
    }
  }

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

    // Always mint a fresh token. Do NOT gate on body.includes("at=").
    if (body) {
      const mint = await mintAtToken(template, timeoutMs);
      if (!mint.ok) {
        console.error(
          `[fireOnce] tpl=${template.id} authuser=${authuser}: mint failed ` +
            `(conclusive=${mint.conclusive}) — ${mint.reason}`,
        );
        return {
          status: null,
          latency: 0,
          snippet: "",
          error: mint.conclusive
            ? `Google session rejected for authuser=${authuser} — re-upload cookies (${mint.reason})`
            : `Could not reach Google to mint token — infra fault, not account (${mint.reason})`,
          injected,
          authFailed: mint.conclusive,
        };
      }
      body = replaceAtToken(body, mint.token);
    }
    init.body = body;

    // ── DEBUG: dump exact outgoing request for diffing against a live capture.
    const reasonNum = Number(vars.REASON) || 1;
    console.error(
      "[fireOnce:DEBUG] " +
        JSON.stringify({
          template: template.id,
          authuser,
          method,
          url,
          hasClientData: headers.has("x-client-data"),
          hasBrowserValidation: headers.has("x-browser-validation"),
          hasAuthorization: headers.has("authorization"),
          contentType: headers.get("content-type"),
          reviewId: vars.REVIEW_ID,
          reviewIdLooksProtobuf: looksLikeProtobufReviewId(vars.REVIEW_ID),
          reasonNum,
          reasonName: vars.REASON_NAME,
          bodyLength: typeof init.body === "string" ? init.body.length : null,
          bodyPreview: typeof init.body === "string" ? init.body.slice(0, 400) : null,
        }),
    );

    if (!looksLikeProtobufReviewId(vars.REVIEW_ID)) {
      console.error(
        `[fireOnce] tpl=${template.id}: WARNING — REVIEW_ID "${vars.REVIEW_ID.slice(0, 40)}" does not look like a base64 protobuf. ` +
          `Google will almost certainly return ["e",4,...] (invalid argument). Expected a value starting with "Ci".`,
      );
    }
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
    let error: string | null = null;
    let authFailed = false;
    if (origin !== "upstream") {
      error = `${origin} error (HTTP ${status}) — infra fault, not account`;
    } else if (status === 200 && (url.includes("batchexecute") || text.includes("wrb.fr"))) {
      const parsed = parseBatchExecuteResult(text);
      if (!parsed.accepted && parsed.reason) {
        error = parsed.reason;
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
      authFailed: false,
    };
  }
}

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
