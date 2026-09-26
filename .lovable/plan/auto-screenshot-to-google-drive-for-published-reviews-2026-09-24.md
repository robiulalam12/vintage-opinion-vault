# Auto Screenshot to Google Drive for Published Reviews

After a review in an order is published, the system takes a full-page screenshot of its live page, uploads it to your Google Drive, makes the file public ("anyone with the link can view"), and shows the Drive link on that review's card in the order page.

## What you will see

- Each published review card on the order page gets a "Screenshot" row:
  - **Drive link** (opens the public image) with a copy button, or
  - "Capturing..." while it runs, or
  - a red error with a **Retry screenshot** button if it failed.
- Order header gets a **Screenshot all** button for any published reviews still missing a link (also fills in reviews published before this feature).
- **Download CSV** gets an extra "Drive screenshot" column.
- All images go into one Drive folder called "PeopleOpinionBox Screenshots", with a subfolder per order, and each file is named after the review address (e.g. `rh254.png`).

## How it works (all free to use)

1. **Publish** finishes as usual.
2. **Screenshot**: the scraping service already connected to this project (Firecrawl) opens the live review page and returns a full-page PNG. It uses the free credits you already have; no new account.
3. **Upload**: the image goes to your own Google Drive through Google's free Drive connection (you connect your Google account once when I build this).
4. **Share**: the file is set to "anyone with the link can view".
5. **Save**: the Drive link is saved on that review and shows on the order page.

Each review is handled on its own. One failure never blocks the others or the publishing itself, and you can always retry it.

## One-time setup when building

- A connect card will ask you to link your Google Drive account. Pick the Google account whose Drive should hold the screenshots.

## Technical details

- Migration: `review_sources` gains `drive_file_id text`, `drive_url text`, `screenshot_status text` (`none|pending|done|failed`), `screenshot_error text`, `screenshot_at timestamptz`.
- Link the `google_drive` App connector (builder's own Drive; scope `drive.file`).
- New `src/lib/review-screenshot.server.ts`:
  - `captureFullPage(url)`: Firecrawl `/v2/scrape` with `formats: [{ type: "screenshot", fullPage: true }]`, `waitFor: 3000`, then download the returned image URL into bytes.
  - `ensureFolder(name, parentId?)`: find or create a Drive folder (`mimeType='application/vnd.google-apps.folder'`).
  - `uploadPng(bytes, name, folderId)`: multipart upload via `connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink`.
  - `makePublic(fileId)`: `POST /drive/v3/files/{id}/permissions` `{ role: "reader", type: "anyone" }`.
  - Every non-OK response is thrown with its status and body so the error shows on the card.
- `src/lib/reviews.functions.ts`: new admin-only `screenshotSource(sourceId)` and `screenshotOrder(orderId)` (concurrency 2, per-item try/catch). The publish flow queues `screenshotSource` right after a successful publish without waiting on it.
- Public URL used: the published live page (`https://peopleopinionbox.com` + `published_path`/slug).
- UI: `src/routes/admin.orders.$orderId.tsx` adds the Screenshot row, Retry, and Screenshot all; the CSV export adds the column.
- Verify: publish one test review, confirm the PNG appears in Drive, the link opens in a signed-out browser, and the link shows on the card.
