const FORM_URL = "https://reportcontent.google.com/forms/legal_other_geo?product=geo&uraw&hl=en-GB";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function details() { return (await chrome.storage.local.get("details")).details || {}; }
async function apiCall({ path, method = "GET", body }) {
  const d = await details();
  if (!d.apiKey) return { ok: false, error: "Add the shared extension API key in Settings." };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(`${String(d.apiBase || "https://peopleopinionbox.com").replace(/\/+$/, "")}${path}`, {
      method, signal: controller.signal,
      headers: { "content-type": "application/json", "x-api-key": d.apiKey },
      body: body ? JSON.stringify(body) : undefined
    });
    clearTimeout(timer);
    const data = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, data } : { ok: false, error: data.error || `Request failed (${response.status})`, data };
  } catch (error) { return { ok: false, error: error.name === "AbortError" ? "Request timed out." : String(error.message || error) }; }
}
async function solveCaptcha({ siteKey, pageUrl, enterprise, invisible, dataS }) {
  const key = String((await details()).twoCaptchaKey || "").trim();
  if (!key) return { ok: false, fatal: true, error: "No 2Captcha key in Settings." };
  const params = { key, method: "userrecaptcha", googlekey: siteKey, pageurl: pageUrl, json: "1", soft_id: "", userAgent: navigator.userAgent };
  if (enterprise) params.enterprise = "1";
  if (invisible) params.invisible = "1";
  if (dataS) params["data-s"] = dataS;
  const create = new URL("https://2captcha.com/in.php");
  Object.entries(params).forEach(([k,v]) => v !== "" && create.searchParams.set(k,v));
  const started = await fetch(create, { method: "POST" }).then((r) => r.json()).catch(() => null);
  if (!started) return { ok: false, error: "2Captcha unreachable." };
  if (started.status !== 1) {
    const code = String(started.request || "unknown");
    const fatal = /ERROR_WRONG_USER_KEY|ERROR_KEY_DOES_NOT_EXIST|ERROR_ZERO_BALANCE|IP_BANNED/.test(code);
    if (/ERROR_NO_SLOT_AVAILABLE/.test(code)) await sleep(6000);
    return { ok: false, fatal, error: `2Captcha: ${code}` };
  }
  await sleep(12000);
  for (let i = 0; i < 40; i++) {
    const poll = new URL("https://2captcha.com/res.php");
    Object.entries({ key, action: "get", id: started.request, json: "1" }).forEach(([k,v]) => poll.searchParams.set(k,v));
    const answer = await fetch(poll).then((r) => r.json()).catch(() => null);
    if (answer?.status === 1) return { ok: true, token: answer.request, id: started.request };
    if (answer?.request && answer.request !== "CAPCHA_NOT_READY") return { ok: false, error: `2Captcha: ${answer.request}` };
    await sleep(5000);
  }
  return { ok: false, error: "2Captcha timed out." };
}
async function reportBadCaptcha(id) {
  const key = String((await details()).twoCaptchaKey || "").trim();
  if (!key || !id) return { ok: false };
  const u = new URL("https://2captcha.com/res.php");
  Object.entries({ key, action: "reportbad", id, json: "1" }).forEach(([k,v]) => u.searchParams.set(k,v));
  await fetch(u).catch(() => null);
  return { ok: true };
}
async function trustedClick(tabId, x, y) {
  const target = { tabId }; let attached = false;
  try {
    try { await chrome.debugger.attach(target, "1.3"); attached = true; } catch (error) { if (!/already attached/i.test(String(error.message))) throw error; }
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await sleep(70);
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    return { ok: true };
  } catch (error) { return { ok: false, error: String(error.message || error) }; }
  finally { if (attached) await chrome.debugger.detach(target).catch(() => {}); }
}
async function trustedType(tabId, text, keys=[]) {
  const target = { tabId }; let attached = false;
  try {
    try { await chrome.debugger.attach(target, "1.3"); attached = true; } catch (error) { if (!/already attached/i.test(String(error.message))) throw error; }
    if (text) await chrome.debugger.sendCommand(target, "Input.insertText", { text });
    const codes = { ArrowDown: 40, Enter: 13, Escape: 27, Tab: 9 };
    for (const key of keys) { await sleep(250); for (const type of ["rawKeyDown", "keyUp"]) await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key] }); }
    return { ok: true };
  } catch (error) { return { ok: false, error: String(error.message || error) }; }
  finally { if (attached) await chrome.debugger.detach(target).catch(() => {}); }
}
async function recaptchaCallback(tabId, token) {
  await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", args: [token], func: (value) => {
    const cfg = window.___grecaptcha_cfg; const seen = new Set();
    const walk = (node, depth = 0) => { if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return; seen.add(node); Object.entries(node).forEach(([key, child]) => { if (key === "callback" && typeof child === "function") { try { child(value); } catch {} } else walk(child, depth + 1); }); };
    Object.values(cfg?.clients || {}).forEach((client) => walk(client));
  }}).catch(() => {});
  return { ok: true };
}
async function startRun(message) {
  await chrome.storage.local.set({ run: { active: true, paused: false, stage: "idle", current: null, orderId: message.orderId, orderName: message.orderName, done: message.submitted || 0, total: message.total || 0, startedAt: Date.now() } });
  const tab = await chrome.tabs.create({ url: FORM_URL });
  const { run } = await chrome.storage.local.get("run");
  await chrome.storage.local.set({ run: { ...run, tabId: tab.id } });
  return { ok: true, tabId: tab.id };
}
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.status !== "complete") return; void (async () => { const { run } = await chrome.storage.local.get("run"); if (!run?.active || (run.tabId && run.tabId !== tabId)) return; await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["config.js", "content.js", "runner.js"] }).catch(() => {}); })(); });
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "policy-api") { void apiCall(message).then(reply); return true; }
  if (message?.type === "policy-captcha-bad") { void reportBadCaptcha(message.id).then(reply); return true; }
  if (message?.type === "policy-captcha") { void solveCaptcha(message).then(reply); return true; }
  if (message?.type === "policy-click") { void trustedClick(sender.tab?.id, message.x, message.y).then(reply); return true; }
  if (message?.type === "policy-type") { void trustedType(sender.tab?.id, message.text, message.keys || []).then(reply); return true; }
  if (message?.type === "policy-captcha-callback") { void recaptchaCallback(sender.tab?.id, message.token).then(reply); return true; }
  if (message?.type === "policy-start") { void startRun(message).then(reply); return true; }
  return false;
});
