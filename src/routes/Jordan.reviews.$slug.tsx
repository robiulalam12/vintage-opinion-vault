import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { ReviewDetailView } from "@/components/ReviewDetailView";
import { getPublicReviewBySlug } from "@/lib/reviews.functions";
import { REVIEWER_PROFILES } from "@/lib/reviewer-profiles";
import { buildReviewJsonLd, reviewIso } from "@/lib/review-schema";

const SITE = "https://peopleopinionbox.com";

export const Route = createFileRoute("/Jordan/reviews/$slug")({
  loader: async ({ params }) => {
    const review = await getPublicReviewBySlug({ data: { slug: params.slug } });
    if (!review) throw notFound();
    return { review };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Review unavailable — People Opinion Box" }, { name: "robots", content: "noindex" }],
      };
    }
    const { review } = loaderData;
    const publishedAt = reviewIso(review.review_date);
    const title = `${review.headline} — ${review.subject ?? "Review"} reviewed by Jordan`;
    const description = review.body.slice(0, 155);
    return {
      meta: [
        { title: title.slice(0, 70) },
        { name: "description", content: description },
        { property: "og:title", content: title.slice(0, 70) },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        {
          property: "og:url",
          content: `${SITE}/Jordan/reviews/${params.slug}`,
        },
        { property: "article:published_time", content: publishedAt },
        { property: "article:modified_time", content: publishedAt },
        { name: "date", content: review.review_date },
        { name: "twitter:card", content: "summary" },
      ],
      links: [
        {
          rel: "canonical",
          href: `${SITE}/Jordan/reviews/${params.slug}`,
        },
      ],
    };
  },
  component: ReviewDetailPage,
  notFoundComponent: () => (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="font-display text-2xl">Review not found</h1>
      <p className="mt-3 text-muted-foreground">This review page does not exist.</p>
      <Link to="/Jordan/reviews" className="mt-6 inline-block text-primary underline">
        Back to Jordan's reviews
      </Link>
    </main>
  ),
  errorComponent: () => (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="font-display text-2xl">Review temporarily unavailable</h1>
      <p className="mt-3 text-muted-foreground">Please refresh in a moment.</p>
    </main>
  ),
});

function ReviewDetailPage() {
  const { review } = Route.useLoaderData();
  const image = null;
  const profile = REVIEWER_PROFILES.jordan;
  const jsonLd = buildReviewJsonLd({
    headline: review.headline, body: review.body, reviewDate: review.review_date,
    rating: review.rating, canonicalUrl: `${SITE}/Jordan/reviews/${review.slug}`,
    authorName: profile.name, authorUrl: profile.path, authorImage: profile.avatar,
    authorPhotoDate: profile.photoDate, subject: review.subject, image,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ReviewDetailView review={review} profile={REVIEWER_PROFILES.jordan} image={image} />
    </>
  );
}
