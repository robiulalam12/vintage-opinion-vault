# Capture extension reliability fix

## Confirmed root cause

The diagnostics prove account discovery and cookie capture complete successfully; failure occurs only at upload authentication. The installed browser copy sent the previous access key, while the current source, live downloadable ZIP, and production endpoint use the newer key. The current production ZIP is byte-for-byte current, so repeatedly rebuilding it alone cannot fix an already-installed stale copy.

## Changes

1. **Restore compatibility immediately**
   - Let the upload endpoint temporarily accept the previous capture-extension key alongside the current key.
   - Keep this compatibility limited to the capture endpoint, rather than widening access for unrelated extensions.

2. **Make stale copies unmistakable**
   - Bump the extension version to 3.2.0 and show it inside the popup and diagnostics.
   - Send the version with every upload and add a public health/version check.
   - Replace the generic `Unauthorized` message with a precise outdated-extension message.

3. **Strengthen capture and upload reliability**
   - Add request timeouts and bounded retries for temporary network/server failures.
   - Preserve per-account results so one failed account does not hide successful captures.
   - Keep manual capture available even when automatic deduplication skips recent accounts.

4. **Prevent stale downloads**
   - Change the dashboard link to a versioned filename/query.
   - Rebuild the ZIP from the audited source and verify its files, manifest version, endpoint, and embedded current credential match source.

5. **Validate end to end**
   - Test both previous and current installed credentials against production; each must pass authentication and reach payload validation.
   - Test an invalid credential still receives 401.
   - Download the exact public ZIP, inspect it, and confirm it matches the newly built artifact.
   - Verify the app build and the extension popup flow.

## Technical notes

- The production endpoint, CORS settings, manifest permissions, request shape, and account/cookie discovery are not causing this 401.
- Longer-term rotation should use a revocable extension enrollment token rather than one permanent credential embedded in every ZIP. This plan keeps the requested flow working now without redesigning the whole authentication system.
