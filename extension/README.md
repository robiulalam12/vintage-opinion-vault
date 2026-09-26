# People Opinion Box — DMCA autofill (v1.3.0)

Chrome MV3 extension that reserves a batch of infringing Google Maps review URLs from
your dashboard and fills Google's copyright removal form. It never clicks **Submit** —
you always review and submit yourself.

## Install

1. Unzip `dmca-extension.zip`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder.
5. Pin the extension, open it, click **Settings**, and enter:
   - **Dashboard URL** — `https://peopleopinionbox.com`
   - **API key** — copy it from Admin → DMCA
   - Your identity fields (country, full name, company, email, signature)
   - **URLs per batch** — Google accepts up to 100; 90 is the default

## Use

1. Sign in to Google in the same browser profile.
2. Open the extension → **Open Google legal form** (opens the Maps/Geo form).
3. Click **Reserve next batch** — the dashboard locks 90 unreported URLs to this batch,
   so the same URL is never reported twice.
4. Click **Fill this form** (in the popup, or the floating panel on the form page).
5. Check the form, then click Google's **Submit**.
6. Back in the extension, paste the Google case ID (optional) and click **Mark submitted**.
   Those URLs are recorded as reported and will never be handed out again.
   Use **Release batch** instead if you abandon the report.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Add your dashboard URL and API key" | Click **Settings** and save both values. |
| "Couldn't load orders: Request failed (401)" | Wrong API key — recopy it from Admin → DMCA. |
| "Couldn't load orders: Request timed out" | Dashboard unreachable; check the URL, then **Retry**. |
| "No unreported URLs left" | Publish more reviews, or release a stuck batch. |
| "Couldn't find the form fields" | Scroll so the whole form is visible (Google renders it lazily), then click **Fill this form** again. |
| No floating panel on the form | Use the popup's **Fill this form** button — it injects the filler directly. |

## Files

- `manifest.json` — MV3 manifest, permissions for `support.google.com`, `reportcontent.google.com`
- `config.js` — form URL, field matching rules, defaults (guarded, safe to re-inject)
- `popup.html` / `popup.js` — batch reservation and fill controls
- `options.html` / `options.js` — settings
- `background.js` — API proxy + programmatic filler injection across all frames
- `content.js` — field detection, URL loop (`Add additional field`), floating panel
