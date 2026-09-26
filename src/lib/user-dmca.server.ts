/**
 * Server-only helpers for the key-protected /api/public/user-dmca/* routes.
 * Each user has a personal extension token, so the queue only ever serves that
 * user's own orders, review links and DMCA reports.
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

function tokenFrom(request: Request): string {
  return (
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  ).trim();
}

/** Resolves the signed-in owner behind a personal extension token. */
export async function resolveOwner(
  request: Request,
): Promise<{ ownerId: string } | { error: Response }> {
  const token = tokenFrom(request);
  if (token.length < 24) return { error: json({ error: "Unauthorized" }, 401) };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_extension_keys")
    .select("owner_id")
    .eq("token", token)
    .maybeSingle();
  if (error) return { error: json({ error: error.message }, 500) };
  if (!data) return { error: json({ error: "Unauthorized" }, 401) };

  // Key holders must still have an active access key.
  const { data: active } = await supabaseAdmin.rpc("has_active_key", { _user_id: data.owner_id });
  if (!active) {
    return { error: json({ error: "Your access key is not active. Activate it in Settings." }, 403) };
  }

  await supabaseAdmin
    .from("user_extension_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("owner_id", data.owner_id);

  return { ownerId: data.owner_id };
}

/** The link the form's "where can we find the work" field and notice cite. */
export function originalLinkFor(
  source: { published_path?: string | null; drive_url?: string | null },
  urlMode: string,
): string {
  if (urlMode === "drive" && source.drive_url?.trim()) return source.drive_url.trim();
  return source.published_path ? `${SITE_URL}${source.published_path}` : SITE_URL;
}

export async function renderNoticeForSource(
  templateBody: string,
  source: {
    url: string;
    reviewer_name?: string | null;
    review_published_at?: string | null;
    review_text?: string | null;
    published_path?: string | null;
    published_review_date?: string | null;
    drive_url?: string | null;
  },
  ourReviewerName: string,
  urlMode = "review",
): Promise<string> {
  const { renderTemplate } = await import("@/lib/dmca-template");
  const siteUrl = source.published_path ? `${SITE_URL}${source.published_path}` : null;
  const drive = urlMode === "drive" ? (source.drive_url?.trim() || null) : null;
  return renderTemplate(templateBody, {
    url: source.url,
    reviewer_name: source.reviewer_name ?? null,
    review_published_at: source.review_published_at ?? null,
    review_text: source.review_text ?? null,
    archive_url: drive ?? siteUrl,
    archive_date: source.published_review_date ?? null,
    our_review_url: drive ?? siteUrl,
    our_publish_date: source.published_review_date ?? null,
    our_reviewer_name: ourReviewerName,
    drive_url: source.drive_url ?? null,
  }).text;
}

export function randomDelaySeconds(min: number, max: number): number {
  const lo = Math.max(0, Math.floor(min || 0));
  const hi = Math.max(lo, Math.floor(max || 0));
  if (hi === 0) return 0;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
