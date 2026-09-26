/** Minimal RFC4180-ish CSV parser (handles quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Accepts 2014-03-05, 05/03/2014, 3/5/2014, "March 5, 2014" → YYYY-MM-DD or null. */
export function normaliseDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const slash = value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (slash) {
    // day-first (UK style)
    return `${slash[3]}-${slash[2]!.padStart(2, "0")}-${slash[1]!.padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

const HEADER_MAP: Record<string, "reviewer_name" | "review_date" | "review_text" | "business_name"> = {
  name: "reviewer_name",
  reviewer: "reviewer_name",
  "reviewer name": "reviewer_name",
  author: "reviewer_name",
  date: "review_date",
  "review date": "review_date",
  published: "review_date",
  "publish date": "review_date",
  review: "review_text",
  text: "review_text",
  "review text": "review_text",
  body: "review_text",
  content: "review_text",
  business: "business_name",
  "business name": "business_name",
  company: "business_name",
  subject: "business_name",
};

export interface ParsedArchiveRow {
  reviewer_name: string;
  review_date: string | null;
  review_text: string;
  business_name: string | null;
}

export interface ParseResult {
  rows: ParsedArchiveRow[];
  skipped: number;
  headerUsed: boolean;
}

export function parseArchiveCsv(text: string): ParseResult {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], skipped: 0, headerUsed: false };

  const first = table[0]!.map((c) => c.trim().toLowerCase());
  const mapped = first.map((c) => HEADER_MAP[c]);
  const headerUsed = mapped.filter(Boolean).length >= 2;

  const order: Array<keyof ParsedArchiveRow> = headerUsed
    ? (mapped as Array<keyof ParsedArchiveRow>)
    : ["reviewer_name", "review_date", "review_text", "business_name"];

  const body = headerUsed ? table.slice(1) : table;
  const rows: ParsedArchiveRow[] = [];
  let skipped = 0;

  for (const cells of body) {
    const record: ParsedArchiveRow = {
      reviewer_name: "",
      review_date: null,
      review_text: "",
      business_name: null,
    };
    order.forEach((key, index) => {
      if (!key) return;
      const value = (cells[index] ?? "").trim();
      if (key === "review_date") record.review_date = normaliseDate(value);
      else if (key === "business_name") record.business_name = value || null;
      else record[key] = value;
    });
    if (!record.reviewer_name || !record.review_text) {
      skipped += 1;
      continue;
    }
    rows.push(record);
  }
  return { rows, skipped, headerUsed };
}
