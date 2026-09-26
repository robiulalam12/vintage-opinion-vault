import { Link } from "@tanstack/react-router";

import { StarRating } from "./StarRating";
import type { PublicReview } from "@/lib/reviews.functions";

export function formatReviewDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <article
      className="press-panel deckle-edge flex h-full flex-col gap-5 p-6"
      itemProp="review"
      itemScope
      itemType="https://schema.org/Review"
    >
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <StarRating rating={review.rating} />
          <span
            className="text-xs font-medium text-muted-foreground"
            itemProp="reviewRating"
            itemScope
            itemType="https://schema.org/Rating"
          >
            <meta itemProp="worstRating" content="1" />
            <span itemProp="ratingValue">{review.rating}</span>.0 /{" "}
            <span itemProp="bestRating">5</span>
          </span>
        </div>
        <h3 className="text-lg leading-snug font-semibold text-foreground" itemProp="name">
          {review.slug ? (
            <Link
              to="/Jordan/reviews/$slug"
              params={{ slug: review.slug }}
              className="transition-colors hover:text-primary"
            >
              {review.headline}
            </Link>
          ) : (
            review.headline
          )}
        </h3>
      </header>

      <p className="flex-1 text-[0.9375rem] leading-relaxed text-muted-foreground" itemProp="reviewBody">
        {review.body}
      </p>

      <footer className="press-rule flex items-center gap-3 pt-4 text-sm">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
        >
          {initials(review.reviewer_name)}
        </span>
        <div className="min-w-0">
          <span
            className="block truncate font-medium text-foreground"
            itemProp="author"
            itemScope
            itemType="https://schema.org/Person"
          >
            <span itemProp="name">{review.reviewer_name}</span>
          </span>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {review.reviewer_location ? <span>{review.reviewer_location}</span> : null}
            {review.reviewer_location ? <span aria-hidden="true">·</span> : null}
            <time dateTime={review.review_date} itemProp="datePublished">
              {formatReviewDate(review.review_date)}
            </time>
          </div>
        </div>
      </footer>

      {review.subject ? (
        <span
          className="pill self-start"
          itemProp="itemReviewed"
          itemScope
          itemType="https://schema.org/Thing"
        >
          <span itemProp="name">{review.subject}</span>
        </span>
      ) : null}
    </article>
  );
}
