/**
 * Profile capture runner (Profile Report).
 *
 * Runs on Google Maps pages. For every review link in a profile batch it opens
 * the review permalink in this tab, reads the reviewer's own profile link
 * (/maps/contrib/<id>) out of the rendered review card, posts it back to the
 * dashboard, then moves on to the next link. Everything survives the page
 * navigations because the state lives in chrome.storage.local and the script is
 * re-injected by the service worker after each load.
 *
 * Wrapped in an IIFE with a re-entry guard: this file is injected both
 * declaratively and programmatically.
 */
(() => {
  if (window.__pobCaptureLoaded) {
    void window.__pobCaptureTick?.();
    return;
  }
  window.__pobCaptureLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const send = (message) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          void chrome.runtime.lastError;
          resolve(response);
        });
      } catch {
        resolve(null);
      }
    });

  const getState = async () => (await chrome.storage.local.get(["capture"])).capture || null;
  const setState = async (patch) => {
    const current = (await getState()) || {};
    const next = { ...current, ...patch };
    await chrome.storage.local.set({ capture: next });
    return next;
  };

  const api = (path, body) =>
    send({ type: "pob-api", path, method: "POST", body }).then(
      (res) => res || { ok: false, error: "No response from extension background." },
    );

  /* --------------------------------- panel -------------------------------- */

  let panel;

  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    panel = document.createElement("div");
    panel.id = "pob-capture-panel";
    panel.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "right:16px",
      "bottom:16px",
      "width:290px",
      "padding:12px 14px",
      "border-radius:14px",
      "background:#0f172a",
      "color:#fff",
      "font:13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif",
      "box-shadow:0 12px 32px rgba(15,23,42,.35)",
    ].join(";");
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="display:grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#1d4ed8;font-weight:700;font-size:11px">P</span>
        <strong style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Profile capture</strong>
      </div>
      <div id="pob-capture-progress" style="font-size:12px;opacity:.85"></div>
      <div id="pob-capture-status" style="margin-top:6px;font-size:12px"></div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button id="pob-capture-skip" style="flex:1;cursor:pointer;padding:6px;border:1px solid rgba(255,255,255,.25);border-radius:8px;background:transparent;color:#fff;font:inherit;font-size:12px">Skip</button>
        <button id="pob-capture-stop" style="flex:1;cursor:pointer;padding:6px;border:0;border-radius:8px;background:#fff;color:#0f172a;font:inherit;font-size:12px;font-weight:600">Stop</button>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector("#pob-capture-stop").addEventListener("click", async () => {
      await chrome.storage.local.remove("capture");
      setStatus("Stopped.");
    });
    panel.querySelector("#pob-capture-skip").addEventListener("click", async () => {
      const state = await getState();
      if (!state?.current) return;
      await api("/api/public/profiles/submit-target", {
        id: state.current.id,
        error: "Skipped manually.",
      });
      await setState({ current: null, skipped: (state.skipped || 0) + 1 });
      void tick();
    });
    return panel;
  }

  function setStatus(text) {
    ensurePanel().querySelector("#pob-capture-status").textContent = text;
  }

  function setProgress(state) {
    const done = state?.done || 0;
    const total = state?.total || 0;
    ensurePanel().querySelector("#pob-capture-progress").textContent =
      `${state?.orderName ? `${state.orderName} · ` : ""}${done}${total ? `/${total}` : ""} collected` +
      (state?.skipped ? ` · ${state.skipped} skipped` : "");
  }

  /* ------------------------------- scraping ------------------------------- */

  const CONTRIB_RE = /\/maps\/contrib\/(\d{8,30})/;

  function reviewIdFromUrl() {
    const decoded = decodeURIComponent(location.href);
    return decoded.match(/!2m5!1s([A-Za-z0-9_-]{15,})/)?.[1] || null;
  }

  /** Reads the reviewer profile link from the open review card. */
  function findProfileUrl() {
    const reviewId = reviewIdFromUrl();

    // Preferred: the card for this exact review.
    if (reviewId) {
      const card =
        document.querySelector(`[data-review-id="${reviewId}"]`) ||
        document.querySelector(`[data-review-id*="${reviewId.slice(0, 20)}"]`);
      const scoped = card?.closest("[jsaction], div")?.querySelector('a[href*="/maps/contrib/"]');
      const own = card?.querySelector('a[href*="/maps/contrib/"]');
      const href = own?.href || scoped?.href;
      if (href && CONTRIB_RE.test(href)) return href;
    }

    // Fallback: first contributor link in the reviews panel.
    const anchors = [...document.querySelectorAll('a[href*="/maps/contrib/"]')];
    const first = anchors.find((a) => CONTRIB_RE.test(a.href));
    if (first) return first.href;

    // Last resort: any contributor id embedded in the page payload.
    const inline = document.documentElement.innerHTML.match(CONTRIB_RE);
    return inline ? `https://www.google.com/maps/contrib/${inline[1]}/reviews` : null;
  }

  /** Waits for Maps to render the review card. */
  async function waitForProfileUrl(timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const url = findProfileUrl();
      if (url) return url;
      // A consent/captcha wall never renders reviews — bail out early.
      if (/consent\.google\.com|\/sorry\//.test(location.href)) return null;
      await sleep(700);
    }
    return null;
  }

  /* -------------------------------- machine ------------------------------- */

  let busy = false;

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const state = await getState();
      if (!state?.active) {
        panel?.remove();
        panel = null;
        return;
      }
      ensurePanel();
      setProgress(state);

      if (state.paused) return setStatus("Paused.");

      // A target is already claimed for this tab.
      if (state.current) {
        const expected = state.current.reviewUrl;
        const onTarget =
          location.href === expected ||
          decodeURIComponent(location.href).includes(reviewIdFromUrl() || "\u0000");

        if (!onTarget && !reviewIdFromUrl()) {
          setStatus("Opening the review…");
          location.href = expected;
          return;
        }

        setStatus("Reading the reviewer profile…");
        const profileUrl = await waitForProfileUrl();
        const result = await api("/api/public/profiles/submit-target", {
          id: state.current.id,
          ...(profileUrl
            ? { profileUrl }
            : { error: "Reviewer profile link not visible on this review page." }),
        });

        const next = await setState({
          current: null,
          done: (state.done || 0) + (profileUrl ? 1 : 0),
          skipped: (state.skipped || 0) + (profileUrl ? 0 : 1),
        });
        setProgress(next);
        setStatus(
          profileUrl
            ? "Saved. Loading the next review…"
            : `No profile link found${result?.ok ? "" : ` (${result?.error || "save failed"})`}. Moving on…`,
        );
        await sleep(900);
      }

      // Claim the next link.
      setStatus("Asking the dashboard for the next review…");
      const res = await api("/api/public/profiles/next-target", { orderId: state.orderId });
      if (!res?.ok) {
        if (/no links left/i.test(String(res?.error || ""))) {
          await chrome.storage.local.remove("capture");
          setStatus("All done — every link in this batch has been checked.");
          return;
        }
        setStatus(`Paused: ${res?.error || "could not reach the dashboard"}`);
        await setState({ paused: true });
        return;
      }

      const claimed = await setState({
        current: res.data.target,
        total: res.data.progress?.total || state.total || 0,
        done: res.data.progress?.done ?? state.done ?? 0,
      });
      setProgress(claimed);
      setStatus("Opening the review…");
      location.href = res.data.target.reviewUrl;
    } finally {
      busy = false;
    }
  }

  window.__pobCaptureTick = tick;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.capture) return;
    if (!changes.capture.newValue) {
      panel?.remove();
      panel = null;
      return;
    }
    setProgress(changes.capture.newValue);
  });

  void tick();
})();
