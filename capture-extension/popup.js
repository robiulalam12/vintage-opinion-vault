const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.local.get(["prefs", "lastResult"]);
  const p = s.prefs || {};
  $("autoDisabled").checked = !!p.autoDisabled;
  render(s.lastResult);
}

function pill(status) {
  const cls = ["captured", "dead", "error", "skipped"].includes(status) ? status : "error";
  return `<span class="pill ${cls}">${status}</span>`;
}

function render(result) {
  const el = $("status");
  const list = $("accounts");
  if (!result) {
    el.className = "status info";
    el.textContent = "Idle. Open google.com signed in — auto-capture will run.";
    list.hidden = true;
    return;
  }
  if (result.ok) {
    el.className = "status ok";
    el.textContent = `Captured ${result.captured}/${result.total} account(s).`;
  } else {
    el.className = "status err";
    el.textContent = result.error || `Captured 0/${result.total || 0} account(s).`;
  }
  const accts = result.accounts || [];
  if (accts.length) {
    list.hidden = false;
    list.innerHTML = accts
      .map(
        (a) =>
          `<div class="acct"><span class="em">u${a.authuser} · ${a.email || "(no email)"}${
            a.reason ? ` — ${a.reason}` : ""
          }</span>${pill(a.status)}</div>`
      )
      .join("");
  } else {
    list.hidden = true;
  }
}

async function persist() {
  await chrome.storage.local.set({ prefs: { autoDisabled: $("autoDisabled").checked } });
}

$("capture").addEventListener("click", async () => {
  await persist();
  $("status").className = "status info";
  $("status").textContent = "Capturing all accounts…";
  $("accounts").hidden = true;
  const resp = await chrome.runtime.sendMessage({ type: "pob-capture-session" });
  render(resp);
});

$("autoDisabled").addEventListener("change", persist);

$("diag").addEventListener("click", async () => {
  const s = await chrome.storage.local.get(["lastResult"]);
  const cookieResp = await chrome.runtime.sendMessage({ type: "pob-diagnostics" });
  const dump = {
    lastResult: s.lastResult || null,
    cookies: cookieResp?.cookies || null,
    userAgent: navigator.userAgent,
    at: new Date().toISOString(),
  };
  const text = JSON.stringify(dump, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    $("diagOut").textContent = "Copied diagnostics to clipboard.";
  } catch {
    $("diagOut").textContent = text;
  }
});

chrome.storage.onChanged.addListener((_c, area) => {
  if (area === "local") load();
});

load();
