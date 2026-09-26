/** Client-safe helpers for notice templates. Only truthful, verifiable fields are offered. */

export const TEMPLATE_FIELDS = [
  { token: "{{reviewer_name}}", label: "Reviewer name (our profile)" },
  { token: "{{google_review_url}}", label: "Google review link" },
  { token: "{{google_review_date}}", label: "Google review date" },
  { token: "{{review_text}}", label: "Full review text" },
  { token: "{{archive_url}}", label: "Our review page link" },
  { token: "{{archive_date}}", label: "Our review publish date" },
  { token: "{{drive_img_link}}", label: "Drive img link (review screenshot)" },
] as const;

export interface TemplateSource {
  url: string;
  reviewer_name: string | null;
  review_published_at: string | null;
  review_text: string | null;
  archive_url: string | null;
  archive_date: string | null;
  /** Public URL of the review on our site — used when no archive link is set yet. */
  our_review_url?: string | null;
  /** Publish date of the review on our site — used when no archive date is set yet. */
  our_publish_date?: string | null;
  /** Display name of our reviewer profile (Robiul Alam, Jonas Weber, …) — fills {{reviewer_name}}. */
  our_reviewer_name?: string | null;
  /** Public Google Drive link of this review's full-page screenshot. */
  drive_url?: string | null;
}

const LONG = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

function fmt(value: string | null) {
  if (!value) return "";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? "" : LONG.format(d);
}

/** Returns the filled text plus any fields that are missing for this review. */
export function renderTemplate(body: string, s: TemplateSource) {
  const values: Record<string, string> = {
    "{{reviewer_name}}": s.our_reviewer_name?.trim() ?? "",
    "{{google_review_url}}": s.url,
    "{{google_review_date}}": fmt(s.review_published_at),
    "{{review_text}}": s.review_text?.trim() ?? "",
    "{{archive_url}}": s.archive_url?.trim() || s.our_review_url?.trim() || "",
    "{{drive_img_link}}": s.drive_url?.trim() ?? "",
    "{{archive_date}}": s.archive_date?.trim() ? fmt(s.archive_date) : fmt(s.our_publish_date ?? null),
  };
  const missing: string[] = [];
  let text = body;
  for (const f of TEMPLATE_FIELDS) {
    if (!text.includes(f.token)) continue;
    if (!values[f.token]) missing.push(f.label);
    text = text.split(f.token).join(values[f.token] || `[${f.label}]`);
  }
  return { text, missing };
}
