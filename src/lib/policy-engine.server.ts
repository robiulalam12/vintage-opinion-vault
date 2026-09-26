export interface TrainingRow {
  kind: string;
  code: string | null;
  title: string | null;
  body: string;
  label: string | null;
  source_url: string | null;
}

export interface PolicyTag {
  code: string;
  policy: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  evidence: string[];
  explanation: string;
  source_url: string | null;
}

export interface Classification {
  verdict: "violates" | "clean" | "unsure";
  tags: PolicyTag[];
  primary_tag: string | null;
  google_reason: string | null;
  language: string | null;
  translation: string | null;
  signals: string[];
  confidence: number;
  reason: string | null;
  category: string | null;
}

export function buildClassifySystem(training: TrainingRow[]): string {
  const rules = training.filter((t) => t.kind === "rule");
  const examples = training.filter((t) => t.kind === "example");
  const ruleText = rules
    .map((r) => `## [${r.code ?? "RULE"}] ${r.title ?? ""}${r.source_url ? ` — ${r.source_url}` : ""}\n${r.body}`)
    .join("\n\n");
  const exText = examples
    .map((e) => `- (${e.label ?? "?"}${e.code ? `, ${e.code}` : ""}) "${e.body}"`)
    .join("\n");
  const codes = rules.map((r) => r.code).filter((c) => c && c !== "GENERAL_GUIDANCE");

  return `You are a senior Google Maps Trust & Safety policy analyst. You audit one review at a time against Google's Maps User-Generated Content Policy and must catch even a single offending word, while never flagging legitimate criticism.

Method:
1. Detect the language; if not English, translate to English internally.
2. Read the review sentence by sentence and check EVERY policy below.
3. For each violated policy, quote the exact offending words copied verbatim from the ORIGINAL review text (not the translation).
4. Negative opinions about this place's service, price, food, staff behaviour, cleanliness or wait time are allowed.

POLICIES:
${ruleText}

LABELLED EXAMPLES:
${exText}

Allowed tag codes: ${codes.join(", ")}.

Reply ONLY with a json object:
{"language":"ISO code","translation":"English translation or empty if English","tags":[{"code":"ONE_OF_ALLOWED","severity":"low|medium|high","confidence":0-1,"evidence":["exact verbatim quote"],"explanation":"one sentence"}],"primary_tag":"code of the strongest tag for a removal request or empty","google_reason":"the matching option in Google's report form (Off topic, Spam, Conflict of interest, Profanity, Bullying or harassment, Discrimination or hate speech, Personal information, Not helpful, Fake review)","signals":["short suspicious signals, may be empty"],"verdict":"violates|clean|unsure"}
If nothing violates return tags [] and verdict "clean".`;
}

const norm = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();

export function validateClassification(raw: string, reviewText: string, training: TrainingRow[]): Classification {
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  const rules = new Map(training.filter((t) => t.kind === "rule" && t.code).map((r) => [r.code!, r]));
  const hay = norm(reviewText);

  const tags: PolicyTag[] = [];
  for (const t of Array.isArray(parsed.tags) ? parsed.tags : []) {
    const code = String(t.code ?? "").toUpperCase();
    const rule = rules.get(code);
    if (!rule) continue;
    const evidence = (Array.isArray(t.evidence) ? t.evidence : [])
      .map((e: unknown) => String(e).trim())
      .filter((e: string) => e && hay.includes(norm(e)));
    if (!evidence.length) continue; // must be grounded in the actual text
    const sev = ["low", "medium", "high"].includes(t.severity) ? t.severity : "medium";
    tags.push({
      code,
      policy: rule.title ?? code,
      severity: sev,
      confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0)),
      evidence,
      explanation: String(t.explanation ?? "").slice(0, 400),
      source_url: rule.source_url,
    });
  }

  const sevRank = { low: 0, medium: 1, high: 2 } as const;
  tags.sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || b.confidence - a.confidence);
  const suggested = String(parsed.primary_tag ?? "").toUpperCase();
  const primary = tags.find((t) => t.code === suggested) ?? tags[0] ?? null;

  let verdict: Classification["verdict"];
  if (!tags.length) verdict = parsed.verdict === "unsure" ? "unsure" : "clean";
  else if (tags.some((t) => t.confidence >= 0.6)) verdict = "violates";
  else verdict = "unsure";

  return {
    verdict,
    tags,
    primary_tag: primary?.code ?? null,
    google_reason: primary ? String(parsed.google_reason ?? "").slice(0, 80) || null : null,
    language: String(parsed.language ?? "").slice(0, 12) || null,
    translation: String(parsed.translation ?? "").trim().slice(0, 4000) || null,
    signals: (Array.isArray(parsed.signals) ? parsed.signals : []).map((s: unknown) => String(s).slice(0, 200)).slice(0, 8),
    confidence: primary?.confidence ?? (verdict === "clean" ? 0.9 : 0.4),
    reason: primary ? `${primary.explanation} Quote: "${primary.evidence[0]}"` : null,
    category: primary?.policy ?? null,
  };
}

