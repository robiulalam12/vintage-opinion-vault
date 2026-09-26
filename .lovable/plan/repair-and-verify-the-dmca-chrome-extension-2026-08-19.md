# Repair and Verify the DMCA Chrome Extension

## Confirmed root causes

1. **Double-injection global collision (your console errors).** `config.js` declares top-level `const FIELD_MAP` / `GOOGLE_FORM_URL`. It is injected twice into the Google form page — once declaratively by the manifest, once programmatically when filling — so the second run throws `Identifier 'FIELD_MAP' has already been declared`. That kills the content script, so no panel and no autofill.
2. **Popup never boots.** `popup.js` re-declares `GOOGLE_FORM_URL`, which `config.js` already declared in the same page scope: `Identifier 'GOOGLE_FORM_URL' has already been declared`. The whole popup script aborts, so the order selector stays on “Loading…” forever and no buttons are wired.
3. **No way to open the form.** “Open Google legal form” is hidden until a batch exists, so it is unreachable in the normal first-use flow.
4. **Wrong form target.** The open action points at the Web Search form, not the Maps/Geo form you use: `support.google.com/legal/contact/lr_dmca?product=geo&uraw=&hl=en-GB`.
5. **Fragile field matching.** The live form was fetched and its real controls confirmed: `market_residence` (country select), `full_name`, `companyname`, `represented_copyright_holder`, `contact_email_noprefill`, `description_of_copyrighted_work`, `location_of_copyrighted_work`, `url_box` plus an “Add additional field” control, `signature`, and two checkboxes `dmca_affirmations_authorized` / `dmca_affirmations_penalty`. Current matching relies on text guesses only.
6. The dashboard API and its CORS preflight are healthy, so the loading failure is entirely extension-side; API errors must still surface as explicit popup states.

## Implementation

### 1. Kill the global collisions permanently

- Wrap `config.js` in a guarded IIFE that exports a single namespaced object, so repeated injection is a no-op instead of a fatal syntax error.
- Wrap popup and content scripts in their own IIFEs; no shared top-level names anywhere.
- Content script keeps an idempotent load guard so declarative and programmatic injection can coexist.

### 2. Make the popup boot and never hang

- Global error and unhandled-rejection handlers replace “Loading…” with a readable failure instead of silence.
- Explicit states: setup required, key rejected (401), network/timeout error, no orders, no URLs remaining, orders loaded.
- Add “Retry loading orders” and “Open Settings” actions for recovery without reinstalling.
- Restore any reserved batch on open and block a second reservation until the current one is submitted or released.

### 3. Fix the workflow

- **Open Google legal form** always visible, pointing at the exact Geo form; focuses an existing form tab instead of opening duplicates.
- **Fill this form** opens the form automatically if the active tab is not the legal form.
- Clear per-run reporting: how many URLs filled of the total, how many confirmations ticked, and the names of any fields that need manual attention.
- Submit is never clicked by the extension.

### 4. Autofill matched to the real form

- Match on the confirmed stable `name`/`id`/`aria-label` attributes first, with label and context text as fallback.
- Fill identity fields, work description, authorised publication link, signature, and both required confirmation checkboxes.
- Fill up to 100 infringing URLs by clicking “Add additional field” and waiting for each new input to exist before writing, reporting the exact position if Google stops adding fields.
- Handle the progressive/“show form” render and support retry from both the popup and the in-page panel.

### 5. Network and batch hardening

- Route all dashboard API calls through the MV3 service worker with a 30s timeout and structured error results; the key stays in extension storage.
- Reservation, confirm, and release keep the database as the single source of truth for which URLs were used.

### 6. Package and verify

- Bump the extension version and rebuild `public/dmca-extension.zip` from `extension/`.
- Verify the packaged files, not just source, contain the fixed manifest, popup, worker, form URL, and content script.
- Syntax-check every script individually **and** in the exact combined order they execute on a page, which is what catches these duplicate-identifier crashes.
- Test autofill against a local fixture built from the captured live form with 90 URLs: assert 90 distinct URL fields filled, all text fields set, both confirmations ticked, signature present, and no submit click.
- Test popup states end to end: missing settings, bad key, API down, load orders, reserve, reopen popup, open/focus form, fill, mark submitted, release.
- Check URL recognition against your exact Google link. Google sign-in and anti-automation may block a real live submission test; by design the extension stops before Submit anyway.

## Files in scope

- `extension/config.js`, `extension/popup.html`, `extension/popup.js`, `extension/content.js`, `extension/background.js`, `extension/manifest.json`
- `extension/options.html` / `extension/options.js` if setup validation messaging needs it
- `extension/README.md`
- `public/dmca-extension.zip`
