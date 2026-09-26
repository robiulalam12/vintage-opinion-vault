/**
 * Server-only helpers that fetch a review page (Google reviews link, Google
 * Maps place link, or any public review URL) and pull the full review text out
 * of it. The page HTML is reduced to readable text and an AI model extracts the
 * structured reviews, which keeps the extraction working when Google changes
 * its markup.
 */

export interface ScrapedReview {
  reviewer_name: string;
  reviewer_location: string;
  subject: string;
  headline: string;
  body: string;
  rating: number;
  review_date: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

function withEnglish(url: URL): string {
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  return url.toString();
}

/** Follows g.page / maps.app.goo.gl short links to the real Google Maps URL. */
async function expandShortLink(raw: string): Promise<string> {
  if (!/^https?:\/\/(g\.page|goo\.gl|maps\.app\.goo\.gl|share\.google)\//i.test(raw)) return raw;
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    try {
      // A browser user-agent gets a JavaScript interstitial from Google's short
      // link service; a plain client gets the real 302 redirect.
      const res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": "curl/8.4.0", accept: "*/*" },
      });
      const location = res.headers.get("location");
      if (!location) return res.url && res.url !== current ? res.url : current;

      current = new URL(location, current).toString();
      if (!/^https?:\/\/(g\.page|goo\.gl|maps\.app\.goo\.gl|share\.google)\//i.test(current)) {
        return current;
      }
    } catch {
      return current;
    }
  }
  return current;
}


/**
 * Google Maps place pages render their reviews with JavaScript and hide them
 * behind a tab, while `search.google.com/local/reviews` renders the review list
 * directly. When we can read a place id / feature id out of the link we use that
 * page, because it exposes the full review text, names, ratings and dates.
 */
export async function reviewUrlCandidates(rawUrl: string): Promise<string[]> {
  const expanded = await expandShortLink(rawUrl);
  const candidates: string[] = [];

  let url: URL;
  try {
    url = new URL(expanded);
  } catch {
    return [rawUrl];
  }

  const isGoogle = /(^|\.)(google\.[a-z.]+)$/i.test(url.hostname);
  if (!isGoogle) return [expanded];

  if (/\/local\/reviews/.test(url.pathname)) candidates.push(withEnglish(url));

  // A shared review permalink renders its review (and the owner reply) reliably,
  // so try it before the search endpoints, which often hit a captcha.
  if (/\/maps\/reviews/.test(url.pathname)) candidates.push(withEnglish(new URL(expanded)));

  const placeId =
    url.searchParams.get("placeid") ??
    url.searchParams.get("place_id") ??
    expanded.match(/!1s(ChIJ[\w-]+)/)?.[1] ??
    expanded.match(/place_id[:=]([\w-]{20,})/)?.[1] ??
    null;
  if (placeId) {
    candidates.push(
      `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}&hl=en&gl=us`,
    );
  }

  // Only a complete feature id works on the reviews endpoint; a "0x0:" prefix
  // (all a review permalink carries) just returns a captcha page.
  const featureId = expanded.match(/(0x[0-9a-f]{4,}:0x[0-9a-f]+)/i)?.[1];
  if (featureId) {
    candidates.push(
      `https://search.google.com/local/reviews?fid=${featureId}&hl=en&gl=us`,
    );
  }


  const cid = url.searchParams.get("cid") ?? url.searchParams.get("ludocid");
  if (cid && /^\d+$/.test(cid)) {
    try {
      const hex = BigInt(cid).toString(16);
      candidates.push(`https://search.google.com/local/reviews?fid=0x0:0x${hex}&hl=en&gl=us`);
    } catch {
      // ignore unparsable ids
    }
  }


  // Reviews tab of the Maps place page, as a last resort.
  candidates.push(withEnglish(url));

  return [...new Set(candidates)];
}

interface ScrapeResult {
  text: string;
  title: string;
}

/** Renders a page with the Firecrawl scraper (JavaScript pages included). */
async function firecrawlScrape(url: string, scrolls: number): Promise<ScrapeResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const firecrawlKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !firecrawlKey) throw new Error("Scraper is not configured.");

  const actions: { type: string; direction?: string; milliseconds?: number }[] = [
    { type: "wait", milliseconds: 3000 },
  ];
  for (let i = 0; i < scrolls; i++) {
    actions.push({ type: "scroll", direction: "down" });
    actions.push({ type: "wait", milliseconds: 1200 });
  }

  const body = {
    url,
    formats: ["markdown"],
    onlyMainContent: false,
    waitFor: 4000,
    location: { country: "US", languages: ["en"] },
    actions,
  };

  const send = async (payload: Record<string, unknown>) =>
    fetch(`${GATEWAY}/scrape`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": firecrawlKey,
      },
      body: JSON.stringify(payload),
    });

  let response = await send(body);
  if (!response.ok) {
    // Some pages reject the scroll actions; retry with a plain render.
    const { actions: _drop, ...plain } = body;
    response = await send(plain);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Scraper failed [${response.status}]: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    data?: { markdown?: string; metadata?: { title?: string } };
    markdown?: string;
    metadata?: { title?: string };
  };
  const markdown = payload.data?.markdown ?? payload.markdown ?? "";
  const title = payload.data?.metadata?.title ?? payload.metadata?.title ?? "";
  if (!markdown.trim()) throw new Error("The page returned no readable content.");
  if (/unusual traffic|I'm not a robot|recaptcha requires verification/i.test(markdown)) {
    throw new Error("Google asked the scraper to verify itself — try this link again shortly.");
  }
  return { text: markdown, title };
}

