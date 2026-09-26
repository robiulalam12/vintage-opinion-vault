# Advanced policy-violation detection

Load Google's full Maps review policy into the Policy Violation tool as training. Make the AI check each review in more depth. Pass what it finds straight to the report writer.

## 1. Build the knowledge base from Google's own policy pages

I'll read these official pages in full:

- Prohibited & restricted content (support.google.com/contributionpolicy/answer/7400114)
- Maps user-generated content policy (answer/7422880)
- About our policies (answer/7400113)
- Removed & rejected content (answer/13780397)
- Google's pages for each policy type: Business Profile review policy, Google's own report reasons, and Local Guides rules

I'll turn them into one training rule per policy, saved on your Training data page so you can view and edit them. Each rule holds:

- a short ID tag, for example `FAKE_ENGAGEMENT` or `CONFLICT_OF_INTEREST`
- Google's exact policy name and link
- what counts, in Google's own wording
- warning signs to look for in the review text
- what is *not* a violation, so the AI doesn't flag ordinary negative reviews
- the report reason Google shows in its report form

**Policies covered.** Every section of Google's policy:

- Fake engagement: not a real experience
- Incentivised, paid or biased reviews
- Conflict of interest: owner, staff, competitor or ex-employee
- Review gating or asking customers for reviews
- Off-topic: politics, news, rants that aren't about the experience
- Misinformation
- Impersonation
- Harassment and bullying: naming staff, personal attacks
- Hate speech
- Profanity and obscenity
- Sexually explicit content
- Violence, threats or harmful content
- Dangerous or illegal activities
- Restricted goods: drugs, weapons, alcohol, tobacco, gambling
- Personal information: phone, email, address, full names of private people, health data
- Links, adverts and spam: promo codes, links, contact-me messages
- Gibberish or low quality
- Duplicate or copy-paste text
- Defamation: claims of crimes stated as fact
- Extortion: "remove this if you refund me"
- Child safety
- Terrorism
- Deliberately wrong place or wrong business
- AI-generated or mass-produced text

Plus about 60 short example reviews: violating and clean, including hard borderline cases. These teach the AI where the line is.

## 2. A stronger check

The AI reads every sentence against every policy rather than giving one overall guess. For each review it returns:

- **Verdict:** Violates / Clean / Unsure
- **Tags:** every policy it breaks, not just one. Each tag has:
  - how serious it is (low / medium / high)
  - how sure the AI is
  - the exact words from the review that break it
  - a one-line explanation
- **Main tag:** the strongest policy for a removal request
- **Google report reason:** the matching option in Google's report form
- **Language**, plus an English translation when the review isn't in English
- **Suspicious signs:** for example a 5-star review with a generic sentence, the business name repeated, or a first-person staff tone

Rules that keep it accurate:

- A negative review is **not** a violation by itself. Every tag must point to exact words.
- Any tag with low confidence makes the verdict "Unsure" so you check it.

The order page shows coloured tag chips with the problem words highlighted in the review. You can filter by tag.

## 3. Handover to the report writer

The report writer receives all of that: the tags, quoted words, policy names and links, Google's report reason and the translation. It writes the report around the main policy, cites Google's policy by name and link, quotes the exact words, and briefly mentions any other policies broken. Your example reports from the Training data page still set the tone and style.

## 4. Test before handing over

I'll run the detector on a set of test reviews and your real fetched reviews, and send you the results: what it caught, and any mistakes before and after tuning.

## Technical details

- `policy_items` gains `tags jsonb` (`[{code, policy, severity, confidence, evidence[], explanation}]`), `primary_tag`, `google_reason`, `language`, `translation` and `signals jsonb`. The existing `category`, `reason` and `confidence` columns stay as copies of the main tag's values.
- `policy_training` gains `code` and `source_url`. The rules and examples are loaded with SQL inserts.
- The check prompt includes every rule with its ID tag. The model must return JSON matching the tag list, and every piece of evidence must appear word-for-word in the review. Tags whose quoted words aren't actually in the review are discarded, and verdict and confidence are recomputed from what's left.
- Model: your Azure gpt-5.4 deployment, checking 3 reviews at a time as now.
- UI: tag chips with highlighted evidence and a tag filter in `admin.policy.$orderId.tsx`. `code` and `source_url` fields on the training page. CSV gets a tags column.
