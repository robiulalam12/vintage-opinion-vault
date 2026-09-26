import { createFileRoute, Link } from "@tanstack/react-router";

import { StarRating } from "@/components/StarRating";
import { formatReviewDate } from "@/components/ReviewCard";
import { listAfridiReviews, type AfridiReview } from "@/lib/afridi.functions";
import { absoluteImage, reviewIso } from "@/lib/review-schema";

const TITLE = "Afridi's Reviews — People Opinion Box";
const DESCRIPTION =
  "Every review written by Afridi on People Opinion Box — full review text, photos, star ratings and the exact publish date of each review.";
const URL = "https://peopleopinionbox.com/afridi";

export const Route = createFileRoute("/afridi/")({
  loader: async () => {
    try {
      return { reviews: await listAfridiReviews() };
    } catch {
      return { reviews: [] as AfridiReview[] };
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: AfridiReviewsPage,
  errorComponent: () => (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-2xl">Reviews are temporarily unavailable</h1>
      <p className="mt-3 text-muted-foreground">Please refresh the page in a moment.</p>
    </main>
  ),
});

function AfridiReviewsPage() {
  const { reviews } = Route.useLoaderData();
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: TITLE,
    description: DESCRIPTION,
    url: URL,
    mainEntity: { "@type": "Person", name: "Afridi" },
    hasPart: reviews.map((r) => ({
      "@type": "Review",
      name: r.headline,
      reviewBody: r.body,
      datePublished: reviewIso(r.review_date),
      dateCreated: reviewIso(r.review_date),
      dateModified: reviewIso(r.review_date),
      url: `${URL}/${r.slug}`,
      author: { "@type": "Person", name: "Afridi" },
      ...(absoluteImage(r.image_url)
        ? {
            image: {
              "@type": "ImageObject",
              url: absoluteImage(r.image_url),
              contentUrl: absoluteImage(r.image_url),
              caption: r.headline,
              uploadDate: reviewIso(r.review_date),
            },
          }
        : {}),
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
            Reviews by <span className="text-primary">Afridi</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            {reviews.length} review{reviews.length === 1 ? "" : "s"} published in full, each with
            its own page, rating and publish date.
          </p>
          {reviews.length > 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Average rating {avg.toFixed(1)} / 5</p>
          ) : null}
        </div>
      </section>

      <main className="mx-auto max-w-4xl px-5 pt-12 pb-24">
        {reviews.length === 0 ? (
          <p className="press-panel p-10 text-center text-muted-foreground">
            No reviews published yet.
          </p>
        ) : (
          <ul className="space-y-5">
            {reviews.map((review) => (
              <li key={review.id}>
                <article
                  className="press-panel overflow-hidden"
                  itemScope
                  itemType="https://schema.org/Review"
                >
                  <Link
                    to="/afridi/$slug"
                    params={{ slug: review.slug }}
                    className="block p-6 transition-colors hover:bg-accent/40 sm:p-7"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <StarRating rating={review.rating} />
                      <time
                        className="text-xs font-medium text-muted-foreground"
                        dateTime={reviewIso(review.review_date)}
                        itemProp="datePublished"
                      >
                        Published {formatReviewDate(review.review_date)}
                      </time>
                      <meta itemProp="dateCreated" content={reviewIso(review.review_date)} />
                      <meta itemProp="dateModified" content={reviewIso(review.review_date)} />
                      <span
                        className="sr-only"
                        itemProp="reviewRating"
                        itemScope
                        itemType="https://schema.org/Rating"
                      >
                        <meta itemProp="ratingValue" content={String(review.rating)} />
                        <meta itemProp="bestRating" content="5" />
                        <meta itemProp="worstRating" content="1" />
                      </span>
                    </div>
                    <h2
                      className="mt-4 font-display text-xl leading-snug tracking-tight text-foreground"
                      itemProp="name"
                    >
                      {review.headline}
                    </h2>
                    {review.subject ? (
                      <p
                        className="mt-1.5 text-sm text-muted-foreground"
                        itemProp="itemReviewed"
                        itemScope
                        itemType="https://schema.org/LocalBusiness"
                      >
                        Review of{" "}
                        <span className="text-foreground" itemProp="name">
                          {review.subject}
                        </span>
                      </p>
                    ) : null}
                    {review.image_url ? (
                      <span
                        className="mt-4 block"
                        itemProp="image"
                        itemScope
                        itemType="https://schema.org/ImageObject"
                      >
                        <meta
                          itemProp="url"
                          content={absoluteImage(review.image_url) ?? review.image_url}
                        />
                        <meta
                          itemProp="contentUrl"
                          content={absoluteImage(review.image_url) ?? review.image_url}
                        />
                        <meta itemProp="uploadDate" content={reviewIso(review.review_date)} />
                        <meta itemProp="caption" content={review.headline} />
                        <img
                          src={review.image_url}
                          alt={review.headline}
                          loading="lazy"
                          className="max-h-72 w-full rounded-xl object-cover"
                        />
                      </span>
                    ) : null}
                    <p
                      className="mt-4 line-clamp-4 text-[0.95rem] leading-relaxed text-foreground/85"
                      itemProp="reviewBody"
                    >
                      {review.body}
                    </p>
                    <span
                      className="sr-only"
                      itemProp="author"
                      itemScope
                      itemType="https://schema.org/Person"
                    >
                      <span itemProp="name">Afridi</span>
                    </span>
                    <span className="mt-5 inline-block text-sm font-medium text-primary">
                      Read full review →
                    </span>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display font-semibold text-foreground">People Opinion Box</p>
          <p className="max-w-2xl">
            Each review remains the property of its individual reviewer. People Opinion Box does not
            claim ownership of user-submitted content.
          </p>
        </div>
      </footer>
    </div>
  );
}
