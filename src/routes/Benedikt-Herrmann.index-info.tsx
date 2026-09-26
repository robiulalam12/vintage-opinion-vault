import { createFileRoute } from "@tanstack/react-router";

import { ReviewerIndexInfo } from "@/components/ReviewerIndexInfo";
import { listBenediktReviews, type RobiulReview } from "@/lib/robiul.functions";

const TITLE = "Benedikt Herrmann Review Index — People Opinion Box";
const DESCRIPTION = "A live index of Benedikt Herrmann's published review URLs and publication dates.";
const URL = "https://peopleopinionbox.com/Benedikt-Herrmann/index-info";

export const Route = createFileRoute("/Benedikt-Herrmann/index-info")({
  loader: async () => {
    try {
      return { reviews: await listBenediktReviews() };
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
  return <ReviewerIndexInfo reviewerName="Benedikt Herrmann" profilePath="/Benedikt-Herrmann" reviewRoute="/Benedikt-Herrmann/$slug" reviews={reviews} />;
}