/** Plain HTML fallback for simple, server-rendered review pages. */
async function plainFetch(rawUrl: string): Promise<ScrapeResult> {
  const response = await fetch(rawUrl, {
    redirect: "follow",
    headers: {
      "user-agent": UA,
      "accept-language": "en-US,en;q=0.9",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`The link returned ${response.status}.`);
  const html = (await response.text()).slice(0, 2_000_000);
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: text.slice(0, 220_000), title };
}

/** Looks like a page that actually contains reviews. */
function looksLikeReviews(text: string): boolean {
  const hits = (text.match(/\bago\b/gi) ?? []).length;
  return hits >= 2 || /\d\s*(star|\/5)/i.test(text);
}

export async function fetchPageText(rawUrl: string): Promise<ScrapeResult> {
  const candidates = await reviewUrlCandidates(rawUrl);
  let lastError: Error | null = null;
  let best: ScrapeResult | null = null;

  for (const candidate of candidates) {
    try {
      const result = await firecrawlScrape(candidate, 6);
      if (looksLikeReviews(result.text)) return trim(result);
      best = best ?? result;
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (!best) {
    try {
      best = await plainFetch(candidates[candidates.length - 1] ?? rawUrl);
    } catch (error) {
      throw lastError ?? (error as Error);
    }
  }
  return trim(best);
}

function trim(result: ScrapeResult): ScrapeResult {
  return { text: result.text.slice(0, 220_000), title: result.title };
}


function decodeEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

const SYSTEM_PROMPT = `You extract customer reviews from raw page text scraped from a review page (usually Google reviews / Google Maps).
Rules:
- Return every distinct review you can find, with the review text copied EXACTLY and IN FULL. Never summarise, translate, shorten or rewrite it.
- Skip navigation text, ads, related places, and anything that is not a customer review.
- rating must be a whole number 1-5. If a review shows no rating, infer it from the wording.
- review_date must be YYYY-MM-DD. If the page shows a relative date ("3 years ago"), convert it using today's date. If unknown, use today's date.
- headline: a short 3-10 word title you write from the review's own wording.
- subject: the business/service being reviewed.
- reviewer_location: city/region if shown, otherwise empty string.
- Reviews shorter than 20 characters must be skipped.
- The scraped text may end a review with "… More" where the page truncated it: keep the visible text and drop that trailing marker.
- Ignore reviewer profile stats like "6 reviews·1 photo" and "Report review" links.
Return JSON only.`;

interface AiReview {
  reviewer_name?: string;
  reviewer_location?: string;
  subject?: string;
  headline?: string;
  body?: string;
  rating?: number | string;
  review_date?: string;
}

export async function extractReviews(
  pageText: string,
  pageTitle: string,
  sourceUrl: string,
): Promise<ScrapedReview[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI extraction is not configured.");
  const today = new Date().toISOString().slice(0, 10);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Today is ${today}. Source URL: ${sourceUrl}\nPage title: ${pageTitle}\n\nPAGE TEXT:\n${pageText}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_reviews",
            description: "Return every review found on the page.",
            parameters: {
              type: "object",
              properties: {
                reviews: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      reviewer_name: { type: "string" },
                      reviewer_location: { type: "string" },
                      subject: { type: "string" },
                      headline: { type: "string" },
                      body: { type: "string" },
                      rating: { type: "integer" },
                      review_date: { type: "string" },
                    },
                    required: ["reviewer_name", "headline", "body", "rating", "review_date"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["reviews"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_reviews" } },
    }),
  });

  if (response.status === 429) throw new Error("AI rate limit reached — try again in a moment.");
  if (response.status === 402) throw new Error("AI credits exhausted.");
  if (!response.ok) throw new Error(`AI extraction failed (${response.status}).`);

  const payload = (await response.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];

  let parsed: { reviews?: AiReview[] };
  try {
    parsed = JSON.parse(args) as { reviews?: AiReview[] };
  } catch {
    return [];
  }

  return (parsed.reviews ?? [])
    .map((r) => normaliseReview(r, pageTitle, today))
    .filter((r): r is ScrapedReview => r !== null);
}

function normaliseReview(
  raw: AiReview,
  pageTitle: string,
  today: string,
): ScrapedReview | null {
  const body = (raw.body ?? "").trim();
  const name = (raw.reviewer_name ?? "").trim();
  if (body.length < 20 || name.length < 2) return null;

  const ratingNumber = Math.round(Number(raw.rating));
  const rating = Number.isFinite(ratingNumber) ? Math.min(5, Math.max(1, ratingNumber)) : 5;

  const date = (raw.review_date ?? "").trim();
  const review_date = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;

  const headline = (raw.headline ?? "").trim() || body.split(/[.!?\n]/)[0]!.slice(0, 120);

  return {
    reviewer_name: name.slice(0, 80),
    reviewer_location: (raw.reviewer_location ?? "").trim().slice(0, 80),
    subject: ((raw.subject ?? "").trim() || pageTitle).slice(0, 120),
    headline: headline.slice(0, 140),
    body: body.slice(0, 4000),
    rating,
    review_date,
  };
}
