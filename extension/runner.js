/* People Opinion Box — 1-by-1 DMCA report runner.
 *
 * Drives a full run on Google's copyright form: claim one review from the
 * dashboard, fill the form with that review's own evidence, solve reCAPTCHA
 * (2Captcha, optional), show a cancellable countdown, submit, detect the
 * confirmation page, record it, then reload a blank form and repeat.
 *
 * State lives in chrome.storage.local.run so a page navigation resumes the run.
 * Loaded declaratively AND programmatically → fully guarded.
 */
(() => {
  if (window.__pobDmcaRunnerLoaded) return;
  window.__pobDmcaRunnerLoaded = true;

  const CFG = window.POB_DMCA_CONFIG;
  const INT = window.__pobDmcaInternals;
  if (!CFG || !INT || window.top !== window) return;

  const { sleep, norm, api, sendMessage } = INT;

  const CONFIRM_KEYWORDS = [
    "thank you for your report",
    "thanks for your report",
    "we have received your",
    "we've received your",
    "your report has been submitted",
    "your request has been submitted",
    "we received your legal request",
    "your legal request",
    "reference number",
  ];

  const loadRun = async () => (await chrome.storage.local.get(["run"])).run || null;
  const saveRun = async (run) => {
    await chrome.storage.local.set({ run });
    return run;
  };
  const patchRun = async (patch) => {
    const run = (await loadRun()) || {};
    return saveRun({ ...run, ...patch });
  };
  const clearRun = () => chrome.storage.local.remove("run");

  /* --------------------------------- panel ---------------------------------- */

  let panel = null;
  let els = {};

  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    panel = document.createElement("div");
    panel.id = "pob-dmca-runner";
    panel.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483647",
      "width:308px",
      "font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif",
      "background:#fff",
      "color:#0f172a",
      "border:1px solid #d7dce5",
      "border-radius:14px",
      "box-shadow:0 14px 34px rgba(15,23,42,.2)",
      "padding:14px",
    ].join(";");
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:#1d4ed8;color:#fff;font-weight:700;font-size:12px">P</span>
        <strong style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;flex:1">1-by-1 DMCA run</strong>
        <span id="pob-r-count" style="font-size:11px;color:#7a8699"></span>
      </div>
      <div id="pob-r-bar" style="height:6px;border-radius:999px;background:#eef1f6;overflow:hidden;margin-bottom:9px">
        <div id="pob-r-fill" style="height:100%;width:0%;background:#1d4ed8;transition:width .3s"></div>
      </div>
      <div id="pob-r-review" style="font-size:11px;color:#7a8699;margin-bottom:6px;word-break:break-all"></div>
      <div id="pob-r-status" style="color:#516079;white-space:pre-wrap;margin-bottom:10px">Starting…</div>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <button id="pob-r-pause" style="all:unset;flex:1;cursor:pointer;text-align:center;padding:8px;border-radius:9px;border:1px solid #d7dce5;font-weight:600">Pause</button>
        <button id="pob-r-submit" style="all:unset;flex:1;cursor:pointer;text-align:center;padding:8px;border-radius:9px;background:#1d4ed8;color:#fff;font-weight:600">I submitted it</button>
      </div>
      <div style="display:flex;gap:6px">
        <button id="pob-r-skip" style="all:unset;flex:1;cursor:pointer;text-align:center;padding:7px;border-radius:9px;border:1px solid #d7dce5;font-size:12px">Skip this one</button>
        <button id="pob-r-stop" style="all:unset;flex:1;cursor:pointer;text-align:center;padding:7px;border-radius:9px;color:#b3261e;border:1px solid #f0d3d0;font-size:12px">Stop run</button>
      </div>
      <div id="pob-r-manual" hidden style="display:flex;gap:6px;margin-top:6px">
        <button id="pob-r-recorded" style="all:unset;flex:1;cursor:pointer;text-align:center;padding:7px;border-radius:9px;border:1px solid #d7dce5;font-size:12px">It submitted — record it</button>
        <button id="pob-r-retry" style="all:unset;flex:1;cursor:pointer;text-align:center;padding:7px;border-radius:9px;border:1px solid #d7dce5;font-size:12px">Retry</button>
      </div>
    `;
    document.body.appendChild(panel);
    els = {
      count: panel.querySelector("#pob-r-count"),
      fill: panel.querySelector("#pob-r-fill"),
      review: panel.querySelector("#pob-r-review"),
      status: panel.querySelector("#pob-r-status"),
      pause: panel.querySelector("#pob-r-pause"),
      submit: panel.querySelector("#pob-r-submit"),
      skip: panel.querySelector("#pob-r-skip"),
      stop: panel.querySelector("#pob-r-stop"),
      manual: panel.querySelector("#pob-r-manual"),
      recorded: panel.querySelector("#pob-r-recorded"),
      retry: panel.querySelector("#pob-r-retry"),
    };
    wireButtons();
    return panel;
  }

  const log = (msg) => {
    ensurePanel();
    els.status.textContent = msg;
  };

  function renderRun(run) {
    if (!run) return;
    ensurePanel();
    const total = run.total || 0;
    const done = run.done || 0;
    els.count.textContent = total ? `${done}/${total}` : `${done} sent`;
    els.fill.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : "0%";
    els.pause.textContent = run.paused ? "Resume" : "Pause";
    els.review.textContent = run.current
      ? `${run.current.ourUrl || ""}\n→ ${run.current.infringingUrls?.[0] || ""}`
      : run.orderName
        ? run.orderName
        : "";
  }

  /* ------------------------------ run controls ------------------------------ */

  let cancelCountdown = false;
  let submitting = false;

  function wireButtons() {
    els.pause.addEventListener("click", async () => {
      const run = await loadRun();
      if (!run) return;
      cancelCountdown = true;
      const paused = !run.paused;
      const next = await patchRun({ paused });
      renderRun(next);
      log(paused ? "Paused. Nothing will be submitted until you resume." : "Resuming…");
      if (!paused) void step();
    });

    // The extension never clicks Google's Submit button. This records a report
    // that YOU submitted by hand, then loads a fresh form for the next review.
    els.submit.addEventListener("click", () => {
      void recordSubmitted(extractCaseRef());
    });

    els.skip.addEventListener("click", async () => {
      cancelCountdown = true;
      const run = await loadRun();
      if (!run?.current) return log("Nothing claimed to skip.");
      log("Skipping this review…");
      try {
        await api("/api/public/dmca/release-single", {
          reportId: run.current.reportId,
          reason: "skipped",
        });
      } catch (error) {
        log(`Skip warning: ${error.message}`);
      }
      const next = await patchRun({ current: null, stage: "idle", skipped: (run.skipped || 0) + 1 });
      renderRun(next);
      reloadBlankForm();
    });

    els.stop.addEventListener("click", async () => {
      cancelCountdown = true;
      const run = await loadRun();
      if (run?.current) {
        try {
          await api("/api/public/dmca/release-single", {
            reportId: run.current.reportId,
            reason: "released",
          });
        } catch {
          /* keep stopping regardless */
        }
      }
      await clearRun();
      log("Run stopped. The current review went back into the pool.");
      els.pause.disabled = true;
      els.submit.disabled = true;
      els.skip.disabled = true;
    });

    els.recorded.addEventListener("click", async () => {
      els.manual.hidden = true;
      await recordSubmitted("");
    });

    els.retry.addEventListener("click", async () => {
      els.manual.hidden = true;
      await patchRun({ stage: "idle" });
      reloadBlankForm();
    });
  }

  function reloadBlankForm() {
    setTimeout(() => {
      window.location.href = CFG.GOOGLE_FORM_URL;
    }, 600);
  }

  /* ------------------------------- captcha ---------------------------------- */

  // In-page solve attempts before we give up and reload the form.
  // Every captcha failure auto-retries up to 5 times — no manual click needed.
  const CAPTCHA_TRIES_PER_PAGE = 5;
  // Fresh-page retries: a reload gives 2Captcha a brand-new challenge.
  const CAPTCHA_PAGE_RELOADS = 5;

  async function solveCaptchaIfNeeded() {
    const siteKey = INT.recaptchaSiteKey();
    if (!siteKey) return { ok: true, skipped: "no-captcha" };
    if (INT.recaptchaSolved()) return { ok: true, skipped: "already-solved" };

    let lastReason = "captcha-failed";
    for (let attempt = 1; attempt <= CAPTCHA_TRIES_PER_PAGE; attempt += 1) {
      log(
        `Solving reCAPTCHA via 2Captcha (attempt ${attempt}/${CAPTCHA_TRIES_PER_PAGE}, 20–90s)…`,
      );
      const res = await sendMessage({
        type: "pob-solve-captcha",
        siteKey,
        pageUrl: window.location.href,
      });
      if (res?.ok && res.token) {
        INT.applyRecaptchaToken(res.token);
        log("reCAPTCHA solved.");
        return { ok: true };
      }
      lastReason = res?.error || "captcha-failed";
      if (lastReason === "no-captcha-key") return { ok: false, reason: lastReason };
      if (attempt < CAPTCHA_TRIES_PER_PAGE) {
        log(
          `reCAPTCHA attempt ${attempt}/${CAPTCHA_TRIES_PER_PAGE} failed (${lastReason}). Auto-retrying…`,
        );
        await sleep(4000);
      }
    }
    return { ok: false, reason: lastReason };
  }

  /* --------------------------- submit + confirm ----------------------------- */

  // Submitting is deliberately manual: only you click Google's Submit button.

  function pageLooksConfirmed() {
    const text = norm(document.body?.innerText || "");
    if (!text) return false;
    if (CONFIRM_KEYWORDS.some((k) => text.includes(k))) return true;
    return /thank you/.test(text) && !INT.findSubmitButton();
  }

  function extractCaseRef() {
    const text = document.body?.innerText || "";
    const match =
      text.match(/reference number[^\w]*([\w-]{4,})/i) ||
      text.match(/case\s*(?:id|number)[^\w]*([\w-]{4,})/i);
    return match?.[1] ?? "";
  }

  async function recordSubmitted(caseRef) {
    const run = await loadRun();
    if (!run?.current) return;
    log("Recording this report in your dashboard…");
    try {
      const result = await api("/api/public/dmca/confirm-single", {
        reportId: run.current.reportId,
        caseRef: caseRef || "",
      });
      const next = await patchRun({
        current: null,
        stage: "idle",
        done: (run.done || 0) + 1,
        remaining: result.remaining,
        submitRetries: 0,
      });
      renderRun(next);
      if (result.remaining === 0) {
        await clearRun();
        log("All reviews in this order have been reported. Run complete.");
        return;
      }
      log(`Recorded. ${result.remaining} left — loading a fresh form…`);
      reloadBlankForm();
    } catch (error) {
      log(`Couldn't record it: ${error.message}\nUse "It submitted — record it" to retry.`);
      ensurePanel();
      els.manual.hidden = false;
    }
  }

  // Watches for Google's thank-you page after YOU press Submit. Never submits.
  let watching = false;
  async function detectConfirmation() {
    if (watching) return;
    watching = true;
    try {
      for (let i = 0; i < 900; i++) {
        const run = await loadRun();
        if (!run?.active || run.stage !== "awaiting-confirm" || !run.current) return;
        if (pageLooksConfirmed()) return recordSubmitted(extractCaseRef());
        await sleep(1000);
      }
    } finally {
      watching = false;
    }
  }

  /* --------------------------------- steps --------------------------------- */

  async function waitForForm() {
    for (let i = 0; i < 30; i++) {
      if (INT.allFields().length > 4) return true;
      await sleep(500);
    }
    return INT.allFields().length > 0;
  }


  async function step() {
    let run = await loadRun();
    if (!run?.active) return;
    ensurePanel();
    renderRun(run);

    if (run.stage === "awaiting-confirm") return detectConfirmation();
    if (run.paused) return log("Paused. Press Resume to continue.");

    const store = await chrome.storage.local.get(["details"]);
    const details = { ...CFG.DEFAULT_DETAILS, ...(store.details || {}) };

    if (!(await waitForForm())) {
      return log(
        'Form not visible yet. Click Google\'s "Report alleged copyright infringement" option, then press Resume.',
      );
    }

    if (!run.current) {
      log("Claiming the next review…");
      try {
        const payload = await api("/api/public/dmca/next-single", { orderId: run.orderId });
        run = await patchRun({
          current: payload,
          total: run.total || payload.progress?.total || 0,
          stage: "claimed",
        });
        renderRun(run);
      } catch (error) {
        const msg = String(error.message || "");
        const delayMatch = msg.match(/in\s+(\d+)\s*s/i);
        if (/delay active/i.test(msg) && delayMatch) {
          const secs = Math.max(5, Math.min(3600, Number(delayMatch[1]) || 30));
          log(`${msg}\nWaiting ${secs}s before trying the next review…`);
          await sleep(secs * 1000);
          return step();
        }
        if (/no Drive screenshot/i.test(msg)) {
          log(`${msg}\nChecking again in 60s…`);
          await sleep(60000);
          return step();
        }
        if (/still in progress/i.test(msg)) {
          log(`${msg}\nChecking again in 30s…`);
          await sleep(30000);
          return step();
        }
        if (/no unreported/i.test(msg)) {
          await clearRun();
          return log("Nothing left to report in this order. Run complete.");
        }
        return log(`Couldn't claim a review: ${msg}`);
      }
    }

    log("Filling the form for this review…");
    const result = await window.__pobDmcaFillPayload(run.current);
    if (!result?.ok) {
      return log(
        `Fill failed (${result?.reason || "unknown"}). Make the full form visible, then press Resume.`,
      );
    }
    const missing = Object.entries(result.fields || {})
      .filter(([, ok]) => !ok)
      .map(([key]) => key);

    await patchRun({ stage: "awaiting-confirm", filledAt: Date.now() });
    const head =
      `Form filled from template "${run.current.templateName || "selected template"}".` +
      (missing.length ? `\nCheck: ${missing.join(", ")}.` : "");

    // Auto-submit: short cancellable countdown, then really click Google's Submit.
    const delay = Math.min(60, Math.max(2, Number(details.autoSubmitDelay) || 5));
    cancelCountdown = false;
    for (let s = delay; s > 0; s--) {
      if (cancelCountdown) break;
      log(head + `\nAuto-submitting in ${s}s… (press Pause to cancel)`);
      await sleep(1000);
    }
    let latest = await loadRun();
    if (cancelCountdown || !latest?.active || latest.paused || !latest.current) {
      await patchRun({ stage: "awaiting-confirm" });
      log(head + "\nAuto-submit cancelled. Click Google's Submit yourself — I'll record it.");
      return void detectConfirmation();
    }

    const sub = await INT.submitAndConfirm({
      log: (m) => log(head + "\n" + m),
      cancelled: () => cancelCountdown,
    });
    if (sub.ok) {
      await patchRun({ stage: "awaiting-confirm" });
      return recordSubmitted(sub.caseRef);
    }

    latest = await loadRun();
    if (!latest?.active) return;
    const retries = Number(latest.submitRetries || 0);
    if (sub.reason !== "cancelled" && sub.reason !== "no-captcha-key" && retries < 2) {
      // Keep the claimed review and try again on a fresh form.
      await patchRun({ stage: "idle", submitRetries: retries + 1 });
      log(`Submit didn't go through (${sub.reason}). Reloading a fresh form and retrying (${retries + 1}/2)…`);
      return reloadBlankForm();
    }
    await patchRun({ stage: "awaiting-confirm", submitRetries: 0 });
    log(
      head +
        `\nCouldn't auto-submit: ${sub.reason}.\nFinish it on the form and press Submit — I'll record it automatically.`,
    );
    void detectConfirmation();
  }

  window.__pobDmcaRunnerStep = () => void step();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.run) return;
    const run = changes.run.newValue;
    if (!run) return;
    renderRun(run);
    if (run.active && run.stage === "idle" && !run.current && !run.paused) void step();
  });

  async function boot() {
    const run = await loadRun();
    if (!run?.active) return;
    // After Submit, Google lands on a confirmation page that is not the form URL;
    // the runner must still boot there to detect the confirmation and continue.
    if (!CFG.isFormUrl(window.location.href) && run.stage !== "awaiting-confirm") return;
    ensurePanel();
    renderRun(run);
    void step();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot());
  } else {
    void boot();
  }
})();
