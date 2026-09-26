interface StarRatingProps {
  rating: number;
  label?: string;
}

export function StarRating({ rating, label }: StarRatingProps) {
  const rounded = Math.round(rating);
  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle"
      aria-label={label ?? `${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          viewBox="0 0 24 24"
          className={
            star <= rounded ? "size-4 fill-star" : "size-4 fill-border"
          }
          aria-hidden="true"
        >
          <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6-5.9-3.2-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}
