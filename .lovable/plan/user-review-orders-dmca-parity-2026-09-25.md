# User Review Orders ↔ DMCA parity

Bring the user dashboard's **Review Orders** page to the same level as the admin one, with the DMCA copy generation wired in — so each user can run the whole flow (paste links → fetch text → publish on their own reviewer profile → generate DMCA notice per review → track it) inside their own private data.

## What the user gets

- `/app/orders` list matching admin design: KPI progress bar, "New order" dialog, order cards, delete.
- New order dialog: pick one of the user's own reviewer profiles, pick a DMCA notice template (own or default), name/note, paste review links or upload CSV.
- `/app/orders/$orderId` detail page matching admin layout:
  - Progress + counts (fetched / published / failed).
  - Per-source cards with: fetch status, review text, reviewer name, rating, Google publish date, retry Google date, edit draft, publish to the user's own reviewer profile (dated 3–6 months before Google date), take screenshot, delete.
  - DMCA notice per source with template rendering, Drive link / our-URL toggle, copy notice, mark submitted, case ref.
  - DMCA automation settings: URL mode (our review link / Drive link), min/max delay between reports, "sync now".
  - Bulk actions: fetch text batch, take screenshots batch, delete failed.
- All private per user; extension download stays hidden.

## Technical

- New tables (per-user, mirror admin shapes):
  - `user_review_sources` — same columns as `review_sources` (url, label, review_text, reviewer_name, rating, review_published_at, review_age_label, dmca_publication_date, dmca_original_link, drive_url, drive_file_id, screenshot_status, published_profile_review_id, published_path, status, error, …), plus `owner_id uuid` and `order_id -> user_review_orders`.
  - Extend `user_review_orders` with `reviewer_profile_id` (exists), `dmca_template_id uuid`, `dmca_url_mode text` ('review'|'drive'), `dmca_delay_min_seconds int`, `dmca_delay_max_seconds int`, `dmca_next_allowed_at timestamptz`.
- RLS: owner-only, admin bypass via `has_role`. GRANT to authenticated/service_role.
- New file `src/lib/user-review-orders.functions.ts` — mirrors the subset of `reviews.functions.ts` needed: `listMyReviewOrders`, `getMyReviewOrder`, `createMyReviewOrder`, `deleteMyReviewOrder`, `addMyReviewSources`, `deleteMyReviewSource`, `resetMyReviewSource`, `deleteMyFailedSources`, `fetchMySourceBatch` (reuses server-only `fetchPageText`/`extractReviews` helpers), `refetchMyGoogleDate`, `updateMySourceDraft`, `publishMySource` (writes to `user_reviews` under the chosen `user_reviewer_profiles` row), `screenshotMySource`, `syncMyOrderDmca` (renders per-source notice text, respects url mode + delay window, writes into a new per-user `user_dmca_reports` row).
- New file `src/lib/user-dmca-templates.functions.ts` add-on: `setMyOrderTemplate`, `setMyOrderDmcaSettings`.
- New file `src/components/user/UserNewOrderDialog.tsx` — copy of admin `NewOrderDialog.tsx` but calls user fns and lists reviewer profiles + user-visible templates (own + admin defaults).
- Rewrite `src/routes/app.orders.tsx` as the list (mirroring `admin.orders.index.tsx`).
- New `src/routes/app.orders.$orderId.tsx` — detail page, structural copy of `admin.orders.$orderId.tsx`, calling user fns; shared UI primitives reused.
- `app.dmca.tsx` unchanged; still logs manual reports. Sync-generated notices land as `user_dmca_reports` rows so both pages show them.

## Out of scope for this turn

- No extension downloads for users.
- No automated Google submission — the same "copy and submit yourself" flow admin uses.
- No changes to the admin pages.
