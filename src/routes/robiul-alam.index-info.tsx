import { createFileRoute } from "@tanstack/react-router";

import { ReviewerIndexInfo } from "@/components/ReviewerIndexInfo";
import { listRobiulReviews, type RobiulReview } from "@/lib/robiul.functions";

const TITLE = "Robiul Alam Review Index — People Opinion Box";
const DESCRIPTION = "A live index of Robiul Alam's published review URLs and publication dates.";
const URL = "https://peopleopinionbox.com/robiul-alam/index-info";

export const Route = createFileRoute("/robiul-alam/index-info")({
  loader: async () => {
    try {
      return { reviews: await listRobiulReviews() };
    } catch {
      return { reviews: [] as RobiulReview[] };
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
  return <ReviewerIndexInfo reviewerName="Robiul Alam" profilePath="/robiul-alam" reviewRoute="/robiul-alam/$slug" reviews={reviews} />;
}