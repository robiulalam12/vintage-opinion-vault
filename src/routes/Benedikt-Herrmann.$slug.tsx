import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { ReviewDetailView } from "@/components/ReviewDetailView";
import { REVIEWER_PROFILES } from "@/lib/reviewer-profiles";
import { getBenediktReviewBySlug } from "@/lib/robiul.functions";
import { absoluteImage, buildReviewJsonLd, reviewIso } from "@/lib/review-schema";

const SITE = "https://peopleopinionbox.com";
const PROFILE = REVIEWER_PROFILES.benedikt;

export const Route = createFileRoute("/Benedikt-Herrmann/$slug")({
  loader: async ({ params }) => {
    const review = await getBenediktReviewBySlug({ data: { slug: params.slug } });
    if (!review) throw notFound();
    return { review };
  },
  head: ({ loaderData, params }) => {
    const url = `${SITE}/Benedikt-Herrmann/${params.slug}`;
    if (!loaderData) {
      return {
        meta: [
          { title: "Review unavailable — People Opinion Box" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { review } = loaderData;
    const title = `${review.headline} — reviewed by Benedikt Herrmann`;
    const description = review.body.slice(0, 155);
    const image = absoluteImage(review.image_url);
    return {
      meta: [
        { title: title.slice(0, 70) },
        { name: "description", content: description },
        { property: "og:title", content: title.slice(0, 70) },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "article:published_time", content: reviewIso(review.review_date) },
        { property: "article:modified_time", content: reviewIso(review.review_date) },
        { name: "date", content: review.review_date },
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: BenediktReviewDetail,
  notFoundComponent: () => (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="font-display text-2xl">Review not found</h1>
      <p className="mt-3 text-muted-foreground">This review page does not exist.</p>
      <Link to="/Benedikt-Herrmann" className="mt-6 inline-block text-primary underline">
        Back to Benedikt Herrmann's reviews
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

function BenediktReviewDetail() {
  const { review } = Route.useLoaderData();

  const image = absoluteImage(review.image_url);

  const jsonLd = buildReviewJsonLd({
    headline: review.headline, body: review.body, reviewDate: review.review_date,
    rating: review.rating, canonicalUrl: `${SITE}/Benedikt-Herrmann/${review.slug}`,
    authorName: PROFILE.name, authorUrl: PROFILE.path, authorImage: PROFILE.avatar,
    authorPhotoDate: PROFILE.photoDate, subject: review.subject, image,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ReviewDetailView review={review} profile={PROFILE} image={image} />
    </>
  );
}
