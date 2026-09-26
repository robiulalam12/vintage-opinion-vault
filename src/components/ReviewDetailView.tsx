import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { StarRating } from "@/components/StarRating";
import { formatReviewDate } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { reviewIso } from "@/lib/review-schema";
import type { ReviewerProfile } from "@/lib/reviewer-profiles";
import { MobileFooterNav } from "@/components/MobileFooterNav";

function profileAge(memberSince: string): number {
  const year = parseInt(memberSince, 10);
  if (!Number.isFinite(year)) return 0;
  return Math.max(0, new Date().getUTCFullYear() - year);
}

type ReviewLike = {
  slug: string | null;
  headline: string;
  body: string;
  rating: number;
  review_date: string;
  subject?: string | null;
  image_url?: string | null;
};

export function ReviewDetailView({
  review,
  profile,
  image,
}: {
  review: ReviewLike;
  profile: ReviewerProfile;
  image: string | null;
}) {
  const iso = reviewIso(review.review_date);
  const [shared, setShared] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  async function shareReview() {
    const shareData = { title: review.headline, text: review.headline, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        setShared(true);
        window.setTimeout(() => setShared(false), 1800);
      }
    } catch {
      // Closing the native share sheet is an intentional no-op.
    }
  }

  return (
    <div className="relative min-h-dvh bg-review-canvas pb-20 font-review-body text-review-ink lg:pb-0">
      <MobileFooterNav />
      <header className="sticky top-0 z-30 border-b border-border/80 bg-review-surface/90 backdrop-blur-xl">
        <div className="mx-auto grid h-16 max-w-5xl grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-4 sm:h-[4.5rem] sm:px-6">
          <Button asChild variant="outline" size="icon" className="size-11 rounded-full bg-review-canvas shadow-none" aria-label={`Back to ${profile.name}'s reviews`}>
            <Link to={profile.path}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </Link>
          </Button>
          <div className="min-w-0 text-center">
            <p className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:hidden">People Opinion Box</p>
            <p className="truncate text-sm font-semibold text-review-ink sm:text-base">Review details</p>
          </div>
          <Button variant="outline" size="icon" className="size-11 rounded-full bg-review-canvas shadow-none" onClick={shareReview} aria-label="Share this review">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v14" /></svg>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-10">
        <article
          itemScope
          itemType="https://schema.org/Review"
          className="overflow-hidden rounded-[1.5rem] border border-border bg-review-surface shadow-card sm:rounded-[2rem] lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]"
        >
          <aside className="border-b border-border bg-review-canvas/70 px-5 py-5 sm:px-7 sm:py-7 lg:sticky lg:top-[4.5rem] lg:self-start lg:border-r lg:border-b-0">
            <div
              className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 lg:flex lg:flex-col lg:text-center"
              itemProp="author"
              itemScope
              itemType="https://schema.org/Person"
            >
              <div className="relative shrink-0">
                {profile.avatar ? (
                  <img src={profile.avatar} alt={profile.name} width={816} height={816} loading="lazy" className="size-14 rounded-2xl border-2 border-review-surface object-cover shadow-sm lg:size-24 lg:rounded-full" itemProp="image" />
                ) : (
                  <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-primary font-review-display text-3xl text-primary-foreground shadow-sm lg:size-24 lg:rounded-full lg:text-5xl">{profile.name.charAt(0)}</span>
                )}
                <span
                  aria-label="Verified reviewer"
                  className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-review-surface bg-primary text-[0.6rem] font-bold text-primary-foreground lg:bottom-0 lg:right-0 lg:size-6"
                >
                  ✓
                </span>
              </div>
              <div className="min-w-0 lg:mt-4">
                <h2 className="truncate font-review-display text-[1.35rem] leading-none text-review-ink lg:text-2xl"><span itemProp="name">{profile.name}</span></h2>
                <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{profile.role}</p>
                <p className="mt-0.5 truncate text-[0.68rem] font-medium text-muted-foreground">Member since {profile.memberSince} · {profileAge(profile.memberSince)} yrs</p>
              </div>
              <div className="text-right lg:mt-5 lg:text-center">
                <StarRating rating={review.rating} />
              </div>

              <dl className="hidden w-full space-y-2 border-t border-border pt-5 text-left text-sm text-muted-foreground lg:mt-5 lg:block">
                <div className="flex items-center justify-between gap-3">
                  <dt>Published</dt>
                  <dd className="font-medium text-foreground">
                    <time dateTime={iso} itemProp="datePublished">
                      {formatReviewDate(review.review_date)}
                    </time>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Member since</dt>
                  <dd className="font-medium text-foreground">{profile.memberSince} · {profileAge(profile.memberSince)} yrs</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Profile photo</dt>
                  <dd className="font-medium text-foreground">
                    <time dateTime={profile.photoDate}>{formatReviewDate(profile.photoDate)}</time>
                  </dd>
                </div>
              </dl>

              <Link
                to={profile.path}
                className="col-span-3 mt-1 flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-review-surface px-4 py-2 text-sm font-semibold text-review-ink transition-colors hover:bg-accent lg:mt-5"
              >
                View all reviews
              </Link>
            </div>
          </aside>

          <div className="px-5 py-6 sm:px-10 sm:py-10">
            <div className="hidden items-center justify-between gap-3 lg:flex">
              <StarRating rating={review.rating} />
              <span
                className="rounded-lg bg-review-canvas px-3 py-1 text-xs font-medium text-muted-foreground"
                itemProp="reviewRating"
                itemScope
                itemType="https://schema.org/Rating"
              >
                <meta itemProp="worstRating" content="1" />
                <span itemProp="ratingValue">{review.rating}</span>.0 /{" "}
                <span itemProp="bestRating">5</span>
              </span>
            </div>

            <h1
              className="font-review-headline text-[1.375rem] font-bold leading-[1.1] tracking-tight text-review-ink sm:text-[2.6rem] lg:mt-6"
              itemProp="name"
            >
              {review.headline}
            </h1>

            {review.subject ? (
              <p
                className="mt-3 text-sm font-medium text-muted-foreground"
                itemProp="itemReviewed"
                itemScope
                itemType="https://schema.org/LocalBusiness"
              >
                Review of{" "}
                <span className="font-medium text-foreground" itemProp="name">
                  {review.subject}
                </span>
              </p>
            ) : null}

            <p className="mt-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 shrink-0" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /></svg>
              <span>Published </span>
              <time dateTime={iso} itemProp="datePublished" className="font-semibold text-foreground">{formatReviewDate(review.review_date)}</time>
            </p>

            <meta itemProp="dateCreated" content={iso} />
            <meta itemProp="dateModified" content={iso} />

            {image && !imageFailed ? (
              <figure
                className="-mx-5 mt-6 sm:mx-0"
                itemProp="image"
                itemScope
                itemType="https://schema.org/ImageObject"
              >
                <meta itemProp="url" content={image} />
                <meta itemProp="contentUrl" content={image} />
                <meta itemProp="uploadDate" content={iso} />
                <meta itemProp="caption" content={review.headline} />
                <img
                  src={review.image_url ?? image}
                  alt={review.headline}
                  loading="lazy"
                  onError={() => setImageFailed(true)}
                  className="max-h-[32rem] w-full object-cover sm:rounded-2xl"
                />
                <figcaption className="mt-2 px-5 text-xs text-muted-foreground sm:px-0">
                  Photo added with this review · {formatReviewDate(review.review_date)}
                </figcaption>
              </figure>
            ) : null}

            <div
              className="mt-7 space-y-5 text-[1.0625rem] leading-[1.72] text-review-ink/90 sm:text-[1.1rem]"
              itemProp="reviewBody"
            >
              {review.body.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </article>
        <p aria-live="polite" className="mt-3 min-h-5 text-center text-xs font-medium text-muted-foreground">{shared ? "Review link copied" : ""}</p>
      </main>
    </div>
  );
}
