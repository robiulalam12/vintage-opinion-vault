import { createFileRoute } from "@tanstack/react-router";

// Called every minute by the database scheduler. Takes no input and only
// fires shots for drip orders that are already due, so it is safe to expose.
async function handle() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runDripTick } = await import("@/lib/fake-reviews-fire.server");
  try {
    const res = await runDripTick(supabaseAdmin);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/fake-reviews/drip-tick")({
  server: { handlers: { POST: handle, GET: handle } },
});
