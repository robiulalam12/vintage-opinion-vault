const FIELDS = [
  "apiBase",
  "apiKey",
  "country",
  "email",
  "fullName",
  "copyrightHolder",
  "company",
  "signature",
  "batchSize",
  "twoCaptchaKey",
  "autoSubmitDelay",
];

const el = (id) => document.getElementById(id);

chrome.storage.local.get(["details"]).then((store) => {
  const details = { ...window.POB_DMCA_CONFIG.DEFAULT_DETAILS, ...(store.details || {}) };
  for (const field of FIELDS) el(field).value = details[field] ?? "";
  el("tickFeedback").checked = Boolean(details.tickFeedback);
  
});

el("save").addEventListener("click", async () => {
  const details = {};
  for (const field of FIELDS) details[field] = el(field).value.trim();
  details.batchSize = Math.min(100, Math.max(1, Number(details.batchSize) || 90));
  details.twoCaptchaKey =
    details.twoCaptchaKey || window.POB_DMCA_CONFIG.DEFAULT_DETAILS.twoCaptchaKey;
  details.tickFeedback = el("tickFeedback").checked;
  details.autoSubmitDelay = Math.min(60, Math.max(2, Number(details.autoSubmitDelay) || 5));
  details.autoSubmit = false;
  await chrome.storage.local.set({ details });
  el("status").textContent = "Saved.";
  setTimeout(() => {
    el("status").textContent = "";
  }, 2000);
});
