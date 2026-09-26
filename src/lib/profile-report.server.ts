/**
 * Server-only helpers for the Profile Report tool.
 *
 * A Google review share link is resolved to its canonical review permalink, and
 * the public place-card RPC is then asked for that exact review. The response
 * carries the reviewer's contributor id, which becomes the reviewer profile URL
 * (https://www.google.com/maps/contrib/<id>/reviews). No browser session or
 * extension is involved.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "CONSENT=YES+cb; SOCS=CAI",
};

const REVIEW_ID_RE = /!2m5!1s([A-Za-z0-9_-]{15,})/;
const FEATURE_ID_RE = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i;
const FULL_FEATURE_ID_RE = /(0x[0-9a-f]{5,}:0x[0-9a-f]{5,})/i;
const CONTRIB_RE = /contrib\/(\d{8,30})/;

const PB_TEMPLATE =
  "!3m3!1sAAAAAAAAAAAAAAAAAAAAAA!7e81!15i31661!5m3!1b1!9m1!1e3!6m56!1m49!1m5!1m4!1e1!1e3!1e2!1e4!3m5!2m4!3m3!1m2!1i260!2i365!4m1!3i20!10b1!11m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!2m5!1e1!1e4!1e5!1e3!1e2!7m0!8m28!1m6!1m2!1i0!2i0!2m2!1i530!2i768!1m6!1m2!1i974!2i0!2m2!1i1024!2i768!1m6!1m2!1i0!2i0!2m2!1i1024!2i20!1m6!1m2!1i0!2i748!2m2!1i1024!2i768!10s{FEATURE_ID}!11s{REVIEW_ID}";

export interface ResolvedTarget {
  url: string;
  ok: boolean;
  error?: string;
  canonical_url?: string;
  place_id?: string;
  reviewer_profile_url?: string;
  contributor_id?: string;
}

/** Follows short links (maps.app.goo.gl, share.google) to the canonical URL. */
async function resolveUrl(url: string): Promise<string> {
  if (url.includes("/maps/reviews/data=")) return url;
  const response = await fetch(url, {
    redirect: "follow",
    headers: HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  await response.text().catch(() => "");
  return response.url || url;
}

/**
 * Asks the public place-card RPC for one review. Returns the place's full
 * feature id and the reviewer's contributor id when Google includes them.
 */
async function lookupReviewMeta(
  featureId: string,
  reviewId: string,
): Promise<{ fullFeatureId?: string; contributorId?: string }> {
  const pb = PB_TEMPLATE.replace("{FEATURE_ID}", featureId).replace("{REVIEW_ID}", reviewId);
  const endpoint = `https://www.google.com/maps/timeline/_rpc/pc?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(pb)}`;
  try {
    const response = await fetch(endpoint, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return {};
    const body = await response.text();
    const fullFeatureId = body.match(FULL_FEATURE_ID_RE)?.[1];
    const contributorId = body.match(CONTRIB_RE)?.[1];
    return {
      ...(fullFeatureId ? { fullFeatureId } : {}),
      ...(contributorId ? { contributorId } : {}),
    };
  } catch {
    return {};
  }
}

/** Resolves one link to its canonical review + the reviewer's profile URL. */
export async function resolveProfileTarget(rawUrl: string): Promise<ResolvedTarget> {
  try {
    const canonical = decodeURIComponent(await resolveUrl(rawUrl));
    const reviewId = canonical.match(REVIEW_ID_RE)?.[1];
    const featureId = canonical.match(FEATURE_ID_RE)?.[1];

    if (!reviewId) {
      return {
        url: rawUrl,
        ok: false,
        error:
          "Not a single-review link — place and profile links carry no review id. Open the review and copy its own share link.",
      };
    }

    const meta = featureId ? await lookupReviewMeta(featureId, reviewId) : {};
    const fullFeatureId =
      featureId && !featureId.startsWith("0x0:") ? featureId : meta.fullFeatureId;
    const contributorId = meta.contributorId;

    return {
      url: rawUrl,
      ok: true,
      canonical_url: canonical,
      ...(fullFeatureId ? { place_id: fullFeatureId } : {}),
      ...(contributorId
        ? {
            contributor_id: contributorId,
            reviewer_profile_url: `https://www.google.com/maps/contrib/${contributorId}/reviews`,
          }
        : {}),
    };
  } catch (error) {
    return { url: rawUrl, ok: false, error: (error as Error).message || "Could not resolve link" };
  }
}

/** Resolves a batch with bounded concurrency. */
export async function resolveProfileTargets(
  urls: string[],
  concurrency = 12,
): Promise<ResolvedTarget[]> {
  const results: ResolvedTarget[] = new Array(urls.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      results[index] = await resolveProfileTarget(urls[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Normalises whatever the extension scraped into a canonical profile URL. */
export function normaliseProfileUrl(
  raw: string,
): { url: string; contributorId: string | null } | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  const id = value.match(/contrib\/(\d{8,30})/)?.[1] ?? value.match(/^\d{8,30}$/)?.[0] ?? null;
  if (id) return { url: `https://www.google.com/maps/contrib/${id}/reviews`, contributorId: id };
  if (/^https?:\/\//i.test(value)) return { url: value, contributorId: null };
  return null;
}
