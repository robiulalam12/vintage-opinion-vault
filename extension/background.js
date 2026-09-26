/* Service worker: proxies dashboard API calls and triggers the form filler. */

const DEFAULT_API_BASE = "https://peopleopinionbox.com";

const GOOGLE_FORM_URL =
  "https://support.google.com/legal/contact/lr_dmca?product=geo&uraw=&hl=en-GB";

const FORM_URL_PREFIXES = [
  "https://support.google.com/legal/contact/lr_dmca",
  "https://support.google.com/legal/",
  "https://reportcontent.google.com/forms/",
];

const DEFAULT_TWOCAPTCHA_KEY = "198d7aa18c85d7f16929fd671988cd6b";

const isFormUrl = (url) => FORM_URL_PREFIXES.some((p) => String(url || "").startsWith(p));

async function storedDetails() {
  const store = await chrome.storage.local.get(["details"]);
  return store.details || {};
}

async function apiCall({ path, method = "GET", body }) {
  const d = await storedDetails();
  const base = String(d.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
  if (!d.apiKey) return { ok: false, error: "Add your API key in Settings first." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-api-key": d.apiKey },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, error: `Unexpected response (${res.status}) from ${base}` };
    }
    if (!res.ok) return { ok: false, error: data.error || `Request failed (${res.status})` };
    return { ok: true, data };
  } catch (error) {
    const message =
      error?.name === "AbortError" ? "Request timed out (30s)." : String(error?.message || error);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function fillTab(tabId) {
  // Idempotent injection — both scripts guard against double execution.
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["config.js", "content.js", "runner.js"],
    });
  } catch (error) {
    return { ok: false, reason: "inject-failed", error: String(error?.message || error) };
  }

  let results = [];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: async () => {
        if (typeof window.__pobDmcaFill !== "function") return { ok: false, reason: "not-ready" };
        try {
          return await window.__pobDmcaFill();
        } catch (error) {
          return { ok: false, reason: "error", error: String(error?.message || error) };
        }
      },
    });
  } catch (error) {
    return { ok: false, reason: "exec-failed", error: String(error?.message || error) };
  }

  const values = results.map((r) => r?.result).filter(Boolean);
  const success = values.find((v) => v.ok);
  if (success) return success;
  if (values.some((v) => v.reason === "no-batch")) return { ok: false, reason: "no-batch" };
  return { ok: false, reason: values[0]?.reason || "no-fields", error: values[0]?.error };
}


/* ------------------------------ 2Captcha solver ---------------------------- */

const CAPTCHA_IN = "https://2captcha.com/in.php";
const CAPTCHA_RES = "https://2captcha.com/res.php";

async function solveRecaptcha(msg) {
  // One retry: 2Captcha occasionally returns UNSOLVABLE on the first attempt.
  const first = await solveRecaptchaOnce(msg);
  if (first.ok) return first;
  if (!/UNSOLVABLE|timed out/i.test(String(first.error || ""))) return first;
  return solveRecaptchaOnce(msg);
}

async function solveRecaptchaOnce({ siteKey, pageUrl, enterprise }) {
  const d = await storedDetails();
  const key = String(d.twoCaptchaKey || DEFAULT_TWOCAPTCHA_KEY).trim();
  if (!key) return { ok: false, error: "no-captcha-key" };

  const create = new URL(CAPTCHA_IN);
  create.searchParams.set("key", key);
  create.searchParams.set("method", "userrecaptcha");
  create.searchParams.set("googlekey", siteKey);
  create.searchParams.set("pageurl", pageUrl);
  create.searchParams.set("json", "1");
  if (enterprise) create.searchParams.set("enterprise", "1");

  let started;
  try {
    started = await (await fetch(create, { method: "POST" })).json();
  } catch (error) {
    return { ok: false, error: `2Captcha unreachable: ${String(error?.message || error)}` };
  }
  if (started.status !== 1) return { ok: false, error: `2Captcha: ${started.request}` };

  const id = started.request;
  const poll = new URL(CAPTCHA_RES);
  poll.searchParams.set("key", key);
  poll.searchParams.set("action", "get");
  poll.searchParams.set("id", id);
  poll.searchParams.set("json", "1");

  // Solvers usually answer in 15-60s; give up after ~150s.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await (await fetch(poll)).json();
      if (res.status === 1) return { ok: true, token: res.request };
      if (res.request && res.request !== "CAPCHA_NOT_READY") {
        return { ok: false, error: `2Captcha: ${res.request}` };
      }
    } catch {
      /* transient — keep polling */
    }
  }
  return { ok: false, error: "2Captcha timed out" };
}

async function startRun(config) {
  await chrome.storage.local.set({
    run: {
      active: true,
      paused: false,
      stage: "idle",
      current: null,
      done: 0,
      skipped: 0,
      total: config.total || 0,
      orderId: config.orderId,
      orderName: config.orderName || "",
      autoSubmit: false,
      delay: config.delay || 8,
      startedAt: Date.now(),
    },
  });

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => isFormUrl(t.url));
  let tabId = existing?.id;
  if (tabId) {
    await chrome.tabs.update(tabId, { active: true, url: GOOGLE_FORM_URL });
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    const created = await chrome.tabs.create({ url: GOOGLE_FORM_URL });
    tabId = created.id;
  }
  const store = await chrome.storage.local.get(["run"]);
  await chrome.storage.local.set({ run: { ...(store.run || {}), runTabId: tabId } });
  return { ok: true, tabId };
}

