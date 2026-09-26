/**
 * POB — trigger auto-capture whenever any Google page is opened.
 * The background script does the real work (multi-account sweep + dedupe),
 * so all we do here is nudge it.
 */
(function () {
  function trigger() {
    try {
      chrome.runtime.sendMessage({ type: "pob-auto-capture" });
    } catch {}
  }
  setTimeout(trigger, 2500);
  setTimeout(trigger, 9000);
})();
