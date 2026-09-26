/* People Opinion Box — DMCA autofill content script.
 * Fills Google's copyright removal form, then clicks Submit and waits for Google's confirmation.
 *
 * Injected declaratively AND programmatically, so the whole file is guarded.
 * Exposes window.__pobDmcaFill() for the popup/service worker.
 */
(() => {
  if (window.__pobDmcaLoaded) return;
  window.__pobDmcaLoaded = true;

  const CFG = window.POB_DMCA_CONFIG;
  if (!CFG) return;
  const { FIELD_MAP, ADD_LINK_LABELS, SWORN_ATTRS, SWORN_KEYWORDS, FEEDBACK_KEYWORDS } = CFG;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  /* ----------------------------- field discovery ----------------------------- */

  function labelText(el) {
    const parts = [];
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) parts.push(lbl.innerText);
    }
    const wrap = el.closest("label");
    if (wrap) parts.push(wrap.innerText);
    const described = el.getAttribute("aria-describedby") || el.getAttribute("aria-labelledby");
    if (described) {
      for (const id of described.split(/\s+/)) {
        const node = document.getElementById(id);
        if (node) parts.push(node.innerText);
      }
    }
    return norm(parts.join(" "));
  }

  /** Text of nearest ancestors — catches section headings and fieldset legends.
   * Google nests checkboxes ~5 levels below the <fieldset><legend> that holds the
   * real sworn-statement wording, so also climb to the enclosing group explicitly
   * (structural, not depth-based) in case Google adds another wrapper div. */
  function contextText(el) {
    const parts = [];
    let node = el.parentElement;
    for (let i = 0; i < 8 && node; i++) {
      const text = norm(node.innerText);
      if (text && text.length < 900) parts.push(text);
      node = node.parentElement;
    }

    const group = el.closest('fieldset, [role="group"], [role="radiogroup"]');
    if (group) {
      const legend = group.querySelector("legend");
      if (legend) parts.push(norm(legend.innerText));
      const labelledBy = group.getAttribute("aria-labelledby");
      for (const id of (labelledBy || "").split(/\s+/).filter(Boolean)) {
        const node2 = document.getElementById(id);
        if (node2) parts.push(norm(node2.innerText));
      }
      const groupText = norm(group.innerText);
      if (groupText && groupText.length < 1200) parts.push(groupText);
    }
    return parts.filter(Boolean).join(" | ");
  }


  function identity(el) {
    return norm([el.getAttribute("name"), el.id].filter(Boolean).join(" "));
  }

  function fieldTexts(el) {
    return {
      strong: norm(
        [el.placeholder, el.getAttribute("aria-label"), el.getAttribute("name"), el.id].join(" "),
      ),
      label: labelText(el),
      context: contextText(el),
    };
  }

  function visible(el) {
    if (el.type === "hidden" || el.disabled || el.readOnly) return false;
    if (el.tagName === "SELECT") return true;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return true;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function allFields() {
    return Array.from(document.querySelectorAll("input, textarea, select")).filter((el) => {
      if (["checkbox", "radio", "submit", "button", "file"].includes(el.type)) return false;
      return visible(el);
    });
  }

  /** Score a candidate: higher = better. 0 = no match. Stable attrs win. */
  function score(el, spec) {
    const t = fieldTexts(el);
    const ident = identity(el);

    if (spec.attrs) {
      for (let i = 0; i < spec.attrs.length; i++) {
        const want = spec.attrs[i];
        if (ident === want) return 1000 - i;
        if (ident.split(" ").includes(want)) return 900 - i;
      }
    }

    if (spec.skip) {
      for (const s of spec.skip) {
        if (t.strong.includes(s) || t.label.includes(s)) return 0;
      }
    }

    for (const [text, weight] of [
      [t.strong, 300],
      [t.label, 200],
      [t.context, 100],
    ]) {
      if (!text) continue;
      for (let i = 0; i < spec.keywords.length; i++) {
        if (text.includes(spec.keywords[i])) return weight + (spec.keywords.length - i);
      }
    }
    return 0;
  }

  function tagAllowed(el, type) {
    const tag = el.tagName.toLowerCase();
    if (type === "select") return tag === "select";
    if (type === "textarea") return tag === "textarea";
    if (type === "text") return tag === "input" || tag === "textarea";
    return tag !== "select"; // "any" / "url-list"
  }

  function pick(spec, used) {
    let best = null;
    let bestScore = 0;
    for (const el of allFields()) {
      if (used.has(el) || !tagAllowed(el, spec.type)) continue;
      const s = score(el, spec);
      if (s > bestScore) {
        best = el;
        bestScore = s;
      }
    }
    if (best) used.add(best);
    return best;
  }

  /** Every element matching a spec, in document order. */
  function matchAll(spec) {
    return allFields().filter((el) => tagAllowed(el, spec.type) && score(el, spec) > 0);
  }

  /* -------------------------------- value setting ---------------------------- */

  function setValue(el, value) {
    if (!el || value == null || value === "") return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
    el.focus();
    if (setter) setter.call(el, value);
    else el.value = value;
    for (const type of ["input", "change", "keyup"]) {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    }
    el.blur();
    return el.value === value;
  }

  function setSelect(el, value) {
    if (!el || !value) return false;
    const want = norm(value);
    const option =
      Array.from(el.options).find((o) => norm(o.textContent) === want || norm(o.value) === want) ||
      Array.from(el.options).find((o) => norm(o.textContent).startsWith(want));
    if (!option) return false;
    el.value = option.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function tick(el) {
    if (!el) return false;
    if (el.tagName === "INPUT" && el.type === "checkbox") {
      if (!el.checked) el.click();
      if (!el.checked) {
        // Material checkboxes sometimes only respond to the visible label.
        const label = el.id
          ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
          : el.closest("label");
        label?.click();
      }
      return el.checked;
    }
    if (el.getAttribute("aria-checked") === "false") el.click();
    return el.getAttribute("aria-checked") === "true";
  }

  function checkboxes() {
    return Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));
  }

  function findAddLink() {
    const nodes = Array.from(document.querySelectorAll('a, button, [role="button"], span, div'));
    return nodes.find((n) => {
      const t = norm(n.textContent);
      if (!t || t.length > 60) return false;
      if (!ADD_LINK_LABELS.some((l) => t === l || t.startsWith(l))) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 || r.height > 0 || n.offsetParent !== null;
    });
  }

  /* --------------------------------- filling --------------------------------- */

  /** New form: one textarea, one URL per line. Legacy: N inputs + "Add additional field". */
  async function fillUrls(urls, used, onProgress) {
    const spec = FIELD_MAP.infringingUrls;

    const textarea = matchAll(spec).find((el) => el.tagName === "TEXTAREA" && !used.has(el));
    if (textarea) {
      used.add(textarea);
      const ok = setValue(textarea, urls.join("\n"));
      onProgress?.(ok ? urls.length : 0, urls.length);
      return { filled: ok ? urls.length : 0, mode: "textarea" };
    }

    let inputs = matchAll(spec).filter((el) => !used.has(el));
    let filled = 0;

    for (let i = 0; i < urls.length; i++) {
      // Make sure input #i exists — click "Add additional field" and wait for it.
      for (let attempt = 0; inputs.length <= i && attempt < 10; attempt++) {
        const link = findAddLink();
        if (!link) break;
        link.click();
        for (let waited = 0; waited < 20; waited++) {
          await sleep(50);
          inputs = matchAll(spec).filter((el) => !used.has(el));
          if (inputs.length > i) break;
        }
      }
      if (inputs.length <= i) break;
      if (setValue(inputs[i], urls[i])) filled++;
      if (filled % 10 === 0) {
        onProgress?.(filled, urls.length);
        await sleep(20);
      }
    }

    for (const input of inputs.slice(0, filled)) used.add(input);
    onProgress?.(filled, urls.length);
    return { filled, mode: "inputs" };
  }

  async function fillForm(batch, details, onProgress) {
    const used = new Set();
    const urls = batch.infringingUrls || [];
    const report = { fields: {}, urlsFilled: 0, total: urls.length };

    const set = (key, value, kind) => {
      const el = pick(FIELD_MAP[key], used);
      const ok = kind === "select" ? setSelect(el, value) : setValue(el, value);
      report.fields[key] = Boolean(ok);
      return ok;
    };

    set("country", details.country, "select");
    set("copyrightHolder", details.copyrightHolder || details.fullName);
    set("fullName", details.fullName);
    set("company", details.company);
    set("email", details.email);
    set("workDescription", batch.workDescription);
    set("authorizedExample", batch.authorizedExampleUrl);

    const urlResult = await fillUrls(urls, used, onProgress);
    report.urlsFilled = urlResult.filled;
    report.urlMode = urlResult.mode;
    report.fields["infringingUrls"] = urlResult.filled === urls.length && urls.length > 0;

    let sworn = 0;
    for (const box of checkboxes()) {
      const ident = identity(box);
      const text = `${norm(box.getAttribute("aria-label"))} | ${labelText(box)} | ${contextText(box)}`;
      const isSworn =
        SWORN_ATTRS.some((a) => ident.includes(a)) || SWORN_KEYWORDS.some((k) => text.includes(k));
      if (isSworn) {
        if (tick(box)) sworn++;
      } else if (details.tickFeedback && FEEDBACK_KEYWORDS.some((k) => text.includes(k))) {
        tick(box);
      }
    }
    report.sworn = sworn;

    set("signature", details.signature || details.fullName);
    return report;
  }

  /* ---------------------------------- state ---------------------------------- */

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(response);
      });
    });
  }

  async function api(path, body) {
    const res = await sendMessage({ type: "pob-api", path, method: "POST", body });
    if (!res?.ok) throw new Error(res?.error || "Request failed");
    return res.data;
  }

  async function loadState() {
    const store = await chrome.storage.local.get(["details", "batch"]);
    return {
      details: { ...CFG.DEFAULT_DETAILS, ...(store.details || {}) },
      batch: store.batch || null,
    };
  }

  /** Entry point used by the service worker (allFrames). */
  window.__pobDmcaFill = async () => {
    const { details, batch } = await loadState();
    if (!batch || !batch.infringingUrls?.length) return { ok: false, reason: "no-batch" };
    if (!allFields().length) return { ok: false, reason: "no-fields" };

    const report = await fillForm(batch, details, (n, total) =>
      window.__pobDmcaLog?.(`Filling URLs… ${n}/${total}`),
    );
    if (report.urlsFilled === 0 && !Object.values(report.fields).some(Boolean)) {
      return { ok: false, reason: "no-fields" };
    }
    window.__pobDmcaLog?.(`Filled ${report.urlsFilled}/${report.total} URLs. Auto-submitting…`);
    // Don't block the caller: submit + confirm runs in the background of the page.
    if (window.top === window) setTimeout(() => void batchAutoSubmit(batch), 1500);
    return { ok: true, ...report };
  };

  let batchSubmitting = false;
  async function batchAutoSubmit(batch) {
    if (batchSubmitting) return;
    batchSubmitting = true;
    const log = (m) => window.__pobDmcaLog?.(m);
    try {
      const result = await submitAndConfirm({ log });
      if (!result.ok) {
        log(`Couldn't auto-submit: ${result.reason}.\nPress Google's Submit yourself, then "Mark submitted".`);
        return;
      }
      log("Google confirmed the report. Recording it…");
      const res = await api("/api/public/dmca/confirm", {
        batchId: batch.batchId,
        caseRef: result.caseRef || "",
      });
      await chrome.storage.local.remove("batch");
      log(`Submitted and recorded — ${res.reported} URLs marked as reported.`);
    } catch (error) {
      log(`Submitted, but recording failed: ${error.message}. Press "Mark submitted".`);
    } finally {
      batchSubmitting = false;
    }
  }


  /* ------------------------- single-report entry points ---------------------- */

  /** Fill from an explicit payload (single-report mode) instead of storage. */
  window.__pobDmcaFillPayload = async (payload) => {
    const store = await chrome.storage.local.get(["details"]);
    const details = { ...CFG.DEFAULT_DETAILS, ...(store.details || {}) };
    if (!payload?.infringingUrls?.length) return { ok: false, reason: "no-batch" };
    if (!allFields().length) return { ok: false, reason: "no-fields" };
    const report = await fillForm(payload, details, () => {});
    if (report.urlsFilled === 0 && !Object.values(report.fields).some(Boolean)) {
      return { ok: false, reason: "no-fields" };
    }
    return { ok: true, ...report };
  };

  function findSubmitButton() {
    const nodes = Array.from(
      document.querySelectorAll('button, input[type="submit"], [role="button"], a'),
    );
    return nodes.find((n) => {
      const t = norm(n.innerText || n.value || n.getAttribute("aria-label"));
      if (!t) return false;
      if (!/^(submit|send|submit request|submit notice|submit report)$/.test(t)) return false;
      if (n.disabled) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 || r.height > 0 || n.offsetParent !== null;
    });
  }

  /** reCAPTCHA v2 sitekey, from the widget div or the challenge iframe. */
  function recaptchaSiteKey() {
    const widget = document.querySelector("[data-sitekey]");
    if (widget) return widget.getAttribute("data-sitekey");
    const frame = Array.from(document.querySelectorAll("iframe")).find((f) =>
      /recaptcha\/api2\/anchor|recaptcha\/enterprise\/anchor/.test(f.src || ""),
    );
    if (!frame) return null;
    try {
      return new URL(frame.src).searchParams.get("k");
    } catch {
      return null;
    }
  }

  function recaptchaSolved() {
    const field = document.querySelector(
      'textarea#g-recaptcha-response, textarea[name="g-recaptcha-response"]',
    );
    return Boolean(field && field.value && field.value.length > 20);
  }

  /** Inject a solved token everywhere Google looks for it. */
  function applyRecaptchaToken(token) {
    const fields = Array.from(
      document.querySelectorAll(
        'textarea#g-recaptcha-response, textarea[name="g-recaptcha-response"], input[name="g-recaptcha-response"]',
      ),
    );
    if (!fields.length) {
      const holder = document.createElement("textarea");
      holder.id = "g-recaptcha-response";
      holder.name = "g-recaptcha-response";
      holder.style.display = "none";
      document.forms[0]?.appendChild(holder) ?? document.body.appendChild(holder);
      fields.push(holder);
    }
    for (const field of fields) {
      field.value = token;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return fields.length > 0;
  }

  /* ------------------------------ auto submit -------------------------------- */

  const CONFIRM_KEYWORDS = [
    "thank you for your report",
    "thanks for your report",
    "we have received your",
    "we've received your",
    "your report has been submitted",
    "your request has been submitted",
    "we received your legal request",
    "thanks for contacting",
    "reference number",
  ];

  function pageLooksConfirmed() {
    const text = norm(document.body?.innerText || "");
    if (!text) return false;
    if (CONFIRM_KEYWORDS.some((k) => text.includes(k))) return true;
    return /thank you/.test(text) && !findSubmitButton();
  }

  function extractCaseRef() {
    const text = document.body?.innerText || "";
    const match =
      text.match(/reference number[^\w]*([\w-]{4,})/i) ||
      text.match(/case\s*(?:id|number)[^\w]*([\w-]{4,})/i);
    return match?.[1] ?? "";
  }

  const isVisible = (n) => {
    if (!n) return false;
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(n);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };

  /** A visible (v2 checkbox / challenge) reCAPTCHA that still needs an answer.
   *  Google's form runs invisible reCAPTCHA on Submit and falls back to a visible
   *  v2 checkbox only when it doesn't trust the click — so this appears AFTER Submit. */
  function pendingCaptcha() {
    if (recaptchaSolved()) return null;
    const frame = Array.from(document.querySelectorAll("iframe")).find(
      (f) =>
        /recaptcha\/(api2|enterprise)\/anchor/.test(f.src || "") &&
        !/size=invisible/.test(f.src || "") &&
        isVisible(f),
    );
    if (!frame) return null;
    try {
      const u = new URL(frame.src);
      return { siteKey: u.searchParams.get("k"), enterprise: /\/enterprise\//.test(u.pathname) };
    } catch {
      return null;
    }
  }

  /** Visible validation errors Google shows under fields / in the alert area. */
  function visibleErrors() {
    const out = new Set();
    const nodes = document.querySelectorAll(
      '.alert-area, .notification-area, [role="alert"], .error-message, [class*="error"]',
    );
    for (const n of nodes) {
      if (n.closest("#pob-dmca-panel, #pob-dmca-runner") || !isVisible(n)) continue;
      const t = (n.innerText || "").replace(/\s+/g, " ").trim();
      if (t && t.length < 200) out.add(t);
    }
    return Array.from(out).slice(0, 4);
  }

  /** Real mouse click (trusted event) through the service worker; falls back to
   *  a synthetic pointer sequence + element.click() if that isn't possible. */
  async function realClick(btn) {
    btn.scrollIntoView({ block: "center", inline: "center" });
    await sleep(400);
    const r = btn.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === btn || btn.contains(hit))) {
      try {
        const res = await sendMessage({ type: "pob-trusted-click", x, y });
        if (res?.ok) return "trusted";
      } catch {
        /* fall through */
      }
    }
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
    btn.dispatchEvent(new PointerEvent("pointerdown", opts));
    btn.dispatchEvent(new MouseEvent("mousedown", opts));
    btn.dispatchEvent(new PointerEvent("pointerup", opts));
    btn.dispatchEvent(new MouseEvent("mouseup", opts));
    btn.click();
    return "synthetic";
  }

  async function solvePendingCaptcha(cap, log) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      log(`Google asked for a reCAPTCHA — solving via 2Captcha (try ${attempt}/3, 20–90s)…`);
      const res = await sendMessage({
        type: "pob-solve-captcha",
        siteKey: cap.siteKey,
        enterprise: cap.enterprise,
        pageUrl: window.location.href,
      });
      if (res?.ok && res.token) {
        applyRecaptchaToken(res.token);
        try {
          await sendMessage({ type: "pob-recaptcha-callback", token: res.token });
        } catch {
          /* textarea value is still set */
        }
        return { ok: true };
      }
      if (res?.error === "no-captcha-key") return { ok: false, reason: "no-captcha-key" };
      await sleep(3000);
    }
    return { ok: false, reason: "captcha-unsolved" };
  }

  /**
   * Click Google's Submit, handle the reCAPTCHA fallback, re-click as needed,
   * and wait for the confirmation page. Returns { ok, caseRef } or { ok:false, reason }.
   */
  async function submitAndConfirm({ log = () => {}, cancelled = () => false } = {}) {
    let lastErrors = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (cancelled()) return { ok: false, reason: "cancelled" };
      if (pageLooksConfirmed()) return { ok: true, caseRef: extractCaseRef() };

      const cap = pendingCaptcha();
      if (cap?.siteKey) {
        const solved = await solvePendingCaptcha(cap, log);
        if (!solved.ok) return { ok: false, reason: solved.reason };
        await sleep(1500);
        if (pageLooksConfirmed()) return { ok: true, caseRef: extractCaseRef() };
      }

      const btn = findSubmitButton();
      if (!btn) {
        await sleep(2000);
        if (pageLooksConfirmed()) return { ok: true, caseRef: extractCaseRef() };
        return { ok: false, reason: "Submit button not found" };
      }
      const how = await realClick(btn);
      log(`Clicked Submit (${how}, attempt ${attempt}/4). Waiting for Google…`);

      for (let i = 0; i < 40; i++) {
        await sleep(1000);
        if (cancelled()) return { ok: false, reason: "cancelled" };
        if (pageLooksConfirmed()) return { ok: true, caseRef: extractCaseRef() };
        if (pendingCaptcha()) break; // re-loop: solve then click again
        lastErrors = visibleErrors();
        if (i >= 6 && lastErrors.length) break;
      }
      if (lastErrors.length) log(`Google says: ${lastErrors.join(" · ")}\nRetrying…`);
    }
    return {
      ok: false,
      reason: lastErrors.length ? lastErrors.join(" · ") : "no confirmation from Google",
    };
  }

  window.__pobDmcaInternals = {
    sleep,
    norm,
    api,
    sendMessage,
    allFields,
    findSubmitButton,
    recaptchaSiteKey,
    recaptchaSolved,
    applyRecaptchaToken,
    submitAndConfirm,
    pageLooksConfirmed,
    extractCaseRef,
  };

  /* ------------------------------ floating panel ----------------------------- */

  const isTopFrame = window.top === window;

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "pob-dmca-panel";
    panel.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483647",
      "width:288px",
      "font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif",
      "background:#ffffff",
      "color:#0f172a",
      "border:1px solid #d7dce5",
      "border-radius:14px",
      "box-shadow:0 12px 30px rgba(15,23,42,.18)",
      "padding:14px",
    ].join(";");
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:#1d4ed8;color:#fff;font-weight:700;font-size:12px">P</span>
        <strong style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;flex:1">DMCA autofill</strong>
        <button id="pob-hide" style="all:unset;cursor:pointer;color:#7a8699;font-size:16px;line-height:1;padding:0 2px">&times;</button>
      </div>
      <div id="pob-status" style="color:#516079;margin-bottom:10px;white-space:pre-wrap">Loading batch…</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button id="pob-fill" style="all:unset;cursor:pointer;text-align:center;padding:8px;border-radius:9px;background:#1d4ed8;color:#fff;font-weight:600">Fill this form</button>
        <input id="pob-case" placeholder="Google case ID (optional)" style="all:unset;box-sizing:border-box;width:100%;padding:7px 9px;border:1px solid #d7dce5;border-radius:9px" />
        <button id="pob-done" style="all:unset;cursor:pointer;text-align:center;padding:8px;border-radius:9px;border:1px solid #d7dce5;font-weight:600">Mark submitted</button>
        <button id="pob-release" style="all:unset;cursor:pointer;text-align:center;padding:6px;border-radius:9px;color:#b3261e;font-size:12px">Release batch</button>
      </div>
      <p style="margin:10px 0 0;color:#7a8699;font-size:11px">Fills the form, then submits it for you automatically.</p>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  async function initPanel() {
    if (!isTopFrame || !document.body || document.getElementById("pob-dmca-panel")) return;
    const runStore = await chrome.storage.local.get(["run"]);
    if (runStore.run?.active) return; // runner.js owns the UI during a 1-by-1 run
    const { batch } = await loadState();

    const panel = buildPanel();
    const status = panel.querySelector("#pob-status");
    const log = (msg) => {
      status.textContent = msg;
    };
    window.__pobDmcaLog = log;

    if (!batch) log("No batch reserved — open the extension popup and reserve URLs.");
    else log(`${batch.urlCount} URLs reserved · batch ${String(batch.batchId).slice(0, 8)}`);

    panel.querySelector("#pob-hide").addEventListener("click", () => panel.remove());

    panel.querySelector("#pob-fill").addEventListener("click", async () => {
      log("Filling form…");
      try {
        const result = await sendMessage({ type: "pob-fill-active-tab" });
        if (!result?.ok) {
          log(
            result?.reason === "no-batch"
              ? "No batch reserved — reserve URLs in the popup first."
              : "Couldn't find the form fields. Make the full form visible, then retry.",
          );
          return;
        }
        const missing = Object.entries(result.fields || {})
          .filter(([, ok]) => !ok)
          .map(([key]) => key);
        log(
          `Filled ${result.urlsFilled}/${result.total} URLs, ${result.sworn || 0} confirmation box(es).` +
            (missing.length ? `\nCheck manually: ${missing.join(", ")}.` : "") +
            "\nAuto-submitting…",
        );
      } catch (error) {
        log(`Error: ${error.message}`);
      }
    });

    panel.querySelector("#pob-done").addEventListener("click", async () => {
      const state = await loadState();
      if (!state.batch) return log("No reserved batch to confirm.");
      log("Marking submitted…");
      try {
        const caseRef = panel.querySelector("#pob-case").value.trim();
        const result = await api("/api/public/dmca/confirm", {
          batchId: state.batch.batchId,
          caseRef,
        });
        await chrome.storage.local.remove("batch");
        log(`Done — ${result.reported} URLs recorded as reported.`);
      } catch (error) {
        log(`Error: ${error.message}`);
      }
    });

    panel.querySelector("#pob-release").addEventListener("click", async () => {
      const state = await loadState();
      if (!state.batch) return log("No reserved batch to release.");
      log("Releasing batch…");
      try {
        const result = await api("/api/public/dmca/release", { batchId: state.batch.batchId });
        await chrome.storage.local.remove("batch");
        log(`Released ${result.released} URLs back to the pool.`);
      } catch (error) {
        log(`Error: ${error.message}`);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void initPanel());
  } else {
    void initPanel();
  }
  // Google renders the form progressively / behind a "show form" button.
  setTimeout(() => void initPanel(), 2000);
  setTimeout(() => void initPanel(), 5000);
})();
