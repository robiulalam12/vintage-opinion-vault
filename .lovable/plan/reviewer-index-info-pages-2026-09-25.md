# Reviewer index-info pages

## Build
- Add a shared index-info table styled like the supplied reference: URL, content type, first published date, latest update date, captures, duplicates, and unique count.
- Create public pages at `/robiul-alam/index-info`, `/Jonas-Weber/index-info`, `/Benedikt-Herrmann/index-info`, `/afridi/index-info`, and `/Jordan/reviews/index-info`.
- Populate every page directly from that reviewer's published reviews, so newly published or edited reviews appear automatically.
- Link each URL to its individual review page and provide a URL filter that works well on phones and desktops.
- Add unique page titles, descriptions, social metadata, canonical links, and include these index pages in the sitemap.

## Technical details
- Use one reusable index component so all reviewer pages remain visually and functionally consistent.
- Treat each published review as one unique HTML page; use its publish date for both initial and latest dates because the current public review data does not expose an edit date.
- Keep exact existing reviewer URL capitalization and routing conventions.
- Verify all five routes, the mobile table layout, filtering, and current build health.
