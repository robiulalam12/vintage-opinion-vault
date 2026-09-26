import { Link } from "@tanstack/react-router";
import { ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";

export type ReviewerIndexItem = {
  id: string;
  slug: string;
  headline: string;
  review_date: string;
};

type ReviewRoute =
  | "/robiul-alam/$slug"
  | "/Jonas-Weber/$slug"
  | "/Benedikt-Herrmann/$slug"
  | "/afridi/$slug"
  | "/Jordan/reviews/$slug";

type ReviewerIndexInfoProps = {
  reviewerName: string;
  profilePath:
    | "/robiul-alam"
    | "/Jonas-Weber"
    | "/Benedikt-Herrmann"
    | "/afridi"
    | "/Jordan/reviews";
  reviewRoute: ReviewRoute;
  reviews: ReviewerIndexItem[];
};

function archiveDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
  );
}

export function ReviewerIndexInfo({
  reviewerName,
  profilePath,
  reviewRoute,
  reviews,
}: ReviewerIndexInfoProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleReviews = useMemo(
    () =>
      normalizedQuery
        ? reviews.filter((review) => {
            const url = `peopleopinionbox.com${profilePath}/${review.slug}`;
            return `${url} ${review.headline}`.toLowerCase().includes(normalizedQuery);
          })
        : reviews,
    [normalizedQuery, profilePath, reviews],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[96rem] flex-col gap-5 px-4 py-6 sm:px-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              to={profilePath}
              className="text-sm font-medium text-primary transition-colors hover:text-accent-foreground"
            >
              ← {reviewerName}'s profile
            </Link>
            <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{reviewerName} review index</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {reviews.length} published review URL{reviews.length === 1 ? "" : "s"}
            </p>
          </div>

          <label className="relative block w-full lg:max-w-sm">
            <span className="sr-only">Filter results by URL or headline</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter results by URL or headline"
              className="h-11 w-full rounded-md border border-input bg-background pr-3 pl-10 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-[96rem] px-4 py-7 sm:px-7">
        <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-muted/45">
                  <th className="px-4 py-3.5 font-semibold">URL</th>
                  <th className="px-4 py-3.5 text-center font-semibold">MIME Type</th>
                  <th className="px-4 py-3.5 font-semibold">From</th>
                  <th className="px-4 py-3.5 font-semibold">To</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Captures</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Duplicates</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Uniques</th>
                </tr>
              </thead>
              <tbody>
                {visibleReviews.map((review) => (
                  <tr key={review.id} className="border-b border-border last:border-b-0 hover:bg-accent/35">
                    <td className="max-w-2xl px-4 py-3">
                      <Link
                        to={reviewRoute}
                        params={{ slug: review.slug }}
                        title={review.headline}
                        className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <span className="break-all">
                          https://peopleopinionbox.com{profilePath}/{review.slug}
                        </span>
                        <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center">text/html</td>
                    <td className="whitespace-nowrap px-4 py-3">{archiveDate(review.review_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{archiveDate(review.review_date)}</td>
                    <td className="px-4 py-3 text-center tabular-nums">1</td>
                    <td className="px-4 py-3 text-center tabular-nums">0</td>
                    <td className="px-4 py-3 text-center tabular-nums">1</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleReviews.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              {reviews.length === 0 ? "No published reviews yet." : "No URLs match your filter."}
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          This index updates automatically when published reviews change.
        </p>
      </main>
    </div>
  );
}