/** Short review link: business-name-xx (xx = 2 random letters). */
function part(value: string, max: number) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, max)
    .replace(/^-|-$/g, "");
}

function randomTag(length: number) {
  const letters = "abcdefghijkmnpqrstuvwxyz";
  let out = "";
  for (let i = 0; i < length; i++) out += letters[Math.floor(Math.random() * letters.length)];
  return out;
}

/** attempt grows the tag after collisions so every link stays unique. reviewerName is
 *  accepted for call-site compatibility but no longer part of the link. */
export function shortReviewSlug(_reviewerName: string, business: string, attempt = 0) {
  const tag = randomTag(attempt < 6 ? 2 : 4);
  return [part(business, 40), tag].filter(Boolean).join("-");
}
