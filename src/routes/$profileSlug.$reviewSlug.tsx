import { createFileRoute, notFound } from "@tanstack/react-router";

import { ReviewDetailView } from "@/components/ReviewDetailView";
import {
  publicReviewerReview,
  type PublicReviewerProfile,
  type PublicReviewerReview,
} from "@/lib/user-reviewer-profiles.functions";

export const Route = createFileRoute("/$profileSlug/$reviewSlug")({
  loader: async ({ params }) => {
    const r = await publicReviewerReview({
      data: { profileSlug: params.profileSlug, reviewSlug: params.reviewSlug },
    });
    if (!r.profile || !r.review) throw notFound();
    return r as { profile: PublicReviewerProfile; review: PublicReviewerReview };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Review not found" }] };
    const r = loaderData.review;
    const desc = r.body.slice(0, 160);
    const meta: Array<Record<string, string>> = [
      { title: `${r.headline} — People Opinion Box` },
      { name: "description", content: desc },
      { property: "og:title", content: r.headline },
      { property: "og:description", content: desc },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (r.image_url && /^https:\/\//.test(r.image_url)) {
      meta.push({ property: "og:image", content: r.image_url });
      meta.push({ name: "twitter:image", content: r.image_url });
    }
    return { meta };
  },
  component: ReviewerReviewPage,
});

function ReviewerReviewPage() {
  const { profile, review } = Route.useLoaderData();

  const profileForView = {
    key: profile.slug,
    name: profile.name,
    role: "Independent reviewer",
    location: null,
    memberSince: String(new Date(profile.created_at).getFullYear()),
    photoDate: profile.created_at.slice(0, 10),
    avatar: profile.avatar_url ?? undefined,
    verified: false,
  };

  return (
    <ReviewDetailView
      review={{
        slug: review.slug,
        headline: review.headline,
        body: review.body,
        subject: review.subject,
        rating: review.rating,
        review_date: review.review_date,
      }}
      profile={profileForView as never}
      image={review.image_url}
    />
  );
}
