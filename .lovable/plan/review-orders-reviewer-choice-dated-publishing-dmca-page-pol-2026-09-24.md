# Review orders: reviewer choice, dated publishing, DMCA page polish

## Scope agreed

- Order creation gets a reviewer selector (Robiul Alam or Jonas Weber).
- Published reviews are backdated to a random date 3–6 months before the date of the Google review they came from.
- The DMCA page gets functionality and layout improvements.
- The notice wording itself stays exactly as it is today — you can edit that text yourself.

## 1. Pick the reviewer when creating an order

The "New tracking order" dialog gains a "Reviewer profile" dropdown at the top, with Robiul Alam and Jonas Weber, defaulting to Robiul Alam. The choice is saved on the order and shown on the order list and order detail header, so it is obvious later which profile a batch publishes to.

Existing orders keep working and default to Robiul Alam.

## 2. Publishing goes to the chosen profile, backdated

Today, pressing Publish on a fetched review creates a review under the "Jordan" profile with a date 12–15 years back. After this change:

- The review is published on the order's chosen profile — `/robiul-alam/<slug>` or `/Jonas-Weber/<slug>` — with its own unique slug generated from the headline.
- The publish date is a random date between 3 and 6 months before the date of the original Google review. If a Google date was never captured for that link, the date falls back to 3–6 months before today and the row is flagged in the table so you can spot it.
- The date you see in the dashboard, on the public page, and in the page's structured data are all the same date.
- The order detail table shows the profile and the final public link for each published row.

## 3. DMCA page improvements

- The reporting-progress and batch tables get a clearer layout: order name, chosen reviewer, counts (published / reported / reserved / remaining) as readable status pills instead of plain numbers, and consistent column widths.
- Each published row links straight to its live review page, and to the Google review it came from, so both can be opened while filing.
- A copy button on the original-publication link and publication date of each row.
- Batch rows show relative time ("2 days ago") alongside the exact timestamp, and empty states explain what to do next instead of showing a blank table.
- Refresh, release and mark-submitted buttons get loading states so double clicks are impossible.

The text of the notice itself is not changed.

## Technical notes

- Migration: add nullable `reviewer_key text default 'robiul'` to `review_orders`, and a nullable `published_profile_review_id uuid` + `published_profile` column on `review_sources` so published profile reviews can be tracked alongside the existing `reviews` link (no existing column is dropped or retyped).
- `createReviewOrder` in `src/lib/reviews.functions.ts` accepts and stores `reviewerKey`; `NewOrderDialog` passes it.
- `publishSource` inserts into `robiul_reviews` with the order's `reviewer_key`, a slug derived from the headline (uniqueified on collision, same helper used by `saveRobiulReview`), and the computed date. New helper in `review-publish.server.ts`: `backdatedFromSourceDate(sourceDate)` returning a random date 90–180 days before the given date.
- Source date comes from `review_sources.review_published_at`; fallback to today when null.
- `syncOrderDmca` and `listDmcaProgress` read the profile review's date and slug so `dmca_publication_date` and `dmca_original_link` point at the live profile URL.
- DMCA page changes are limited to `src/routes/admin.dmca.tsx` presentation plus the extra fields returned by `listDmcaProgress`.

## Verification

Create a test order for each reviewer, fetch one link, publish it, and confirm in the live pages and database that the profile, slug, and 3–6 month backdated date match everywhere, then confirm the DMCA page shows the row with the correct link and date.
