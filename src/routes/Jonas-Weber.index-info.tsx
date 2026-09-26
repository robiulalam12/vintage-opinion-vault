import { createFileRoute } from "@tanstack/react-router";

import { ReviewerIndexInfo } from "@/components/ReviewerIndexInfo";
import { listJonasReviews, type RobiulReview } from "@/lib/robiul.functions";

const TITLE = "Jonas Weber Review Index — People Opinion Box";
const DESCRIPTION = "A live index of Jonas Weber's published review URLs and publication dates.";
const URL = "https://peopleopinionbox.com/Jonas-Weber/index-info";

export const Route = createFileRoute("/Jonas-Weber/index-info")({
  loader: async () => {
    try {
      return { reviews: await listJonasReviews() };
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
  return <ReviewerIndexInfo reviewerName="Jonas Weber" profilePath="/Jonas-Weber" reviewRoute="/Jonas-Weber/$slug" reviews={reviews} />;
}