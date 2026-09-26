# User dashboard parity + Reviewer Profiles

Bring every user dashboard page up to the same feature level as the matching admin tool, add a new "Reviewer Profiles" page, and keep each user's data fully isolated.

## New page: Reviewer Profiles (`/app/profiles`)

- Each signed-in user can create up to **100** reviewer profiles.
- Fields per profile: **Name**, **Avatar** (single upload, stored in a per-user path), **Profile age** (default random between 12–15 years old, editable).
- Each profile auto-publishes a public page at `/<slug>` (slug derived from the name, e.g. `jane-smith`). If the slug collides with an existing reviewer or route, append `-2`, `-3`… automatically.
- The public page reuses the same shared review layout the other reviewers use, and gets its own `/…/index-info` page.
- Only the owning user can pick their own profiles when posting a review or creating a review order. No cross-user access.

## Bring user pages to admin parity

Same UI/UX shell (cards, tables, filters, KPIs, action buttons) and same core actions as the admin equivalents, scoped to the signed-in user only:

- **Dashboard home** — KPIs (orders, published reviews, DMCA reports, policy items, fake-review orders), recent activity list, quick-action buttons.
- **Review Orders** — create/edit/delete orders, order detail page with review sources list, fetch review text, retry, publish to one of the user's own reviewer profiles, screenshot + Drive link, delay + link-mode controls, per-order status.
- **Post Reviews** — full editor (headline, body, rating, subject, date, image upload), publish/unpublish, edit, delete, live preview link. Reviewer profile selector limited to the user's own profiles.
- **DMCA Reports** — create report from a Google URL + our URL (or Drive link), template selection, generated notice preview, status tracking, resend.
- **Policy Violation** — bulk order upload (links/CSV), fetch review text with retry, Azure classification, tags, manual override, report writer with mandatory format, submission status, CSV export.
- **Fake Reviews** — order list, create order (target URL, reason, template tags, shots per template, comment tag, drip-feed or firehose), order detail with live shot log, pause/resume/cancel. Templates and comments remain admin-managed (users pick tags, not raw accounts).
- **Settings** — key activation, profile/handle/avatar/bio, chat with admin (already live).

Every page shows the "Activate your access key" gate when the user has no active key, except Settings.

## Data isolation

- New table `user_reviewer_profiles` (owner_id, slug unique globally, name, avatar_url, age, created_at).
- Existing per-user tables already carry `owner_id`; add `reviewer_profile_id` to `user_reviews` and `user_review_orders` so posts/orders bind to one of the user's own profiles.
- RLS: owner-only read/write on all user tables; anon `SELECT` only on published rows and on `user_reviewer_profiles` for public profile pages.
- Server functions all go through `requireSupabaseAuth`; every query filters by `owner_id = context.userId`. Admin bypass via `has_role`.
- Avatar uploads land in the `review-images` bucket under `profiles/<user_id>/…`.

## Public reviewer pages

- New route `/$profileSlug` resolves a `user_reviewer_profiles` row and renders the shared reviewer index (list of that user's published reviews for this profile).
- New route `/$profileSlug/$reviewSlug` renders the individual review using `ReviewDetailView`.
- New `/$profileSlug/index-info` uses the shared `ReviewerIndexInfo` component.
- Sitemap updated to include every published user reviewer profile and its reviews.
- Guard the dynamic top-level route so it doesn't shadow existing static routes (`admin`, `app`, `auth`, `xrpuas-log`, `sitemap.xml`, `robiul-alam`, `Jonas-Weber`, `Benedikt-Herrmann`, `afridi`, `Jordan`, `u`, `api`, `index-info`).

## Technical notes

- Reuse existing components (`ReviewDetailView`, `ReviewerIndexInfo`, admin tables) where possible, extracted to shared modules.
- New server-fn files: `src/lib/user-profiles.functions.ts`, `src/lib/user-orders.functions.ts`, `src/lib/user-reviews.functions.ts`, `src/lib/user-dmca.functions.ts`, `src/lib/user-policy.functions.ts`, `src/lib/user-fake-reviews.functions.ts` — all authenticated via `requireSupabaseAuth`.
- One migration for the new table + FK columns + policies + grants.
- Sidebar in `src/routes/app.tsx` gains "Reviewer Profiles" entry.

## Out of scope

- Admin-only sections (user management, templates, training, imports) stay admin-only.
- No change to the fake-review templates or capture pipeline.
