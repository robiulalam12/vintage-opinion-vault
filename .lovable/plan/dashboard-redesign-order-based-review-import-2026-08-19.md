# Dashboard Redesign + Order-Based Review Import

Rebuild the admin dashboard in the style of the shared screenshots, restructure importing around named "orders", and switch review-text fetching to the free Google endpoint recipe.

## 1. Dashboard shell redesign

- Dark sidebar (deep ink panel, single accent for the active pill) with a collapse toggle that shrinks to an icon rail, matching the reference.
- Sidebar bottom block: admin avatar, email, and Sign out — separated by a hairline.
- Nav: Dashboard, Review Orders, Write Review, Public Site.
- Top bar becomes a slim page-title bar (current page name only), not a second branded header.
- Cards, tables and buttons get the reference's look: white cards, soft borders, outline pill buttons with icons, rounded 12–14px.

## 2. Review Orders (new import flow)

**Orders list page** (`/admin/orders`)
- "New order" button opens a dialog: Order name (required), optional note, Review URLs textarea, Upload CSV button, live "N valid review URLs detected" counter, Create order.
- Each order shows as a card: name, created date, progress bar ("0 of 396 fetched"), and Open / Delete.

**Order detail page** (`/admin/orders/$id`)
- Header card: order name, created date, progress bar with %, and an action row: Fetch review text, Refresh all text, Publish all, Download CSV, Delete order.
- One card per URL, numbered, with the link, open-in-new and delete icons, and beneath it the fetched review in a light panel: reviewer name · age label (real date), star rating, full review text (editable), plus a Publish button showing the slug it will take.
- Fetching runs in the background with live progress; failures show a per-row error message and a Retry, never blocking the rest.

## 3. Free review-text fetching (replaces the paid/scraper path)

Implement the supplied Google Maps place-card RPC recipe exactly: resolve short link → extract review id + feature id from the canonical URL → call the `pc` RPC with the fixed `pb` payload and consent headers → slice the review's own block and regex out text, reviewer name, rating, exact timestamp and age label. Concurrency 3, per-item try/catch, always fail soft.

The existing Firecrawl/AI scraper stays as a fallback only for links the RPC can't handle (place links without a review id), so nothing you can fetch today stops working.

## 4. Publishing (unchanged behaviour)

Publish still assigns the next permanent `rh##` slug, a dummy local business name, and a random date 12–15 years back, and pushes the review live under `/Jordan/reviews/rh##`.

## Technical notes

- Migration: new `review_orders` table (id, name, note, created_by, created_at) with admin-only RLS + grants; `review_sources` gains `order_id`, `reviewer_name`, `review_published_at`, `review_age_label`, `text_checked_at`, `text_error`.
- New `src/lib/review-age.server.ts` holding the RPC pipeline (UA/consent headers, `REVIEW_ID_RE`, `FEATURE_ID_RE`, `TEXT_RE`, `NAME_RE`, `RATING_RE`, microsecond date regex, 8s abort, concurrency 3).
- New thin `src/lib/review-text.functions.ts` exporting `getReviewTexts` (Zod: 1–25 urls) — imports + exported fn only.
- Order/source CRUD and batch fetch-and-persist server fns added to `src/lib/reviews.functions.ts`; `fetchSourceBatch` routes through the RPC first, scraper second.
- Routes: `src/routes/admin.orders.index.tsx`, `src/routes/admin.orders.$orderId.tsx`; `admin.import.tsx` removed (redirects to orders). Sidebar shell rewritten in `src/routes/admin.tsx`; new `AdminShell`/`OrderCard`/`SourceCard` components.
- Known limits carried into the UI copy: single-review links only, Google truncates long reviews at "… More", reviewer country unavailable.
