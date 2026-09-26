import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import {
  publicProfileByHandle,
  type PublicProfile,
  type PublicReview,
} from "@/lib/user-dashboard.functions";

export const Route = createFileRoute("/u/$handle/")({
  loader: async ({ params }) => {
    const r = await publicProfileByHandle({ data: { handle: params.handle } });
    if (!r.profile) throw notFound();
    return r as { profile: PublicProfile; reviews: PublicReview[] };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Reviewer not found" }, { name: "robots", content: "noindex" }] };
    }
    const p = loaderData.profile;
    const title = `${p.display_name} — Reviews on People Opinion Box`;
    const desc = p.bio ?? `Reviews written by ${p.display_name} on People Opinion Box.`;
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
  component: ProfilePage,
});

function ProfilePage() {
  const { profile: p, reviews: list } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex items-center gap-4">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <div className="grid size-16 place-items-center rounded-full bg-muted text-lg font-bold">
            {p.display_name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-display text-3xl">{p.display_name}</h1>
          <p className="text-xs text-muted-foreground">
            @{p.handle} · Member since {new Date(p.created_at).getFullYear()}
          </p>
        </div>
      </div>
      {p.bio ? <p className="mt-4 text-muted-foreground">{p.bio}</p> : null}

      <div className="mt-8 space-y-3">
        <h2 className="font-display text-xl">Reviews</h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          list.map((r) => (
            <Link
              key={r.id}
              to="/u/$handle/$slug"
              params={{ handle: p.handle, slug: r.slug }}
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
