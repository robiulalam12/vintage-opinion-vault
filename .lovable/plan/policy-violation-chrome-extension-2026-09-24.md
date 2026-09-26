# Policy Violation Chrome Extension

## Goal
Create a separate Manifest V3 extension named **Policy Violation**. It will process prepared violating reviews one at a time, fill Google’s legal-removal form, solve reCAPTCHA through 2Captcha, submit, confirm success, and update the matching Policy violation order without skipping or duplicating reviews.

The existing DMCA extension stays unchanged. The new extension reuses `DMCA_EXTENSION_KEY` and has its own download.

## Google form mapping
Using the supplied screenshot and form link, each submission will set:
- Country and full legal name from extension settings.
- **Myself** for acting on behalf of, as confirmed.
- “Other than a review” left unchecked.
- The current item’s Google review URL.
- Its saved legal report, unchanged and at most 1,000 characters.
- The required good-faith confirmation.
- A signature exactly matching the legal name.
- reCAPTCHA through the configured 2Captcha account.
- Submit through a trusted browser click, followed by confirmation-page detection.

## Reliable one-by-one queue
- Add a dedicated reporting table with claim token, status, attempts, timestamps, error, and Google case reference.
- Atomically reserve one eligible review at a time.
- Eligible means: verdict is violating, report is written, and report length is 1–1,000 characters.
- Automatically release claims abandoned for 15 minutes.
- Never mark an item submitted until Google’s confirmation is detected.
- Never offer a skip action; paused, failed, or interrupted work remains pending.
- Declare an order complete only when no eligible items or active claims remain.

## Protected extension API
Add key-protected endpoints for:
- Listing eligible orders and accurate progress.
- Claiming the next item.
- Confirming a successful Google submission.
- Releasing an interrupted claim.

Requests will use constant-time key checks, strict validation, no caching, and only the minimum review/report fields needed by the extension.

## Extension experience
- Popup: order selector, ready/in-progress/submitted/blocked counts, Start, Pause/Resume, Open run tab, and Stop.
- Settings: dashboard URL, shared extension key, country, full legal name, 2Captcha key, and submit countdown.
- Durable state across refreshes, tab closure, and extension restarts.
- Clear errors for changed Google fields, missing required values, captcha failures, network failures, and rejected submissions.

## Policy violation page
- Add a **Download extension** button using the existing secure ZIP download approach.
- Add a short setup note explaining that it uses the same extension key as DMCA.
- Keep classification, report writing, filters, and CSV behavior unchanged.

## Safety checks before submission
The extension will refuse to submit unless it verifies the expected form, one matching URL, exact report copy, **Myself**, unchecked non-review option, country, name, matching signature, confirmation checkbox, solved captcha, and no visible required-field errors.

## Verification
1. Inspect the live form’s field structure without submitting and add layered selectors for labels, ARIA attributes, names, and stable structure.
2. Test filling, validation, captcha callback handling, trusted clicking, confirmation detection, and case-reference capture against a matching local fixture.
3. Test a queue exceeding 18 reviews, including refreshes, simultaneous runners, stale claims, API failures, and captcha retries; every item must be submitted once or remain visibly pending.
4. Verify the packaged ZIP and its download on desktop and phone layouts.
5. As approved, submit one prepared real report through Google, verify Google’s confirmation, and verify the exact item becomes submitted. If the available browser lacks the verified Google session, stop at that external sign-in boundary and report it honestly.
6. Check build, browser, runtime, and network diagnostics.

## Limits
2Captcha is paid, so captcha solving cannot be completely free. Google can change or block automation; layered selectors, strict validation, retries, and the no-skip queue prevent silent loss but cannot guarantee Google accepts every report.
