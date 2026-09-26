# Consistent review schema dates

## Goal
Ensure every individual review page outputs complete JSON-LD and page metadata using the review’s selected publication date as a valid ISO timestamp.

## Changes
- Centralize the individual-review JSON-LD builder so Robiul, Jonas, Benedikt, Afridi, and Jordan use the same fields and date handling.
- Include `datePublished`, `dateCreated`, and `dateModified` from the selected review date, plus author, rating, reviewed business, canonical URL, and review image metadata when available.
- Align each page’s article publication/modified metadata with the same timestamp.
- Keep the visible publication date and structured markup synchronized.

## Verification
- Check all five individual reviewer routes render one valid `Review` JSON-LD block.
- Confirm each timestamp matches the review’s selected date.
- Confirm the preview builds without errors.
