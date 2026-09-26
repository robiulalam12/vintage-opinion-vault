# Review Import → Publish Pipeline with Permanent Slugs

Turn the import page into a proper working table: one row per review URL, with the fetched review text sitting right next to it, and a one-click publish that pushes each review live under `/Jordan/reviews/rh01`, `/Jordan/reviews/rh02`, … each with its own page.

## How it will work

1. **Create new import (batch)**
   Admin pastes review URLs in bulk or uploads a CSV. Each URL becomes a row in a table with columns: URL, status, review text, rating, actions.

2. **Fetch review text**
   One "Fetch review text" button processes pending rows in parallel batches (5 at a time), with live progress. The extracted full review text is saved next to its URL and shown inline (expandable, editable).

3. **Publish**
   Each row gets a "Publish" button, plus "Publish all". On publish, the system creates a live review with:
   - Reviewer name: always **Jordan**
   - Business name: an auto-generated dummy local business name
   - Review text: exactly the fetched text (editable before publishing)
   - Rating: from the fetch, editable
   - Date: random, between 12 and 15 years before today
   - Slug: next free `rh##` code, permanently reserved

4. **Slugs never repeat**
   Slug codes are allocated from a database counter inside the publish transaction, so a code is burned the moment it is used — even if the review is later deleted, that slug is never handed out again.

5. **Public pages**
   - `/Jordan/reviews` lists every published Jordan review, each linking to its own page.
   - `/Jordan/reviews/rh01` is a full standalone page: full review text, Jordan's name, star rating, the backdated date, business name, plus Review schema markup so crawlers read everything without JS.

## UI/UX

- Import page rebuilt as a dense SaaS-style data table: sticky header, status pills (Pending / Fetching / Fetched / Failed / Published), inline text preview with expand, per-row retry, and a bulk action bar showing counts.
- Toolbar summary: total links, fetched, published, failed.
- Publish confirmation shows the assigned slug and generated date so the admin sees exactly what goes live.
- Published rows link straight to their public page.

## Technical notes

- Migration:
  - `reviews`: add `slug text unique`, `business_name` is stored in existing `subject`.
  - `review_sources`: add `review_text text`, `rating smallint`, `reviewer_name text`, `published_review_id uuid`.
  - New `review_slug_counter` table (single row) + `security definer` function `next_review_slug()` returning `rh01`, `rh02`, … with zero-padding and monotonic increment; grants for `authenticated`/`service_role`, admin-only RLS.
- Server functions in `src/lib/reviews.functions.ts`:
  - `fetchSourceBatch` updated to persist the extracted text/rating on the source row instead of inserting reviews directly.
  - `updateSourceDraft` (edit text/rating before publish).
  - `publishSource` — admin-guarded: calls `next_review_slug()`, generates dummy business name + random date 12–15 years back, inserts a published review, links it back to the source.
- Routes:
  - `src/routes/Jordan.reviews.index.tsx` (list, moved from current file), `src/routes/Jordan.reviews.$slug.tsx` (detail page with JSON-LD + canonical), `src/routes/Jordan.reviews.tsx` becomes the layout rendering `<Outlet />`.
  - Public slug fetch via a public (anon-readable) server function so the detail page is fully SSR-crawlable.
  - Sitemap updated to include each slug URL.
