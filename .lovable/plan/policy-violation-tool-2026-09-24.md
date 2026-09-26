# Policy Violation tool

A new dashboard page, admin only, that works like Review Orders and adds AI checks for Google policy violations and AI-written reports.

## What you get

**Sidebar:** a new "Policy violation" item.

**Orders list** (`/admin/policy`)
- A "New order" button: you name the order, then paste links or upload a CSV. It counts valid links as you go, the same way Review Orders does.
- Each order appears as a card showing progress: fetched, checked, violations found, and reports written.

**Order page** (`/admin/policy/$orderId`)
- **Fetch reviews**: gets each review's text, reviewer name, star rating and Google date. It uses the same reader as Review Orders, with the same retry-on-block and "Retry" buttons.
- **Find policy violations**: the AI checks every fetched review against your training rules. Each review gets one of three results:
  - **Violates**, with the policy category (for example spam, off-topic, conflict of interest, harassment, hate speech, personal info or fake engagement), a confidence score and a one-line reason that quotes the problem words.
  - **Clean**.
  - **Unsure**, which flags it for you to look at.
- **Write reports**: for each review marked Violates, the AI writes the report text for Google in the legal style from your training data. You can edit the text, copy it, and mark it as submitted.
- Filters: All / Violates / Clean / Unsure / Report written / Submitted.
- Download CSV: link, text, date, result, category, reason, report text.
- You can switch any result by hand. Your changes are never overwritten unless you press re-check.

**Training page** (`/admin/policy/training`)
- The place to put the training data you'll send me:
  - policy rules and categories
  - examples of reviews that violate and reviews that don't
  - example report texts
- About "fully trained": the AI isn't retrained. Your rules and examples go into every request it gets. Updating them on this page changes its behaviour straight away, with no rebuild. I'll load your first set of training data for you once you send it.

## AI service

- As you asked, this uses your Microsoft Azure OpenAI. I'll need three things, which you enter in secure fields rather than in chat:
  - your endpoint
  - your API key
  - the deployment name (the name of your model on Azure)
- Reviews are checked 3 at a time, with automatic waits when Azure says it's busy. If one review fails, the others keep going. Errors appear on that review with a Retry.

## Technical details

- New tables `policy_orders` and `policy_items`. Each item stores: url, text, reviewer, rating, review date, fetch status, verdict, category, confidence, reason, report text, report status and errors. There's also a `policy_training` table (rules, labelled examples, report examples). All three are admin-only, with RLS and grants. They're created with direct SQL because the migration history is broken.
- Fetching reuses `review-age.server.ts` and the scraper fallback from `reviews.functions.ts`.
- New `src/lib/azure-ai.server.ts`: calls Azure chat completions using `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_DEPLOYMENT`. It streams and collects the reply on the server, asks for structured JSON verdicts, retries only when Azure is busy (429) or has a server error (5xx), and has no timers that cut requests off.
- New `src/lib/policy.functions.ts`: order CRUD, batch fetch, batch classify and batch write-report, all admin-checked.
- New pages: `admin.policy.index.tsx`, `admin.policy.$orderId.tsx`, `admin.policy.training.tsx`. The nav item and page titles are added in `admin.tsx`.
