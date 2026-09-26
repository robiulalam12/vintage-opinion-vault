import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { formatReviewDate } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { listAllReviews } from "@/lib/reviews.functions";

export const Route = createFileRoute("/admin/")({
  component: DashboardHome,
});

const ICONS = {
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM20 18v3H6.5",
  draft: "M4 20h4l10-10-4-4L4 16v4Z",
  star: "M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8z",
  users: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4",
  calendar: "M4 8h16M7 4v3m10-3v3M5 8h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
} as const;

function StatCard({
  label,
  value,
  hint,
  icon,
  small,
}: {
  label: string;
  value: string;
  hint: string;
  icon: keyof typeof ICONS;
  small?: boolean;
}) {
  return (
    <div className="press-panel flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <p className="small-caps-label">{label}</p>
        <p
          className={`mt-2 font-display font-bold tracking-tight text-foreground ${small ? "text-lg leading-snug" : "text-[2rem] leading-none"}`}
        >
          {value}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </div>
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground"
      >
        <svg
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <path d={ICONS[icon]} />
        </svg>
      </span>
    </div>
  );
}

function DashboardHome() {
  const fetchAll = useServerFn(listAllReviews);
  const reviewsQuery = useQuery({ queryKey: ["all-reviews"], queryFn: () => fetchAll() });

  const reviews = reviewsQuery.data ?? [];
  const loading = reviewsQuery.isLoading;
  const published = reviews.filter((r) => r.published);
  const drafts = reviews.length - published.length;
  const average = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : "—";
  const fiveStar = reviews.filter((r) => r.rating === 5).length;
  const reviewers = new Set(reviews.map((r) => r.reviewer_name.trim().toLowerCase())).size;
  const years = reviews.length
    ? new Set(reviews.map((r) => r.review_date.slice(0, 4))).size
    : 0;
  const newest = reviews.length
    ? reviews.reduce((a, b) => (a.review_date > b.review_date ? a : b))
    : null;
  const recent = reviews.slice(0, 6);

  const dash = loading ? "…" : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      <section className="overflow-hidden rounded-3xl bg-foreground px-6 py-8 text-background sm:px-10 sm:py-11">
        <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-background/60 uppercase">
          People Opinion Box
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.1] font-bold tracking-tight sm:text-[2.6rem]">
          Publish real customer reviews with full text and true dates
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-background/70 sm:text-base">
          Write a review by hand or import a whole batch from CSV. Every review keeps its exact
          date, full body text and star rating so search engines read it the same way visitors do.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg" className="rounded-full">
            <Link to="/admin/write">Write a review</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-full border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background"
          >
            <Link to="/admin/orders">Review orders →</Link>
          </Button>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Published"
          value={dash ?? String(published.length)}
          hint="Live for visitors & crawlers"
          icon="book"
        />
        <StatCard
          label="Drafts waiting"
          value={dash ?? String(drafts)}
          hint="Pending your review"
          icon="draft"
        />
        <StatCard
          label="Average rating"
          value={dash ?? average}
          hint="Across every review"
          icon="star"
        />
        <StatCard
          label="Five-star reviews"
          value={dash ?? String(fiveStar)}
          hint="Top-rated experiences"
          icon="star"
        />
        <StatCard
          label="Reviewers"
          value={dash ?? String(reviewers)}
          hint="Unique names on file"
          icon="users"
        />
        <StatCard
          label="Years covered"
          value={dash ?? String(years)}
          hint="Distinct review years"
          icon="calendar"
        />
        <StatCard
          label="Total reviews"
          value={dash ?? String(reviews.length)}
          hint="All records in the database"
          icon="book"
        />
        <StatCard
          label="Newest review date"
          value={dash ?? (newest ? formatReviewDate(newest.review_date) : "—")}
          hint="Most recent published date"
          icon="clock"
          small
        />
      </div>

      <section className="press-panel mt-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-foreground">Recent reviews</h2>
          <Link to="/admin/write" className="text-sm font-medium text-primary">
            Manage all
          </Link>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((review) => (
              <li
                key={review.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{review.headline}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {review.reviewer_name}
                    {review.subject ? ` · ${review.subject}` : ""} ·{" "}
                    <time dateTime={review.review_date}>
                      {formatReviewDate(review.review_date)}
                    </time>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="pill">{review.rating}/5</span>
                  <span
                    className={
                      review.published
                        ? "pill border-primary/25 bg-accent text-accent-foreground"
                        : "pill"
                    }
                  >
                    {review.published ? "Published" : "Draft"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
