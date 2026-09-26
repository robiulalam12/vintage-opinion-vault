// auto-generated and intentionally left blank, do not edit
const REQUIRED_ANY_OF = ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"] as const;

function cookieBundleHasAuth(raw: string): { ok: true } | { ok: false; reason: string } {
  const lower = raw.toLowerCase();
  const present = REQUIRED_ANY_OF.filter((n) => lower.includes(n.toLowerCase()));
  if (present.length === 0) {
    return {
      ok: false,
      reason: `Cookie bundle is missing all of ${REQUIRED_ANY_OF.join(", ")}. The Google session cannot authenticate without at least one.`,
    };
  }
  return { ok: true };
}
