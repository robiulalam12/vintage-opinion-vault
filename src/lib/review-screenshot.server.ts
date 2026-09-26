/**
 * Server-only: full-page screenshot of a live review page (Firecrawl) uploaded
 * to the linked Google Drive and shared publicly.
 */

const FIRECRAWL = "https://connector-gateway.lovable.dev/firecrawl/v2";
const DRIVE = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const DRIVE_UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3";
const ROOT_FOLDER = "PeopleOpinionBox Screenshots";

function keys() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const firecrawl = process.env["FIRECRAWL_API_KEY"];
  const drive = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovable) throw new Error("LOVABLE_API_KEY is not set");
  if (!firecrawl) throw new Error("Firecrawl is not connected");
  if (!drive) throw new Error("Google Drive is not connected");
  return { lovable, firecrawl, drive };
}

async function failIfBad(res: Response, what: string) {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${what} failed [${res.status}]: ${body.slice(0, 300)}`);
  }
}

export async function captureFullPage(url: string): Promise<Uint8Array> {
  const k = keys();
  const call = () =>
    fetch(`${FIRECRAWL}/scrape`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${k.lovable}`,
        "X-Connection-Api-Key": k.firecrawl,
      },
      body: JSON.stringify({
        url,
        formats: [{ type: "screenshot", fullPage: true }],
        waitFor: 3000,
        maxAge: 0,
        mobile: true,
      }),
    });
  // Firecrawl allows ~16 requests/minute; on 429 wait as told and try again.
  let res = await call();
  for (let attempt = 0; res.status === 429 && attempt < 6; attempt++) {
    const text = await res.text();
    const header = Number(res.headers.get("retry-after"));
    const fromBody = Number(/retry after (\d+)s/i.exec(text)?.[1]);
    const secs = header > 0 ? header : fromBody > 0 ? fromBody : 10;
    await new Promise((r) => setTimeout(r, (secs + 1 + Math.random() * 3) * 1000));
    res = await call();
  }
  await failIfBad(res, "Screenshot");
  const payload = (await res.json()) as { data?: { screenshot?: string }; screenshot?: string };
  const shot = payload.data?.screenshot ?? payload.screenshot;
  if (!shot) throw new Error("Screenshot service returned no image.");
  if (shot.startsWith("data:")) {
    return Uint8Array.from(Buffer.from(shot.split(",")[1] ?? "", "base64"));
  }
  const img = await fetch(shot);
  await failIfBad(img, "Screenshot download");
  return new Uint8Array(await img.arrayBuffer());
}

function driveHeaders(extra: Record<string, string> = {}) {
  const k = keys();
  return { authorization: `Bearer ${k.lovable}`, "X-Connection-Api-Key": k.drive, ...extra };
}

export async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const safe = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q =
    `name='${safe}' and mimeType='application/vnd.google-apps.folder' and trashed=false` +
    (parentId ? ` and '${parentId}' in parents` : "");
  const list = await fetch(`${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, {
    headers: driveHeaders(),
  });
  await failIfBad(list, "Drive folder lookup");
  const found = ((await list.json()) as { files?: { id: string }[] }).files?.[0];
  if (found) return found.id;

  const create = await fetch(`${DRIVE}/files?fields=id`, {
    method: "POST",
    headers: driveHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  await failIfBad(create, "Drive folder create");
  return ((await create.json()) as { id: string }).id;
}

export async function uploadPng(bytes: Uint8Array, name: string, folderId: string) {
  const boundary = `pob${crypto.randomUUID().replace(/-/g, "")}`;
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: "image/png" });
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: image/png\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: driveHeaders({ "content-type": `multipart/related; boundary=${boundary}` }),
    body,
  });
  await failIfBad(res, "Drive upload");
  return (await res.json()) as { id: string; webViewLink?: string };
}

export async function makePublic(fileId: string) {
  const res = await fetch(`${DRIVE}/files/${fileId}/permissions`, {
    method: "POST",
    headers: driveHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  await failIfBad(res, "Drive share");
}

/** Full pipeline. Returns the public Drive link. */
export async function screenshotToDrive(pageUrl: string, fileName: string, orderName: string) {
  const withFlag = pageUrl + (pageUrl.includes("?") ? "&" : "?") + "screenshot=1";
  const bytes = await captureFullPage(withFlag);
  const root = await ensureFolder(ROOT_FOLDER);
  const folder = await ensureFolder(orderName.slice(0, 100) || "Order", root);
  const file = await uploadPng(bytes, fileName, folder);
  await makePublic(file.id);
  return {
    fileId: file.id,
    url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view?usp=sharing`,
  };
}

/** Removes a previous screenshot so retakes don't pile up in Drive. */
export async function deleteDriveFile(fileId: string) {
  const res = await fetch(`${DRIVE}/files/${fileId}`, { method: "DELETE", headers: driveHeaders() });
  if (!res.ok && res.status !== 404) await failIfBad(res, "Drive delete");
}
