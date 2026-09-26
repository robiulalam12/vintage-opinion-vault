# User dashboard: full admin-parity tool pages

Bring the four user tool pages up to the same feature level as the matching admin pages, scoped per user (RLS by `owner_id`). Data stays fully isolated — one user never sees another user's rows.

## Scope

Four pages, each rebuilt to mirror the admin tool:

1. **Review Orders** (`/app/orders`) — mirrors `/admin/reviews`
   - Create order with name, note, reviewer profile (from user's own profiles)
   - Add review sources by URL (bulk paste, one per line)
   - Auto-fetch review text + reviewer name + rating + date (retry button per row)
   - Publish button per row → creates a `user_reviews` row under the selected reviewer profile, live at `/<profile-slug>/<review-slug>`
   - Per-review Drive screenshot button + universal "Take screenshots" batch button
   - DMCA copy generator per row (uses user's chosen template + `{{drive_img_link}}`)
   - Status filters, CSV export

2. **Post Reviews** (`/app/post`) — keep current form, add:
   - List of user's published reviews with edit/unpublish/delete
   - Image upload preview, slug preview, live public URL link

3. **DMCA Reports** (`/app/dmca`) — mirrors `/admin/dmca`
   - Bulk paste Google review URLs
   - Per-row status (pending / submitted / rejected / removed)
   - Copy DMCA notice text (user-chosen template, own link or Drive link)
   - Download the DMCA browser extension with the user's own key
   - Delay setting per order (same presets as admin: none up to 30m–2h)

4. **Policy Violation** (`/app/policy`) — mirrors `/admin/policy`
   - Bulk order upload (links or CSV)
   - Fetch review text + age (retry)
   - "Find policy violations" (Azure OpenAI) → tags + severity + confidence
   - Manual verdict override
   - "Write report" → generates the mandatory-format report (≤1000 chars)
   - Download the Policy Violation extension with the user's own key
   - Filters, CSV export

5. **Fake Reviews** (`/app/fake-reviews`) — mirrors `/admin/fake-reviews`
   - New order dialog with tag / account picker (from the user's own uploaded accounts)
   - Templates tab: bulk cookie upload (multi txt), tag, verify, bulk remove
   - Comments tab: bulk add, toggle, delete
   - Order detail page with firehose + drip-feed (30s–2h)
   - All firing goes through the existing relay + DataImpulse proxy

## Data model

Add per-user tables (RLS: `owner_id = auth.uid()`, admin bypass via `has_role`):

- `user_review_sources` — belongs to `user_review_orders`, mirrors admin `review_sources` columns needed for the flow (url, review_text, reviewer_name, rating, review_date, drive_url, published_review_id, status, error)
- `user_dmca_orders` (name, template_id nullable, url_mode, delay presets) + `user_dmca_items` (url, status, error, submitted_at)
- `user_policy_orders` + expand `user_policy_items` to include the same fields as admin `policy_items` (verdict, tags, primary_tag, confidence, report_text, report_status, review metadata)
- `user_fake_review_templates` (owner_id, label, google_email, authuser index, endpoint, headers, cookies, tag, status)
- `user_fake_review_orders` — add `template_ids`, `shots_per_template`, `comment_tag`, `reason_code`, `drip_min_seconds`, `drip_max_seconds`, `drip_next_at`, `fired_at`, `done_at`
- `user_fake_review_shots` (owner_id, order_id, template_id, status, http_status, response_snippet, error, fired_at)
- `user_fake_review_comments` (owner_id, tag, text, active, times_used)
- `user_dmca_templates` (owner_id, name, body) — so users can save their own templates

Every new table: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role`, RLS enabled, owner-only policies + `has_role('admin')` override.

## Server functions

New files under `src/lib/`:

- `user-review-orders.functions.ts` — CRUD orders/sources, fetch review text (reuses admin `fetchPageText` + `extractReviews`), publish to `user_reviews`, take Drive screenshot (reuses admin Firecrawl helper)
- `user-dmca.functions.ts` — CRUD + template rendering
- `user-policy.functions.ts` — CRUD + Azure classify + Write report (reuses admin engine from `src/lib/policy.server.ts`)
- `user-fake-reviews.functions.ts` — CRUD orders/templates/comments, verify (Gmail atom feed), fire (through relay), drip-feed tick

All wrapped with `.middleware([requireSupabaseAuth])` and gated by `has_active_key`.

## Access

User's own extension key: reuse the same `access_keys` token for the DMCA + Policy extensions — the extensions accept per-user tokens by looking them up in `access_keys` (already keyed by `owner_id`). Download buttons on each page emit a ZIP with the user's active token baked in.

## UI

Each `/app/*` tool page becomes two-tier like admin: a list page + a detail page (`$orderId`), with the same tabs, filters, KPIs, and dialogs as the matching admin page — restyled with the same shadcn components so the look matches. Reviewer-profile selectors show only the user's own profiles. Fake-review template pickers show only the user's own templates. Chat with admin stays in Settings.

## Rollout

One page at a time in this order, each fully working before starting the next:

1. Fake Reviews (biggest — start here so it stops looking empty)
2. Review Orders
3. Policy Violation
4. DMCA Reports
5. Post Reviews polish

Each step: migration → server fns → list page → detail page → verify build + one Playwright smoke.

## Out of scope

- Cookie-capture extension (declined earlier)
- Sharing data or templates between users
- Changing any admin page

## Technical notes

- User uploads go to the existing `review-images` bucket under `user-<uid>/…`
- Firing goes through the existing relay (`RELAY_URL` + `RELAY_SECRET`) with direct-fetch fallback
- Azure classify + Write report reuse `src/lib/policy.server.ts` engine unchanged
- Drive screenshot reuses Firecrawl helper unchanged; user's Drive folder = shared service Drive (same as admin flow), file naming prefixed with the user's handle
