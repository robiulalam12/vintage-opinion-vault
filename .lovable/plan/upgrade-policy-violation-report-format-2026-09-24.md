# Upgrade policy violation report format

## What will change

- Rewrite the report-writing instructions so every generated report follows the requested structure:
  1. `Urgent Review Removal Request – Policy Violation: [primary policy]`
  2. A direct removal request naming all detected policies
  3. `The Violation:` followed by the exact review quote
  4. `Why it violates policy:` with review-specific reasoning for each detected policy
  5. A firm request to remove the complete review
- Keep each report below 1,000 characters, including the headline.
- Require policy names, quotes, and reasoning to come only from that review's validated detection metadata; no invented violations or wording.
- Make the primary policy drive the headline and mention secondary policies only when they were actually detected.
- Preserve the existing saved training examples as style guidance, while making this new structure mandatory.

## Verification

- Run the report writer against a real violating review in the current order.
- Confirm the saved copy uses the new headline and labelled sections, quotes the review exactly, names only detected policies, and is under 1,000 characters.
- Confirm the report appears on the order page after writing.

## Technical details

- Update the report system and review-specific input instructions in the policy engine.
- Retain the existing second-pass shortening and final length guard in the report-writing flow.
