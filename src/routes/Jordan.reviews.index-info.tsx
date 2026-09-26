import { createFileRoute } from "@tanstack/react-router";

import { ReviewerIndexInfo } from "@/components/ReviewerIndexInfo";
import { listPublicReviews, type PublicReview } from "@/lib/reviews.functions";

const TITLE = "Jordan Review Index — People Opinion Box";
const DESCRIPTION = "A live index of Jordan's published review URLs and publication dates.";
const URL = "https://peopleopinionbox.com/Jordan/reviews/index-info";

export const Route = createFileRoute("/Jordan/reviews/index-info")({
  loader: async () => {
    try {
      const reviews = await listPublicReviews();
      return { reviews: reviews.filter((review) => review.slug && review.reviewer_name.trim().toLowerCase() === "jordan") };
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: Page,
});

function Page() {
  const { reviews } = Route.useLoaderData();
  const indexedReviews = reviews.flatMap((review) =>
    review.slug ? [{ ...review, slug: review.slug }] : [],
  );
  return <ReviewerIndexInfo reviewerName="Jordan" profilePath="/Jordan/reviews" reviewRoute="/Jordan/reviews/$slug" reviews={indexedReviews} />;
}