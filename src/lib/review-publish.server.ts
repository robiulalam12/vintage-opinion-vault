/** Helpers for turning a fetched review draft into a published Jordan review. */

const PREFIXES = [
  "Maple", "Riverbend", "Oakline", "Harborview", "Stonegate", "Northgate", "Copper",
  "Willow", "Brightside", "Ironwood", "Silverleaf", "Cedarpoint", "Bluestone",
  "Redbrick", "Fairview", "Lakeside", "Greenfield", "Sunnyvale", "Kingsley", "Ashford",
];

const NOUNS = [
  "Auto Repair", "Dental Studio", "Family Diner", "Plumbing Co.", "Barbershop",
  "Coffee House", "Pet Clinic", "Roofing Services", "Bakery", "Fitness Club",
  "Law Office", "Moving Company", "Garden Centre", "Tyre Centre", "Dry Cleaners",
  "Physio Clinic", "Electrical Services", "Hair Lounge", "Hardware Store", "Print Shop",
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

/** Random fictional local business name, e.g. "Riverbend Dental Studio". */
export function dummyBusinessName(): string {
  return `${pick(PREFIXES)} ${pick(NOUNS)}`;
}

/** Random ISO date between 12 and 15 years before today. */
export function backdatedReviewDate(): string {
  const now = new Date();
  const maxDays = 15 * 365;
  const minDays = 12 * 365;
  const daysAgo = minDays + Math.floor(Math.random() * (maxDays - minDays + 1));
  const date = new Date(now.getTime() - daysAgo * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** First sentence (or clipped opening) of the review, used as the headline. */
export function headlineFromBody(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  const sentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  const base = sentence.length >= 12 ? sentence : clean;
  if (base.length <= 120) return base.replace(/[.\s]+$/, "");
  return `${base.slice(0, 117).trim()}…`;
}

/**
 * Random ISO date 90–180 days before the given source date (the Google review's
 * own date). Falls back to today when no source date is known.
 */
export function backdatedFromSourceDate(sourceDate: string | null | undefined): {
  date: string;
  fallback: boolean;
} {
  const parsed = sourceDate ? new Date(sourceDate) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime());
  const anchor = valid ? parsed! : new Date();
  const daysBack = 90 + Math.floor(Math.random() * 91);
  const date = new Date(anchor.getTime() - daysBack * 86_400_000);
  return { date: date.toISOString().slice(0, 10), fallback: !valid };
}

export function slugifyHeadline(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70)
    .replace(/^-|-$/g, "");
  return base || "review";
}
