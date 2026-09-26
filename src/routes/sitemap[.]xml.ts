import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { listPublicReviews } from "@/lib/reviews.functions";
import { listRobiulReviews, listJonasReviews, listBenediktReviews } from "@/lib/robiul.functions";
import { listAfridiReviews } from "@/lib/afridi.functions";

const BASE_URL = "https://peopleopinionbox.com";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const [reviews, robiul, afridi, jonas, benedikt] = await Promise.all([
          listPublicReviews(),
          listRobiulReviews().catch(() => []),
          listAfridiReviews().catch(() => []),
          listJonasReviews().catch(() => []),
          listBenediktReviews().catch(() => []),
        ]);

        const entries: string[] = [
          `  <url>\n    <loc>${BASE_URL}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/Jordan/reviews</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/robiul-alam</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/Jonas-Weber</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/Benedikt-Herrmann</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/afridi</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/robiul-alam/index-info</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/Jonas-Weber/index-info</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/Benedikt-Herrmann/index-info</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/afridi/index-info</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
          `  <url>\n    <loc>${BASE_URL}/Jordan/reviews/index-info</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
        ];

        for (const review of reviews) {
          if (!review.slug) continue;
          entries.push(
            `  <url>\n    <loc>${BASE_URL}/Jordan/reviews/${escapeXml(review.slug)}</loc>\n    <lastmod>${review.review_date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
          );
        }

        for (const review of robiul) {
          entries.push(
            `  <url>\n    <loc>${BASE_URL}/robiul-alam/${escapeXml(review.slug)}</loc>\n    <lastmod>${review.review_date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
          );
        }

        for (const review of afridi) {
          entries.push(
            `  <url>\n    <loc>${BASE_URL}/afridi/${escapeXml(review.slug)}</loc>\n    <lastmod>${review.review_date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
          );
        }

        for (const review of jonas) {
          entries.push(
            `  <url>\n    <loc>${BASE_URL}/Jonas-Weber/${escapeXml(review.slug)}</loc>\n    <lastmod>${review.review_date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
          );
        }

        for (const review of benedikt) {
          entries.push(
            `  <url>\n    <loc>${BASE_URL}/Benedikt-Herrmann/${escapeXml(review.slug)}</loc>\n    <lastmod>${review.review_date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
          );
        }

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...entries,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
