/* Popup logic. Wrapped in an IIFE so nothing collides with config.js globals. */
(() => {
  const CFG = window.POB_DMCA_CONFIG;

  const el = (id) => document.getElementById(id);
  const statusEl = el("status");

  const setStatus = (msg, kind = "") => {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = `status ${kind}`.trim();
  };

  /** Never let a startup failure leave the popup stuck on "Loading…". */
  const fatal = (error) => {
    const select = el("order");
    if (select) select.innerHTML = '<option value="">Unavailable</option>';
    setStatus(`Extension error: ${error?.message || error}`, "err");
  };

  window.addEventListener("error", (e) => fatal(e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => fatal(e.reason));

  if (!CFG) {
    fatal(new Error("config.js failed to load — reload the extension."));
    return;
  }

  const send = (message) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(response);
      });
    });

  async function loadDetails() {
    const store = await chrome.storage.local.get(["details"]);
    return { ...CFG.DEFAULT_DETAILS, ...(store.details || {}) };
  }

  /** All network calls go through the service worker (stable origin + timeout). */
  async function api(path, { method = "GET", body } = {}) {
    const res = await send({ type: "pob-api", path, method, body });
    if (!res) throw new Error("No response from extension background.");
    if (!res.ok) throw new Error(res.error || "Request failed");
    return res.data;
  }

  let activeBatch = null;

  function renderBatch(batch) {
    activeBatch = batch || null;
    const has = Boolean(batch);
    el("batch").hidden = !has;
    el("fill").hidden = !has;
    el("caseRef").hidden = !has;
    el("confirm").hidden = !has;
    el("release").hidden = !has;
    el("reserve").disabled = has;
    el("reserve").textContent = has ? "Batch already reserved" : "Reserve URLs";
    if (!has) return;
    el("batch").textContent =
      `${batch.urlCount} URLs reserved · batch ${String(batch.batchId).slice(0, 8)}` +
      ` · publication date ${batch.publicationDate ?? "—"}`;
  }

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function openForm() {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => CFG.isFormUrl(t.url));
    if (existing?.id) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      return existing;
    }
    return chrome.tabs.create({ url: CFG.GOOGLE_FORM_URL });
  }

  async function loadOrders() {
    const select = el("order");
    el("retry").hidden = true;
    el("settings").hidden = true;
    select.innerHTML = '<option value="">Loading…</option>';

    const details = await loadDetails();
    if (!details.apiKey || !details.apiBase) {
      select.innerHTML = '<option value="">Setup required</option>';
      el("settings").hidden = false;
      setStatus("Add your dashboard URL and API key in Settings, then retry.", "err");
      return;
    }

    try {
      const { orders } = await api("/api/public/dmca/orders");
      const list = orders || [];
      select.innerHTML = "";
      if (!list.length) {
        select.innerHTML = '<option value="">No orders yet</option>';
        setStatus("No review orders found in your dashboard.");
        return;
      }
      for (const order of list) {
        const option = document.createElement("option");
        option.value = order.id;
        option.textContent = `${order.name} — ${order.remaining} left of ${order.published}`;
        option.disabled = order.remaining === 0;
        select.appendChild(option);
      }
      const usable = list.filter((o) => o.remaining > 0);
      if (!usable.length) {
        setStatus("Every published review is already batched. Release a batch to reuse URLs.", "err");
      } else {
        const first = list.find((o) => o.remaining > 0);
        if (first) select.value = first.id;
        setStatus(`${usable.length} order(s) with URLs available.`, "ok");
      }
    } catch (error) {
      select.innerHTML = '<option value="">Unavailable</option>';
      el("retry").hidden = false;
      if (/401|unauthorized/i.test(error.message)) {
        el("settings").hidden = false;
        setStatus("API key rejected (401). Re-copy the key from Dashboard → DMCA.", "err");
      } else {
        setStatus(`Couldn't load orders: ${error.message}`, "err");
      }
    }
  }

  async function refresh() {
    const store = await chrome.storage.local.get(["batch"]);
    renderBatch(store.batch);
    const details = await loadDetails();
    el("size").value = details.batchSize || 90;
    renderRun((await chrome.storage.local.get(["run"])).run);
    renderCapture((await chrome.storage.local.get(["capture"])).capture);
    await loadOrders();
    await loadProfileOrders();
  }

  el("retry").addEventListener("click", () => void loadOrders());
  el("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

  el("open").addEventListener("click", async () => {
    await openForm();
    setStatus('Form open. Sign in if asked, then click "Fill this form".');
  });

  el("reserve").addEventListener("click", async () => {
    if (activeBatch) return setStatus("Submit or release the current batch first.", "err");
    const orderId = el("order").value;
    if (!orderId) return setStatus("Pick an order batch first.", "err");
    const limit = Math.min(100, Math.max(1, Number(el("size").value) || 90));
    setStatus("Reserving URLs…");
    try {
      const batch = await api("/api/public/dmca/next-batch", {
        method: "POST",
        body: { orderId, limit },
      });
      await chrome.storage.local.set({ batch });
      renderBatch(batch);
      setStatus(`Reserved ${batch.urlCount} URLs. Open the form, then "Fill this form".`, "ok");
      void loadOrders();
    } catch (error) {
      setStatus(error.message, "err");
    }
  });

  el("fill").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!CFG.isFormUrl(tab?.url)) {
      await openForm();
      setStatus('Opened Google\'s form — click "Fill this form" again once it has loaded.');
      return;
    }
    setStatus("Filling form…");
    try {
      const result = await send({ type: "pob-fill-active-tab", tabId: tab.id });
      if (!result?.ok) {
        const reasons = {
          "no-batch": "No batch reserved — reserve URLs first.",
          "no-fields":
            'Form fields not found. Click Google\'s "Report alleged copyright infringement" button so the full form is visible, then retry.',
          "not-ready": "Form still loading — retry in a second.",
          "inject-failed": "Chrome blocked injection on this page. Reload the form tab and retry.",
          "no-tab": "No active tab.",
        };
        return setStatus(
          reasons[result?.reason] ||
            `Fill failed (${result?.reason || "unknown"}). ${result?.error || ""}`,
          "err",
        );
      }
      const missing = Object.entries(result.fields || {})
        .filter(([, ok]) => !ok)
        .map(([key]) => key);
      const clean = missing.length === 0 && result.urlsFilled === result.total;
      setStatus(
        `Filled ${result.urlsFilled}/${result.total} URLs, ${result.sworn || 0} confirmation box(es).` +
          (missing.length ? `\nCheck manually: ${missing.join(", ")}.` : "") +
          "\nReview the form, then click Google's Submit.",
        clean ? "ok" : "",
      );
    } catch (error) {
      setStatus(error.message, "err");
    }
  });

  el("confirm").addEventListener("click", async () => {
    if (!activeBatch) return;
    setStatus("Marking submitted…");
    try {
      const result = await api("/api/public/dmca/confirm", {
        method: "POST",
        body: { batchId: activeBatch.batchId, caseRef: el("caseRef").value.trim() },
      });
      await chrome.storage.local.remove("batch");
      renderBatch(null);
      el("caseRef").value = "";
      setStatus(`Done — ${result.reported} URLs recorded as reported.`, "ok");
      void loadOrders();
    } catch (error) {
      setStatus(error.message, "err");
    }
  });

  el("release").addEventListener("click", async () => {
    if (!activeBatch) return;
    setStatus("Releasing…");
    try {
      const result = await api("/api/public/dmca/release", {
        method: "POST",
        body: { batchId: activeBatch.batchId },
      });
      await chrome.storage.local.remove("batch");
      renderBatch(null);
      setStatus(`Released ${result.released} URLs back to the pool.`, "ok");
      void loadOrders();
    } catch (error) {
      setStatus(error.message, "err");
    }
  });

  /* ------------------------- one-by-one run controls ------------------------ */

  function renderRun(run) {
    const active = Boolean(run?.active);
    el("runState").hidden = !active;
    el("stopRun").hidden = !active;
    el("openRun").hidden = !active;
    el("startRun").hidden = active;
    if (!active) return;
    el("runState").textContent =
      `Run active${run.orderName ? ` · ${run.orderName}` : ""} · ${run.done || 0}` +
      `${run.total ? `/${run.total}` : ""} submitted${run.paused ? " · paused" : ""}`;
  }

  el("startRun").addEventListener("click", async () => {
    const select = el("order");
    const orderId = select.value;
    if (!orderId) return setStatus("Pick an order first.", "err");
    const details = await loadDetails();
    const option = select.options[select.selectedIndex];
    setStatus("Starting the run…");
    try {
      const res = await send({
        type: "pob-start-run",
        orderId,
        orderName: (option?.textContent || "").split(" — ")[0],
        autoSubmit: false,
        delay: Number(details.autoSubmitDelay) || 8,
      });
      if (!res?.ok) throw new Error(res?.error || "Could not start the run");
      renderRun((await chrome.storage.local.get(["run"])).run);
      setStatus(
        "Run started in the Google form tab. It works through every review in this order until you press Stop run.",
        "ok",
      );
    } catch (error) {
      setStatus(error.message, "err");
    }
  });

  el("stopRun").addEventListener("click", async () => {
    const store = await chrome.storage.local.get(["run"]);
    const run = store.run;
    if (run?.current?.reportId) {
      try {
        await api("/api/public/dmca/release-single", {
          method: "POST",
          body: { reportId: run.current.reportId, reason: "released" },
        });
      } catch {
        /* stop regardless */
      }
    }
    await chrome.storage.local.remove("run");
    renderRun(null);
    setStatus("Run stopped.", "ok");
    void loadOrders();
  });

  el("openRun").addEventListener("click", async () => {
    await openForm();
  });

  /* --------------------- profile capture (Profile Report) -------------------- */

  function renderCapture(capture) {
    const active = Boolean(capture?.active);
    el("captureState").hidden = !active;
    el("stopCapture").hidden = !active;
    el("startCapture").hidden = active;
    if (!active) return;
    el("captureState").textContent =
      `Capture running${capture.orderName ? ` · ${capture.orderName}` : ""} · ` +
      `${capture.done || 0}${capture.total ? `/${capture.total}` : ""} profiles collected` +
      (capture.skipped ? ` · ${capture.skipped} skipped` : "");
  }

  async function loadProfileOrders() {
    const select = el("profileOrder");
    select.innerHTML = '<option value="">Loading…</option>';
    const details = await loadDetails();
    if (!details.apiKey || !details.apiBase) {
      select.innerHTML = '<option value="">Setup required</option>';
      return;
    }
    try {
      const { orders } = await api("/api/public/profiles/orders");
      const list = orders || [];
      select.innerHTML = "";
      if (!list.length) {
        select.innerHTML = '<option value="">No profile batches yet</option>';
        return;
      }
      for (const order of list) {
        const option = document.createElement("option");
        option.value = order.id;
        option.textContent = `${order.name} — ${order.remaining} left of ${order.total}`;
        select.appendChild(option);
      }
      const first = list.find((o) => o.remaining > 0);
      if (first) select.value = first.id;
    } catch (error) {
      select.innerHTML = '<option value="">Unavailable</option>';
      setStatus(`Couldn't load profile batches: ${error.message}`, "err");
    }
  }

  el("startCapture").addEventListener("click", async () => {
    const select = el("profileOrder");
    const orderId = select.value;
    if (!orderId) return setStatus("Pick a profile batch first.", "err");
    const option = select.options[select.selectedIndex];
    setStatus("Starting profile capture…");
    try {
      const res = await send({
        type: "pob-start-capture",
        orderId,
        orderName: (option?.textContent || "").split(" — ")[0],
      });
      if (!res?.ok) throw new Error(res?.error || "Could not start capture");
      renderCapture((await chrome.storage.local.get(["capture"])).capture);
      setStatus(
        "Capture running in the new Maps tab. Keep it open — it walks every review in the batch.",
        "ok",
      );
    } catch (error) {
      setStatus(error.message, "err");
    }
  });

  el("stopCapture").addEventListener("click", async () => {
    await chrome.storage.local.remove("capture");
    renderCapture(null);
    setStatus("Profile capture stopped.", "ok");
    void loadProfileOrders();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.run) renderRun(changes.run.newValue);
    if (changes.capture) renderCapture(changes.capture.newValue);
  });

  void refresh();
})();