export function buildReportSystem(training: TrainingRow[]): string {
  const reports = training.filter((t) => t.kind === "report").map((r) => `### Example report${r.title ? ` (${r.title})` : ""}\n${r.body}`).join("\n\n");
  return `You are a senior Google Maps policy enforcement specialist. Write a precise removal request based ONLY on the validated violation metadata supplied for this specific review.

HARD RULES:
- The complete output, including headline and spaces, must be under 1000 characters. Aim for 650-900.
- Never invent a policy, quote, fact, motive or legal claim. Name only policies listed under DETECTED VIOLATIONS.
- Copy offending words exactly from the supplied quotes. Never paraphrase inside quotation marks.
- The primary policy must appear in the headline. Mention secondary policies only when supplied.
- Explain why each named policy applies to the quoted words in this review. Do not give generic policy summaries.
- Use "immediately" only when the evidence supports a clear violation. Remain firm, factual and professional.
- Plain text only: no markdown markers, bullets, greeting, signature, URLs or character count.

MANDATORY FORMAT — reproduce these labels and order exactly:
Urgent Review Removal Request – Policy Violation: [PRIMARY POLICY NAME]

Please remove this review immediately as it directly violates Google’s [PRIMARY POLICY] policy[ and SECONDARY POLICY policies].

The Violation: The reviewer states: "[EXACT QUOTE]"

Why it violates policy: [Concise, review-specific explanation. Explain the primary policy first, then each validated secondary policy.]

Please remove this review in full. Google’s policy permits removal of the entire post when any portion violates policy, and the cited content makes this review non-compliant.

The bracketed text is instruction, not literal output. Adapt grammar naturally when there is one policy or several. Use additional exact quotes only when needed to prove another detected policy.

Training examples below guide legal tone only. Their policies, facts, quotes and structure never override the current review or the mandatory format.
${reports}`;
}

export function buildReportUser(it: {
  url: string;
  business_name: string | null;
  reviewer_name: string | null;
  rating: number | null;
  review_published_at: string | null;
  review_text: string | null;
  translation: string | null;
  google_reason: string | null;
  primary_tag: string | null;
  tags: PolicyTag[];
}): string {
  const tagLines = (it.tags ?? [])
    .map((t, index) => `${index + 1}. Policy name: ${t.policy}\n   Code: ${t.code}\n   Exact validated quote${t.evidence.length === 1 ? "" : "s"}: ${t.evidence.map((e) => `"${e}"`).join("; ")}\n   Review-specific finding: ${t.explanation}`)
    .join("\n");
  const primary = (it.tags ?? []).find((tag) => tag.code === it.primary_tag) ?? it.tags?.[0];
  return `CURRENT REVIEW — use only these facts:
Review link: ${it.url}
Business: ${it.business_name ?? "unknown"}
Reviewer: ${it.reviewer_name ?? "unknown"}
Stars: ${it.rating ?? "?"}
Posted: ${it.review_published_at?.slice(0, 10) ?? "unknown"}
Google report reason: ${it.google_reason ?? ""}
Primary policy name for headline: ${primary?.policy ?? it.primary_tag ?? "Policy violation"}

DETECTED VIOLATIONS (this is the complete allowed list):
${tagLines}

FULL REVIEW TEXT (context only; do not create new violations from it):
"""${it.review_text}"""
${it.translation ? `English translation:\n"""${it.translation}"""` : ""}

Write the removal request now in the mandatory format. Keep it under 1000 characters.`;
}

export function reportHasRequiredFormat(text: string, tags: PolicyTag[], primaryTag: string | null): boolean {
  const trimmed = text.trim();
  const primary = tags.find((tag) => tag.code === primaryTag) ?? tags[0];
  if (!primary || trimmed.length >= 1000) return false;
  const required = [
    "Urgent Review Removal Request – Policy Violation:",
    "The Violation:",
    "Why it violates policy:",
    "Please remove this review in full.",
  ];
  return required.every((part) => trimmed.includes(part)) && trimmed.includes(primary.policy);
}

export function buildGuaranteedReport(tags: PolicyTag[], primaryTag: string | null): string {
  const primary = tags.find((tag) => tag.code === primaryTag) ?? tags[0];
  if (!primary) throw new Error("No validated policy violation was supplied for this report.");
  const secondary = tags.filter((tag) => tag.code !== primary.code).slice(0, 2);
  const named = [primary, ...secondary];
  const policyList = named.map((tag) => tag.policy).join(secondary.length > 1 ? ", " : " and ");
  const quote = primary.evidence[0] ?? "";
  const secondaryWhy = secondary
    .map((tag) => `${tag.policy} also applies because ${tag.explanation.replace(/^[A-Z]/, (letter) => letter.toLowerCase())}`)
    .join(" ");
  const why = `${primary.explanation}${primary.explanation.endsWith(".") ? "" : "."}${secondaryWhy ? ` ${secondaryWhy}${secondaryWhy.endsWith(".") ? "" : "."}` : ""}`;
  const ending = "Please remove this review in full. Google’s policy permits removal of the entire post when any portion violates policy, and the cited content makes this review non-compliant.";
  const fixed = `Urgent Review Removal Request – Policy Violation: ${primary.policy}\n\nPlease remove this review immediately as it directly violates Google’s ${policyList} ${named.length === 1 ? "policy" : "policies"}.\n\nThe Violation: The reviewer states: "${quote}"\n\nWhy it violates policy: `;
  const room = 999 - fixed.length - ending.length - 4;
  const conciseWhy = why.length <= room ? why : `${why.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "").replace(/[,:;\s]+$/, "")}.`;
  return `${fixed}${conciseWhy}\n\n${ending}`;
}
