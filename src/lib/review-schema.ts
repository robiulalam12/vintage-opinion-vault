export const SITE_URL = "https://peopleopinionbox.com";

/** Turn a stored image path into an absolute URL crawlers can fetch. */
export function absoluteImage(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${SITE_URL}${url}`;
}

/** The chosen review date, expressed as a full ISO timestamp for schema/meta tags. */
export function reviewIso(date: string) {
  return `${date}T09:00:00+00:00`;
}

type ReviewSchemaInput = {
  headline: string;
  body: string;
  reviewDate: string;
  rating: number;
  canonicalUrl: string;
  authorName: string;
  authorUrl: string;
  authorImage: string | null | undefined;
  authorPhotoDate?: string;
  subject?: string | null;
  image?: string | null;
};

/** Build consistent structured data for every individual public review page. */
export function buildReviewJsonLd(input: ReviewSchemaInput) {
  const publishedAt = reviewIso(input.reviewDate);
  const authorImage = absoluteImage(input.authorImage);

  return {
    "@context": "https://schema.org",
    "@type": "Review",
    "@id": `${input.canonicalUrl}#review`,
    name: input.headline,
    reviewBody: input.body,
    datePublished: publishedAt,
    dateCreated: publishedAt,
    dateModified: publishedAt,
    url: input.canonicalUrl,
    mainEntityOfPage: input.canonicalUrl,
    author: {
      "@type": "Person",
      name: input.authorName,
      url: `${SITE_URL}${input.authorUrl}`,
      ...(authorImage
        ? {
            image: {
              "@type": "ImageObject",
              url: authorImage,
              contentUrl: authorImage,
              ...(input.authorPhotoDate
                ? {
                    uploadDate: reviewIso(input.authorPhotoDate),
                    datePublished: reviewIso(input.authorPhotoDate),
                  }
                : {}),
            },
          }
        : {}),
    },
    ...(input.image
      ? {
          image: {
            "@type": "ImageObject",
            url: input.image,
            contentUrl: input.image,
            caption: input.headline,
            uploadDate: publishedAt,
            datePublished: publishedAt,
          },
        }
      : {}),
    ...(input.subject
      ? { itemReviewed: { "@type": "LocalBusiness", name: input.subject } }
      : {}),
    reviewRating: {
      "@type": "Rating",
      ratingValue: input.rating,
      bestRating: 5,
      worstRating: 1,
    },
  };
}
