/**
 * Free Google review extraction, server-only.
 *
 * Google Maps exposes an undocumented public place-card RPC that returns the raw
 * payload for a single review. We resolve the share link, pull the review id and
 * feature id out of the canonical URL, ask the endpoint for that review, then
 * regex the fields out of the response. No scraper, no API key, no cost.
 *
 * Limits: only single-review links work (place/profile links carry no review id),
 * long reviews come back truncated at Google's "… More" cut, reviewer country is
 * not obtainable. Always fails soft — never throws out of `fetchReviewTexts`.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "CONSENT=YES+cb; SOCS=CAI",
};

const REVIEW_ID_RE = /!2m5!1s([A-Za-z0-9_-]{15,})/;
const FEATURE_ID_RE = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/;
const TEXT_RE = /\["[a-z-]{2,7}"\],\[\["((?:[^"\\]|\\.)*)",null,\[0,\d+\]/;
const NAME_RE = /\["([^"]{1,80})","https:\/\/lh3\.googleusercontent\.com/;
const RATING_RE = /\],\[\[([1-5])\],null,null,null,null,null,/;
const RATING_FALLBACK_RE = /\],\[\[([1-5])\],null,/;
const DATE_US_RE = /,(1[0-9]{15}),/;
const AGE_LABEL_RE =
  /"(\d+\s(?:year|month|week|day|hour|minute)s?\sago|a\s(?:year|month|week|day)\sago)"/;

// The place card sits beside its map coordinates: [[null,null,lat,lng],null,"Business name",...]
const PLACE_NAME_RE = /\[\[null,null,-?\d+\.\d+,-?\d+\.\d+\],null,"((?:[^"\\]|\\.){1,200})"/;

const PB_TEMPLATE =
  "!3m3!1sAAAAAAAAAAAAAAAAAAAAAA!7e81!15i31661!5m3!1b1!9m1!1e3!6m56!1m49!1m5!1m4!1e1!1e3!1e2!1e4!3m5!2m4!3m3!1m2!1i260!2i365!4m1!3i20!10b1!11m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!2m5!1e1!1e4!1e5!1e3!1e2!7m0!8m28!1m6!1m2!1i0!2i0!2m2!1i530!2i768!1m6!1m2!1i974!2i0!2m2!1i1024!2i768!1m6!1m2!1i0!2i0!2m2!1i1024!2i20!1m6!1m2!1i0!2i748!2m2!1i1024!2i768!10s{FEATURE_ID}!11s{REVIEW_ID}";

export interface ReviewTextResult {
  url: string;
  ok: boolean;
  error?: string;
  text?: string;
  reviewer_name?: string;
  rating?: number;
  published_at?: string;
  age_label?: string;
  business_name?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google throttles bursts from a single IP with 429 (and occasional 5xx).
 * Retry those with exponential backoff + jitter instead of failing the link.
 */
async function fetchWithRetry(url: string, attempts = 4): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(700 * 2 ** (i - 1) + Math.floor(Math.random() * 400));
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "follow",
        headers: HEADERS,
        signal: AbortSignal.timeout(12000),
      });
    } catch (error) {
      if (i === attempts - 1) throw error;
      continue;
    }
    if (response.status !== 429 && response.status < 500) return response;
    await response.text().catch(() => "");
    last = response;
  }
  throw new Error(
    `Google is rate-limiting this server (${last?.status ?? 429}) — wait a minute and retry.`,
  );
}

/** Follows short links (maps.app.goo.gl, share.google) to the canonical URL. */
// Resolved short links never change; cache them per worker so retries and
// date re-passes skip the redirect hop entirely.
const resolvedCache = new Map<string, string>();

async function resolveUrl(url: string): Promise<string> {
  if (url.includes("/maps/reviews/data=")) return url;
  const cached = resolvedCache.get(url);
  if (cached) return cached;
  // Follow redirects by hand: reading the Location header avoids downloading
  // the ~200 KB Maps HTML page that `redirect: "follow"` would fetch.
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    if (current.includes("/maps/reviews/data=")) break;
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: HEADERS,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      break;
    }
    const location = response.headers.get("location");
    response.body?.cancel().catch(() => {});
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    if (response.status === 429 || response.status >= 500) break;
    break;
  }
  if (!current.includes("/maps/reviews/data=")) {
    // Fallback: full follow (handles JS/meta redirects or throttled hops).
    const response = await fetchWithRetry(url);
    await response.text().catch(() => "");
    current = response.url || url;
  }
  resolvedCache.set(url, current);
  return current;
}

function unescapeJson(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

/** Fetches and parses one review link. Throws with a readable message on failure. */
export async function fetchReviewRaw(url: string): Promise<ReviewTextResult> {
  const finalUrl = decodeURIComponent(await resolveUrl(url));

  const reviewId = finalUrl.match(REVIEW_ID_RE)?.[1];
  const featureId = finalUrl.match(FEATURE_ID_RE)?.[1];
  if (!reviewId || !featureId) {
    throw new Error(
      "This looks like a place or profile link, not a single-review link. Open the review and use its own share link.",
    );
  }

  const pb = PB_TEMPLATE.replace("{FEATURE_ID}", featureId).replace("{REVIEW_ID}", reviewId);
  const endpoint = `https://www.google.com/maps/timeline/_rpc/pc?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(pb)}`;

  const response = await fetchWithRetry(endpoint);
  if (!response.ok) throw new Error(`Google returned ${response.status} for this review.`);

  const body = await response.text();
  const at = body.indexOf(`"${reviewId}"`);
  if (at === -1) throw new Error("Google did not return this review (it may be deleted).");

  // Reviews with photos push the text far past the header block, so read wide.
  const slice = body.slice(at, at + 120000);

  const rawText = slice.match(TEXT_RE)?.[1];
  const text = rawText ? unescapeJson(rawText).trim() : "";
  const reviewerName = slice.match(NAME_RE)?.[1];
  const ratingRaw = slice.match(RATING_RE)?.[1] ?? slice.match(RATING_FALLBACK_RE)?.[1];
  const micros = slice.match(DATE_US_RE)?.[1];
  const ageLabel = slice.match(AGE_LABEL_RE)?.[1];
  const rawPlace = body.match(PLACE_NAME_RE)?.[1];
  const businessName = rawPlace ? unescapeJson(rawPlace).trim().slice(0, 120) : "";

  // Keep the Google date/name even when the text can't be read, so callers can
  // fall back to the scraper for text without losing the real review date.
  if (!text && !micros) throw new Error("No review text found in Google's response (review may be empty).");

  return {
    url,
    ok: true,
    ...(text ? { text } : {}),
    ...(reviewerName ? { reviewer_name: reviewerName } : {}),
    ...(ratingRaw ? { rating: Number(ratingRaw) } : {}),
    ...(micros ? { published_at: new Date(Number(micros) / 1000).toISOString() } : {}),
    ...(ageLabel ? { age_label: ageLabel } : {}),
    ...(businessName ? { business_name: businessName } : {}),
  };
}

/** Runs a list of links with concurrency 3 — higher gets rate-limited. */
export async function fetchReviewTexts(urls: string[]): Promise<ReviewTextResult[]> {
  const results: ReviewTextResult[] = new Array(urls.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      const url = urls[index]!;
      try {
        results[index] = await fetchReviewRaw(url);
      } catch (error) {
        results[index] = { url, ok: false, error: (error as Error).message.slice(0, 400) };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(5, urls.length) }, worker));
  return results;
}
