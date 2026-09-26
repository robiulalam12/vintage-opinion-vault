import { createFileRoute } from "@tanstack/react-router";

import { ReviewerIndexInfo } from "@/components/ReviewerIndexInfo";
import { listAfridiReviews, type AfridiReview } from "@/lib/afridi.functions";

const TITLE = "Afridi Review Index — People Opinion Box";
const DESCRIPTION = "A live index of Afridi's published review URLs and publication dates.";
const URL = "https://peopleopinionbox.com/afridi/index-info";

export const Route = createFileRoute("/afridi/index-info")({
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: Page,
});

function Page() {
  const { reviews } = Route.useLoaderData();
  return <ReviewerIndexInfo reviewerName="Afridi" profilePath="/afridi" reviewRoute="/afridi/$slug" reviews={reviews} />;
}