/**
 * Server-only helpers shared by the key-protected /api/public/dmca/* routes.
 * Never import this from a component or a route module's top level.
 */

export const SITE_URL = "https://peopleopinionbox.com";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-api-key",
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

/** Constant-time-ish comparison of the extension key. */
export function checkKey(request: Request): boolean {
  const expected = process.env["DMCA_EXTENSION_KEY"] ?? "";
  const provided =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export function formatPublicationDate(value: string | null | undefined): string {
  if (!value) return "[publication date]";
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "[publication date]" : LONG_DATE.format(d);
}

export function reviewerDisplayName(key: string | null | undefined): string {
  if (key === "jonas") return "Jonas Weber";
  if (key === "benedikt") return "Benedikt Herrmann";
  return "Robiul Alam";
}

/** Notice text for one review, built from the order's saved DMCA copy template. */
export async function renderNoticeForSource(
  templateBody: string,
  source: {
    url: string;
    reviewer_name?: string | null;
    review_published_at?: string | null;
    review_text?: string | null;
    archive_url?: string | null;
    archive_date?: string | null;
    published_path?: string | null;
    published_review_date?: string | null;
    drive_url?: string | null;
  },
  ourReviewerName: string,
  urlMode: string = "site",
): Promise<string> {
  const { renderTemplate } = await import("@/lib/dmca-template");
  const siteUrl = source.published_path ? `${SITE_URL}${source.published_path}` : null;
  const drive = urlMode === "drive" ? (source.drive_url?.trim() || null) : null;
  return renderTemplate(templateBody, {
    url: source.url,
    reviewer_name: source.reviewer_name ?? null,
    review_published_at: source.review_published_at ?? null,
    review_text: source.review_text ?? null,
    // Drive mode: every "our review link" spot cites the Drive screenshot instead.
    archive_url: drive ?? source.archive_url ?? null,
    archive_date: source.archive_date ?? null,
    our_review_url: drive ?? siteUrl,
    our_publish_date: source.published_review_date ?? null,
    our_reviewer_name: ourReviewerName,
    drive_url: source.drive_url ?? null,
  }).text;
}

/** Same wording as the per-review DMCA boxes in the dashboard. */
export function buildWorkDescription(publicationDate: string | null, originalLink: string): string {
  return [
    `Copyrighted Work Description: I am the original author and copyright owner of the text review originally written and published by me on ${formatPublicationDate(publicationDate)}.`,
    "",
    `The copyrighted work consists of original written review text located at my original publication link provided in the fields below: ${originalLink}`,
    "",
    "Infringement Claim: The unauthorized copy posted on the target Google Business Profile reproduces my original copyrighted text word-for-word without permission, infringing on my exclusive copyright rights.",
  ].join("\n");
}

/** The link the form's "where can we find the work" field and notice cite for one review. */
export function originalLinkFor(
  source: { published_path?: string | null; drive_url?: string | null },
  urlMode: string,
): string {
  if (urlMode === "drive" && source.drive_url?.trim()) return source.drive_url.trim();
  return source.published_path ? `${SITE_URL}${source.published_path}` : `${SITE_URL}/robiul-alam`;
}

/** Random wait (seconds) within the order's range; 0 when no delay is set. */
export function randomDelaySeconds(min: number, max: number): number {
  const lo = Math.max(0, Math.floor(min || 0));
  const hi = Math.max(lo, Math.floor(max || 0));
  if (hi === 0) return 0;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
