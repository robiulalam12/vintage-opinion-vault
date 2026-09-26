# User Dashboard with Key-Gated Access

A separate customer dashboard, parallel to the existing `/admin` staff dashboard. Users sign up at `/xrpuas-log`, chat with the admin to request a 7-day access key, activate it in Settings, and then get their own private workspace with the same six tools (empty for each user). Admin gets a new **User management** page to see users, chat with them in realtime, and issue/revoke keys.

## What the user sees

- **`/xrpuas-log`** — sign up / log in with email + password. No public link elsewhere.
- After login → **`/app`** (their dashboard). If they don't have an active key, every page shows a "Your access key is not active" screen with the reason (never activated / expired / revoked), a link to Settings, and a **Chat with admin** button.
- **Sidebar (their dashboard):** Home, Review Orders, Post Reviews, DMCA Reports, Policy Violation, Fake Reviews, Settings.
- **Post Reviews:** each user gets their own auto-created public reviewer profile with a unique slug (e.g. `/u/<handle>`) and their reviews publish there. Their own `index-info` page comes with it.
- **Settings:** submit an access key, see current key status/expiry, open the admin chat.
- **All data is isolated per user** — new rows in new tables, scoped by `user_id`. Users never see admin data or other users' data.

## What admin sees

- New sidebar entry **User management** on `/admin/users`:
  - Table of every signed-up user (email, joined date, current key status/expiry, unread chat count).
  - Row action: **Generate 7-day key** (unique token, shown once, copied to clipboard, delivered to that user's key inbox automatically).
  - Row action: **Revoke** current key.
  - Row action: **Open chat** — realtime thread with that user.
- Admin retains full access to everything without needing a key.

## Chat

Realtime via Supabase Realtime on a `support_messages` table. Two views:
- User side (Settings → "Chat with admin"): one thread, their messages + admin replies.
- Admin side (User management → Open chat): list of user threads, click one to reply.

## Technical section

### Auth & routing

- Enable email/password sign-in (idempotent).
- New route `src/routes/xrpuas-log.tsx` — sign up / sign in tabs; on success `navigate({ to: "/app" })`.
- New protected layout `src/routes/_authenticated/route.tsx` (integration-managed shape, `ssr: false`, redirects to `/xrpuas-log`) — reused by both user dashboard and could gate admin later, but admin stays on its current `/admin` guard to avoid disturbing existing routes.
- New user-dashboard shell `src/routes/_authenticated/app.tsx` with `Outlet`, sidebar, key-gate check.
- Child leaf routes:
  - `_authenticated/app.index.tsx` (Home)
  - `_authenticated/app.orders.tsx` + `app.orders.$orderId.tsx`
  - `_authenticated/app.post.tsx`
  - `_authenticated/app.dmca.tsx`
  - `_authenticated/app.policy.tsx`
  - `_authenticated/app.fake-reviews.tsx`
  - `_authenticated/app.settings.tsx`
- New admin page `src/routes/admin.users.tsx` (+ sidebar entry in `admin.tsx`).
- User's public reviewer page: `src/routes/u.$handle.index.tsx`, `u.$handle.$slug.tsx`, `u.$handle.index-info.tsx` (reuse `ReviewDetailView` + `ReviewerIndexInfo`).

### Database (migration)

New tables, all with `owner_id uuid references auth.users(id) on delete cascade`, RLS on, GRANTs for `authenticated` + `service_role`:

- `user_profiles` — id, owner_id (unique), handle (unique, generated from email), display_name, avatar_url, created_at.
- `access_keys` — id, owner_id, token (unique, 32-char random), issued_by, issued_at, expires_at (issued_at + 7 days), revoked_at nullable. Helper SQL fn `has_active_key(uid)` → boolean (security definer).
- `user_review_orders`, `user_dmca_reports`, `user_policy_orders`, `user_policy_items`, `user_fake_review_orders`, `user_fake_review_shots` — mirrors of the admin equivalents, `owner_id`-scoped, minimal columns needed for the same UIs.
- `user_reviews` — the user's own published reviews (headline, body, rating, review_date, image_url, slug, published, owner_id).
- `support_threads` — id, owner_id (unique per user), last_message_at, unread_admin, unread_user.
- `support_messages` — id, thread_id, sender ('user'|'admin'), body, created_at. Added to `supabase_realtime` publication.

RLS policies:
- User tables: `owner_id = auth.uid()` for select/insert/update/delete.
- `access_keys`: user reads their own; only admin (via `has_role`) writes.
- `support_messages`: user sees their own thread; admin sees all.
- Public `u.$handle` reads: narrow `TO anon` SELECT on `user_reviews` where `published = true` + `user_profiles` (handle, display_name, avatar_url only).

### Key gate

- `src/lib/user-access.functions.ts` — `myAccessStatus()` server fn returns `{ active, expiresAt, reason }`.
- Wrapper component `<KeyGate>` in user dashboard reads it via `useQuery`. Every user server fn that touches user data uses a `requireActiveKey` middleware that: runs `requireSupabaseAuth`, then checks `has_active_key(auth.uid())`; throws 403 otherwise. Admin bypasses via `has_role`.
- Key generation (admin only): `generateUserKey(userId)` server fn — creates a 32-char token, sets expires_at = now + 7 days, revokes any prior active key for that user, returns token once.
- Key activation (user): `activateKey(token)` — validates token matches an unrevoked, unexpired key already assigned to this user (admin issues directly to a user), marks it active. (Simpler alternative: admin issues → key auto-active for that user; Settings just displays status. Plan uses this simpler flow: no separate "submit key" needed — but per request we still show a "Submit key" input for users who receive a token string, which sets `owner_id` on an unassigned key. Both paths supported.)

### Chat (realtime)

- `sendSupportMessage(body)` server fn (user or admin) inserts into `support_messages`, upserts `support_threads`.
- Frontend subscribes with `supabase.channel('support:'+threadId).on('postgres_changes', ...)` inside `useEffect`, tears down on unmount.
- Admin User management shows thread list with unread badges; opening a thread marks read.

### Reuse vs. new code

- User dashboard pages are **new files** with slimmed-down UIs — they do not import admin route files. Where logic is generic (review scraping, DMCA template rendering, policy engine), extract server-side helpers to `src/lib/*.server.ts` if not already there and call from both admin and user server fns. No breaking changes to existing admin flows.
- `Post Reviews` for a user writes to `user_reviews` + publishes to their `/u/<handle>/<slug>` page. Screenshot/Drive pipeline reused as-is.

### Out of scope for v1 (flag explicitly)

- Users cannot use Fake Reviews templates/comments from the admin pool — their Fake Reviews page starts empty (they add their own accounts). Or we can share admin templates read-only — I'll default to **isolated (empty)** unless you say otherwise.
- No email notifications for key issuance or chat messages (in-app only).
- Admin chat is 1:1 per user (no group threads, no attachments in v1).

## Build order

1. Migration: new tables, RLS, GRANTs, `has_active_key` fn, Realtime publication.
2. Enable email auth; scaffold `/xrpuas-log`, `_authenticated` layout, `/app` shell + key gate.
3. Settings page (key submit + status + chat entry).
4. Admin `/admin/users` page + key generation + revoke.
5. Realtime chat (both sides).
6. Home + Review Orders + Post Reviews (with `/u/<handle>` public pages).
7. DMCA Reports + Policy Violation + Fake Reviews (per-user versions).
8. Verify end-to-end: sign up → request key via chat → admin issues → user sees dashboard unlocked → posts a review → public `/u/<handle>/<slug>` renders.
