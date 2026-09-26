import { createFileRoute, Link } from "@tanstack/react-router";

import { ReviewCard } from "@/components/ReviewCard";
import { listPublicReviews, type PublicReview } from "@/lib/reviews.functions";
import { reviewIso } from "@/lib/review-schema";

const REVIEWER = "Jordan";
const TITLE = "Jordan's Reviews — Local Business Reviews on People Opinion Box";
const DESCRIPTION =
  "All reviews written by Jordan on People Opinion Box — full review text, star ratings and original dates for local businesses, published exactly as written.";

export const Route = createFileRoute("/Jordan/reviews/")({
  loader: async () => {
    try {
      const all = await listPublicReviews();
      return {
        reviews: all.filter(
          (r) => r.reviewer_name.trim().toLowerCase() === REVIEWER.toLowerCase()
        ),
      };
    } catch {
      return { reviews: [] as PublicReview[] };
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: "https://peopleopinionbox.com/Jordan/reviews" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://peopleopinionbox.com/Jordan/reviews" }],
  }),
  component: JordanReviewsPage,
  errorComponent: () => (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-2xl">Reviews are temporarily unavailable</h1>
      <p className="mt-3 text-muted-foreground">Please refresh the page in a moment.</p>
    </main>
  ),
});

function JordanReviewsPage() {
  const { reviews } = Route.useLoaderData();
  const avg =
    reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: TITLE,
    description: DESCRIPTION,
    mainEntity: {
      "@type": "Person",
      name: REVIEWER,
      ...(reviews[0]?.reviewer_location ? { address: reviews[0].reviewer_location } : {}),
    },
    hasPart: reviews.map((r) => ({
      "@type": "Review",
      name: r.headline,
      reviewBody: r.body,
      datePublished: reviewIso(r.review_date),
      dateModified: reviewIso(r.review_date),
      author: { "@type": "Person", name: r.reviewer_name },
      ...(r.subject ? { itemReviewed: { "@type": "LocalBusiness", name: r.subject } } : {}),
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(r.rating),
        bestRating: "5",
        worstRating: "1",
      },
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            >
              P
            </span>
            <span className="font-display text-[0.95rem] font-semibold tracking-tight text-foreground">
              People Opinion Box
            </span>
          </Link>
          <Link
            to="/"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            All reviews
          </Link>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-5 py-12 text-center sm:py-16">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground shadow-sm">
            Reviewer profile
          </span>
          <h1 className="mt-5 font-display text-3xl leading-[1.1] tracking-tight text-foreground sm:text-4xl">
            Reviews by <span className="text-primary">Jordan</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            {reviews.length} reviews of local businesses, published in full with their
            original ratings and dates.
          </p>
          {reviews.length > 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Average rating {avg.toFixed(1)} / 5
            </p>
          ) : null}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 pt-12 pb-24">
        {reviews.length === 0 ? (
          <p className="press-panel p-10 text-center text-muted-foreground">
            No reviews from this reviewer yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) =>
              review.slug ? (
                <Link
                  key={review.id}
                  to="/Jordan/reviews/$slug"
                  params={{ slug: review.slug }}
                  className="block transition-transform hover:-translate-y-0.5"
                >
                  <ReviewCard review={review} />
                </Link>
              ) : (
                <ReviewCard key={review.id} review={review} />
              ),
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display font-semibold text-foreground">People Opinion Box</p>
          <p className="max-w-2xl">
            Each review remains the property of its individual reviewer. People Opinion Box
            does not claim ownership of user-submitted content and has no right to use it
            beyond displaying it on this platform.
          </p>
        </div>
      </footer>
    </div>
  );
}
