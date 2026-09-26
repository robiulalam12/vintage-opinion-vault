import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import {
  publicReviewerBySlug,
  type PublicReviewerProfile,
  type PublicReviewerReview,
} from "@/lib/user-reviewer-profiles.functions";

export const Route = createFileRoute("/$profileSlug/")({
  loader: async ({ params }) => {
    const r = await publicReviewerBySlug({ data: { slug: params.profileSlug } });
    if (!r.profile) throw notFound();
    return r as { profile: PublicReviewerProfile; reviews: PublicReviewerReview[] };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Reviewer not found" }] };
    const p = loaderData.profile;
    const title = `${p.name} — Reviews on People Opinion Box`;
    const desc = p.bio ?? `${p.name}'s reviews on People Opinion Box.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ReviewerPublicPage,
});

function ReviewerPublicPage() {
  const { profile: p, reviews } = Route.useLoaderData();
  const memberYear = new Date(p.created_at).getFullYear();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex items-center gap-4">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="size-20 rounded-full object-cover" />
        ) : (
          <div className="grid size-20 place-items-center rounded-full bg-muted text-2xl font-bold">
            {p.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-display text-3xl">{p.name}</h1>
          <p className="text-xs text-muted-foreground">
            Age {p.age} · Member since {memberYear}
          </p>
        </div>
      </div>
      {p.bio ? <p className="mt-4 text-muted-foreground">{p.bio}</p> : null}

      <div className="mt-8 space-y-3">
        <h2 className="font-display text-xl">Reviews</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          reviews.map((r) => (
            <Link
              key={r.id}
              to="/$profileSlug/$reviewSlug"
              params={{ profileSlug: p.slug, reviewSlug: r.slug }}
              className="block rounded-xl border border-border p-4 transition hover:border-foreground/40"
            >
              <p className="font-medium">{r.headline}</p>
              <p className="text-xs text-muted-foreground">
                {r.rating}★ · {r.review_date}
                {r.subject ? ` · ${r.subject}` : ""}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
