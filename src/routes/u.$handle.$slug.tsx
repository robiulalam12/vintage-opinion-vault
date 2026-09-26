import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import {
  publicReviewByHandleSlug,
  type PublicProfile,
  type PublicReview,
} from "@/lib/user-dashboard.functions";

export const Route = createFileRoute("/u/$handle/$slug")({
  loader: async ({ params }) => {
    const r = await publicReviewByHandleSlug({
      data: { handle: params.handle, slug: params.slug },
    });
    if (!r.profile || !r.review) throw notFound();
    return r as { profile: PublicProfile; review: PublicReview };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Review not found" }, { name: "robots", content: "noindex" }] };
    }
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
  component: ReviewPage,
});

function ReviewPage() {
  const { profile: p, review: r } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link
        to="/u/$handle"
        params={{ handle: p.handle }}
        className="text-xs text-muted-foreground hover:underline"
      >
        ← {p.display_name}
      </Link>
      <h1 className="mt-3 font-display text-3xl">{r.headline}</h1>
      {r.subject ? <p className="mt-1 text-sm text-muted-foreground">Review of {r.subject}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {r.rating}★ · Published {r.review_date}
      </p>
      {r.image_url ? (
        <img src={r.image_url} alt="" className="mt-4 w-full rounded-xl object-cover" />
      ) : null}
      <div className="prose mt-6 max-w-none whitespace-pre-wrap text-foreground">{r.body}</div>
    </div>
  );
}
