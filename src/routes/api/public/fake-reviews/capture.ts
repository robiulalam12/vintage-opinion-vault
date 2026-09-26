import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkExtensionKey, json, preflight } from "@/lib/fake-reviews.server";

/**
 * The capture extension POSTs one snapshot of a Google "Report review"
 * request here after the user submits it manually. We store it verbatim,
 * with {{REVIEW_ID}} / {{FEATURE_ID}} / {{REASON}} substitutions applied so
 * the firehose can replay it against other reviews.
 */

const schema = z.object({
  label: z.string().trim().min(1).max(120),
  google_email: z.string().trim().email().optional().nullable(),
  auth_user_index: z.number().int().min(0).max(9).optional().default(0),
  endpoint_url: z.string().url(),
  method: z.string().default("POST"),
  headers: z.record(z.string(), z.string()),
  cookie_bundle: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  body_kind: z.enum(["raw", "form", "json"]).default("raw"),
  detected_review_id: z.string().optional().nullable(),
  detected_feature_id: z.string().optional().nullable(),
  detected_reason: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

function templatize(
  value: string | null | undefined,
  substitutions: Array<[string | null | undefined, string]>,
): string | null {
  if (value == null) return null;
  let out = value;
  for (const [needle, token] of substitutions) {
    if (!needle) continue;
    // Escape special regex chars in the raw needle.
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(esc, "g"), token);
  }
  return out;
}

export const Route = createFileRoute("/api/public/fake-reviews/capture")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        if (!checkExtensionKey(request)) return json({ error: "Unauthorized" }, 401);
        let parsed: z.infer<typeof schema>;
        try {
          parsed = schema.parse(await request.json());
        } catch (err) {
          return json({ error: "Invalid payload", detail: (err as Error).message }, 400);
        }

        const subs: Array<[string | null | undefined, string]> = [
          [parsed.detected_review_id, "{{REVIEW_ID}}"],
          [parsed.detected_feature_id, "{{FEATURE_ID}}"],
          [parsed.detected_reason, "{{REASON}}"],
        ];

        const endpoint = templatize(parsed.endpoint_url, subs) ?? parsed.endpoint_url;
        const body = templatize(parsed.body ?? null, subs);
        const headersOut: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed.headers)) {
          const t = templatize(v, subs);
          if (t != null) headersOut[k] = t;
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("fake_review_templates")
          .insert({
            label: parsed.label,
            google_email: parsed.google_email ?? null,
            auth_user_index: parsed.auth_user_index ?? 0,
            endpoint_url: endpoint,
            method: parsed.method || "POST",
            headers_json: headersOut,
            cookie_bundle: parsed.cookie_bundle ?? null,
            body_template: body,
            body_kind: parsed.body_kind,
            status: "fresh",
            notes: parsed.notes ?? null,
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, id: data.id });
      },
    },
  },
});
