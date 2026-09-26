import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { LeaveReviewDialog } from "@/components/LeaveReviewDialog";
import { ReviewCard } from "@/components/ReviewCard";
import { listPublicReviews, type PublicReview } from "@/lib/reviews.functions";

const TITLE = "People Opinion Box";
const DESCRIPTION =
  "A user-generated review platform for the services you use today — full review text, real names, star ratings and dates.";


export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      return { reviews: await listPublicReviews() };
    } catch {
      // Never blank the page if the reviews fetch fails (e.g. dev reload / offline).
      return { reviews: [] as PublicReview[] };
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://peopleopinionbox.com/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://peopleopinionbox.com/" }],
  }),
  component: HomePage,
  errorComponent: () => (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-2xl">Reviews are temporarily unavailable</h1>
      <p className="mt-3 text-muted-foreground">Please refresh the page in a moment.</p>
    </main>
  ),
});

function average(reviews: PublicReview[]) {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

function HomePage() {
  const { reviews } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const avg = average(reviews);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredReviews = normalizedQuery
    ? reviews.filter(
        (r) =>
          r.headline.toLowerCase().includes(normalizedQuery) ||
          r.body.toLowerCase().includes(normalizedQuery) ||
          r.reviewer_name.toLowerCase().includes(normalizedQuery) ||
          (r.reviewer_location && r.reviewer_location.toLowerCase().includes(normalizedQuery))
      )
    : reviews;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "People Opinion Box",
    description: DESCRIPTION,
    ...(reviews.length
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avg.toFixed(1),
            bestRating: "5",
            worstRating: "1",
            reviewCount: String(reviews.length),
          },
          review: reviews.map((r) => ({
            "@type": "Review",
            name: r.headline,
            reviewBody: r.body,
            datePublished: r.review_date,
            author: { "@type": "Person", name: r.reviewer_name },
            reviewRating: {
              "@type": "Rating",
              ratingValue: String(r.rating),
              bestRating: "5",
              worstRating: "1",
            },
          })),
        }
      : {}),
  };

  return (
    <div className="min-h-screen bg-background" itemScope itemType="https://schema.org/Organization">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <meta itemProp="name" content="People Opinion Box" />

      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            >
              P
            </span>
            <span className="font-display text-[0.95rem] font-semibold tracking-tight text-foreground">
              People Opinion Box
            </span>
          </span>
          <LeaveReviewDialog />
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 max-w-2xl rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-5 py-12 text-center sm:py-16">
          <div className="mx-auto mb-6 inline-flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground shadow-sm">
              <svg aria-hidden="true" className="size-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0-1.807-1.95C14.533 10.477 13.685 10 12.5 10c-1.185 0-2.033.477-2.096.702a3 3 0 0 0-1.807 1.95C8.307 13.6 8 14.487 8 15.333V17a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1.667c0-.846-.307-1.733-.597-2.681Z" clipRule="evenodd" />
                <path d="M12.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              </svg>
              Trusted by millions of reviewers
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground shadow-sm">
              <svg aria-hidden="true" className="size-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.661 2.237a.5.5 0 0 1 .678 0l6.5 5.999a.5.5 0 0 1 .012.717l-6.5 6.5a.5.5 0 0 1-.702 0l-6.5-6.5a.5.5 0 0 1 .012-.717l6.5-5.999Z" clipRule="evenodd" />
              </svg>
              Verified ratings
            </span>
          </div>

          <h1 className="font-display text-3xl leading-[1.1] tracking-tight text-foreground sm:text-5xl">
            A user-generated review platform{" "}
            <span className="text-primary">for the services you use today.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            People Opinion Box is a user-generated review platform where real
            customers share full review.
          </p>

          <div className="mx-auto mt-8 max-w-md">
            <label htmlFor="review-search" className="sr-only">
              Search reviews
            </label>
            <div className="relative">
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                />
              </svg>
              <input
                id="review-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reviews, businesses, or reviewers..."
                className="w-full rounded-full border border-border bg-background py-3 pr-5 pl-11 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

        </div>
      </section>


      <main className="mx-auto max-w-6xl px-5 pt-12 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
            All reviews
          </h2>
          <span className="text-sm text-muted-foreground">Newest first</span>
        </div>

        {filteredReviews.length === 0 ? (
          <p className="press-panel mt-8 p-10 text-center text-muted-foreground">
            {query.trim() ? "No reviews match your search." : "No reviews have been published yet."}
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredReviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}

      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display font-semibold text-foreground">People Opinion Box</p>
          <p className="max-w-2xl">
            Each review remains the property of its individual reviewer. People Opinion Box does not claim ownership of user-submitted content and has no right to use it beyond displaying it on this platform.
          </p>
        </div>
      </footer>
    </div>
  );
}