/* Google's confirmation / interstitial pages are not covered by the declarative
 * content_scripts match list, so the runner would die right after Submit and the
 * run would stall. Re-inject it on every completed navigation of the run tab. */
async function startCapture(config) {
  await chrome.storage.local.set({
    capture: {
      active: true,
      paused: false,
      current: null,
      done: 0,
      skipped: 0,
      total: config.total || 0,
      orderId: config.orderId,
      orderName: config.orderName || "",
      startedAt: Date.now(),
    },
  });
  const created = await chrome.tabs.create({ url: "https://www.google.com/maps" });
  const store = await chrome.storage.local.get(["capture"]);
  await chrome.storage.local.set({
    capture: { ...(store.capture || {}), captureTabId: created.id },
  });
  return { ok: true, tabId: created.id };
}

async function reinjectCapture(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["config.js", "capture.js"],
    });
  } catch {
    /* blocked page — the declarative content script still covers /maps/* */
  }
}

async function reinjectRunner(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["config.js", "content.js", "runner.js"],
    });
  } catch {
    /* chrome:// or otherwise blocked page — the panel just won't appear there */
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  void (async () => {
    const { run } = await chrome.storage.local.get(["run"]);
    if (!run?.active) return;
    if (run.runTabId != null && run.runTabId !== tabId) return;
    await reinjectRunner(tabId);
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  void (async () => {
    const { capture } = await chrome.storage.local.get(["capture"]);
    if (!capture?.active) return;
    if (capture.captureTabId != null && capture.captureTabId !== tabId) return;
    if (!/^https:\/\/(www\.)?google\.com\//.test(String(tab?.url || ""))) return;
    await reinjectCapture(tabId);
  })();
});

/* ------------------------- real (trusted) mouse click ---------------------- */

// Uses the DevTools protocol to send a genuine left click at page coordinates.
// Google's form ignores some synthetic clicks; this is identical to a human click.
async function trustedClick(tabId, x, y) {
  const target = { tabId };
  let attachedHere = false;
  try {
    try {
      await chrome.debugger.attach(target, "1.3");
      attachedHere = true;
    } catch (error) {
      if (!/already attached/i.test(String(error?.message || error))) throw error;
    }
    const send = (params) => chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", params);
    await send({ type: "mouseMoved", x, y });
    await send({ type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 60));
    await send({ type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  } finally {
    if (attachedHere) {
      try {
        await chrome.debugger.detach(target);
      } catch {
        /* already gone */
      }
    }
  }
}

// After injecting a 2Captcha token, fire the page's own reCAPTCHA callback
// (it lives in the page's JS world, which content scripts can't see).
async function fireRecaptchaCallback(tabId, token) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [token],
      func: (tok) => {
        const cfg = window.___grecaptcha_cfg;
        if (!cfg || !cfg.clients) return { called: 0 };
        let called = 0;
        const seen = new Set();
        const walk = (obj, depth) => {
          if (!obj || typeof obj !== "object" || depth > 5 || seen.has(obj)) return;
          seen.add(obj);
          for (const key of Object.keys(obj)) {
            const v = obj[key];
            if (key === "callback") {
              const fn = typeof v === "function" ? v : typeof v === "string" ? window[v] : null;
              if (typeof fn === "function") {
                try {
                  fn(tok);
                  called++;
                } catch {
                  /* ignore */
                }
              }
            } else if (v && typeof v === "object" && !(v instanceof Node)) {
              walk(v, depth + 1);
            }
          }
        };
        for (const id of Object.keys(cfg.clients)) walk(cfg.clients[id], 0);
        return { called };
      },
    });
    return { ok: true, ...(res?.result || {}) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "pob-trusted-click") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "no-tab" });
      return false;
    }
    void trustedClick(tabId, message.x, message.y).then(sendResponse);
    return true;
  }

  if (message?.type === "pob-recaptcha-callback") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "no-tab" });
      return false;
    }
    void fireRecaptchaCallback(tabId, message.token).then(sendResponse);
    return true;
  }

  if (message?.type === "pob-api") {
    void apiCall(message).then(sendResponse);
    return true;
  }

  if (message?.type === "pob-solve-captcha") {
    void solveRecaptcha(message).then(sendResponse);
    return true;
  }

  if (message?.type === "pob-start-capture") {
    void startCapture(message).then(sendResponse);
    return true;
  }

  if (message?.type === "pob-start-run") {
    void startRun(message).then(sendResponse);
    return true;
  }

  if (message?.type === "pob-fill-active-tab") {
    (async () => {
      let tabId = message.tabId ?? sender.tab?.id;
      if (!tabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id;
      }
      if (!tabId) return sendResponse({ ok: false, reason: "no-tab" });
      sendResponse(await fillTab(tabId));
    })();
    return true;
  }

  return false;
});
