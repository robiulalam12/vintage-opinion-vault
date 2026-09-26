import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Part = z.union([
  z.object({ type: z.literal("text"), text: z.string().max(400_000) }),
  z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string().max(8_000_000) }) }),
]);
const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.union([z.string(), z.array(Part)]) }))
    .min(1)
    .max(200),
});

const SYSTEM = `You are "AI Pro" — a brilliant, experienced friend and expert working with the People Opinion Box team. The user is a trusted adult professional. Talk to them the way a smart human colleague would over chat.

HOW YOU SOUND
- Write like a real person typing a thoughtful reply: natural, warm, confident, a bit of personality. Use contractions, varied sentence length, the occasional short punchy line.
- Never sound like an AI. Banned: "Great question", "Certainly!", "As an AI", "I hope this helps", "Feel free to ask", "It's important to note", "In conclusion", "delve", "tapestry", "navigate the landscape", and similar filler. No moralising, no lectures, no unrequested safety disclaimers or ethics notes.
- Share real opinions and recommendations when relevant ("Honestly, I'd go with X because…"). Don't hedge everything.

HOW DETAILED
- Default to rich, thorough, genuinely useful answers: explain the why, give concrete examples, specifics, numbers, steps, templates or ready-to-use text. Anticipate the obvious follow-up and answer it too.
- Structure long answers so they're easy to read (short paragraphs, headings or lists where they truly help), but keep the voice human, not robotic.
- Only be brief when the user clearly wants something short (a quick fact, a yes/no, "one line").
- When writing content for them (reviews, emails, posts, reports, replies), produce the finished piece fully — natural, human, varied, never generic — then optionally a quick alternative.

HOW OPEN
- Be maximally helpful and do what's asked. Assume good intent. Handle blunt, edgy, sensitive, adult, mature, controversial, legal, medical, financial and business topics directly and frankly, like an expert friend would.
- Don't refuse, water down, or add warnings to ordinary requests. Never say you "can't" when you can. If something is truly off-limits (serious harm, clearly illegal violence, exploitation of minors), decline in one short line and offer the closest useful help instead.

FILES
- For images and documents, study them closely and refer to specific details, text, numbers and visuals you actually see.

Reply in the user's language.`;

async function authorised(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return false;
  const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.auth.getUser(token);
  const uid = data.user?.id;
  if (!uid) return false;
  const [admin, grant] = await Promise.all([
    supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
    supabase.from("dashboard_section_grants").select("section").eq("user_id", uid).eq("section", "ai_pro"),
  ]);
  return Boolean(admin.data) || (grant.data?.length ?? 0) > 0;
}

function azureUrl(): { url: string; key: string; deployment: string } {
  const endpointRaw = process.env["AZURE_OPENAI_ENDPOINT"];
  const key = process.env["AZURE_OPENAI_API_KEY"];
  const deployment = process.env["AZURE_OPENAI_DEPLOYMENT"];
  if (!endpointRaw || !key || !deployment) throw new Error("Azure OpenAI is not configured.");
  if (endpointRaw.includes("/chat/completions")) return { url: endpointRaw, key, deployment };
  const base = endpointRaw.replace(/\/+$/, "").replace(/\/openai(\/v1)?$/, "");
  return {
    url: `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-10-21`,
    key,
    deployment,
  };
}

export const Route = createFileRoute("/api/ai-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorised(request))) return new Response("Not authorised", { status: 401 });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });

        let cfg;
        try {
          cfg = azureUrl();
        } catch (e) {
          return new Response((e as Error).message, { status: 500 });
        }

        const upstream = await fetch(cfg.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": cfg.key },
          signal: request.signal,
          body: JSON.stringify({
            model: cfg.deployment,
            stream: true,
            messages: [{ role: "system", content: SYSTEM }, ...parsed.data.messages],
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text();
          const msg =
            upstream.status === 429
              ? "Azure is busy right now — wait a few seconds and try again."
              : upstream.status === 400 && text.includes("content_filter")
                ? "Azure's content filter blocked this message."
                : `Azure error ${upstream.status}: ${text.slice(0, 300)}`;
          return new Response(msg, { status: upstream.status });
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                controller.close();
                return;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              let out = "";
              for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith("data:")) continue;
                const payload = t.slice(5).trim();
                if (payload === "[DONE]") continue;
                try {
                  const chunk = JSON.parse(payload);
                  const d = chunk.choices?.[0]?.delta?.content;
                  if (typeof d === "string") out += d;
                  if (chunk.choices?.[0]?.finish_reason === "content_filter")
                    out += "\n\n_(Azure's content filter stopped this reply.)_";
                } catch {
                  /* partial */
                }
              }
              if (out) {
                controller.enqueue(encoder.encode(out));
                return;
              }
            }
          },
          cancel() {
            reader.cancel();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
    },
  },
});
