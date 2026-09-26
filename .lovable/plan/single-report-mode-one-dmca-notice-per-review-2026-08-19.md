# Single-Report Mode: One DMCA Notice Per Review

Keeps the existing 90-URL batch mode exactly as it is, and adds a second mode: the extension walks an order review-by-review, filling a fresh Google form for each one with that review's own URL, own publish date and own DMCA text, solving the captcha via 2Captcha, submitting after a short cancellable countdown, then reloading a blank form and repeating.

## Flow

```text
Popup -> pick order -> "Start 1-by-1 run"
   |
   v
/api/public/dmca/next-single   (claims exactly 1 unreported review)
   |  returns: google url, our url, publish date, dmca text, identity
   v
content script fills form -> solves reCAPTCHA (2Captcha) -> 8s countdown panel (Cancel / Submit now)
   |
   v
auto-submit -> detect confirmation -> /api/public/dmca/confirm-single (marks reported, stores case ref)
   |
   v
reload blank form -> next review ... until order is done or you press Stop
```

## What each report contains

Per review, taken live from the database:

- Infringing URL: that review's raw Google review URL only.
- Original publication link: `https://peopleopinionbox.com/Jordan/reviews/<slug>` for that exact review.
- Copyrighted work description: the same wording you already use, with that review's real publish date and its own dedicated URL, e.g. "…published by me on June 29, 2014 … located at my original publication link provided in the fields below: https://peopleopinionbox.com/Jordan/reviews/rh03 …".
- Identity/signature fields from extension settings, both sworn checkboxes ticked.

## Captcha

- New settings field: 2Captcha API key (stored in `chrome.storage.local`, never sent to the dashboard).
- Background worker reads the reCAPTCHA sitekey from the page, calls 2Captcha, polls until a token returns, injects it into the response field and fires the callback.
- No key, solve failure, or timeout: the run pauses with "Solve the captcha, then press Continue" — nothing is skipped or lost.

## Run control

Floating panel on the form shows: order name, position (e.g. 34 / 100), current review URL + our URL, countdown, and buttons Pause, Skip this review, Stop run. State lives in `chrome.storage.local` so closing the popup doesn't stop the run; a tab reload resumes it.

Safety rails: one review claimed at a time (never reused, same reservation locking as batch mode), pause on any unexpected page (sign-in wall, error page, unknown form), configurable delay between reports (default 20-40s randomised) so it reads like human pace, and a hard stop if three reports in a row fail.

## Dashboard

`/admin/dmca` gains a "Single reports" section: per-order progress (reported / remaining), a live table of single reports with Google URL, our URL, submitted time, case reference, and status, plus a Release action for anything stuck.

## Technical notes

- New table `dmca_reports`: id, order_id, review_source_id, mode (`single`), status (`claimed` | `submitted` | `failed`), case_ref, error, claimed_at, submitted_at. Grants for `authenticated` read and `service_role` full, RLS admin-only, matching existing tables.
- New routes: `POST /api/public/dmca/next-single`, `POST /api/public/dmca/confirm-single`, `POST /api/public/dmca/release-single` — all key-protected with the existing `DMCA_EXTENSION_KEY` and `checkKey`, reusing `buildWorkDescription` from `src/lib/dmca.server.ts` so wording stays identical to the dashboard boxes.
- Claim is a single conditional UPDATE on `review_sources` (`.is('dmca_report_id', null)`) so no review is ever reported twice, even across two windows.
- Extension: new `runner.js` module plus additions to `background.js` (2Captcha calls, run state machine) and `content.js` (single-mode fill, submit detection, confirmation parsing). Batch-mode code paths untouched; the popup gets a mode switch.
- Manifest bumped to 1.4.0, `host_permissions` adds `https://2captcha.com/*`, and `public/dmca-extension.zip` is repackaged for download.
- Verification: mock-form harness run for 3 consecutive reports (fill -> submit -> reload -> next), captcha-missing pause path, and stop/resume across a tab reload.
