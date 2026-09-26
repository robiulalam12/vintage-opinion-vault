(() => {
  if (window.POB_POLICY_CONFIG) return;
  window.POB_POLICY_CONFIG = {
    formUrl: "https://reportcontent.google.com/forms/legal_other_geo?product=geo&uraw&hl=en-GB",
    apiBase: "https://peopleopinionbox.com",
    defaults: { apiBase: "https://peopleopinionbox.com", apiKey: "", country: "United Kingdom", fullName: "", twoCaptchaKey: "", submitDelay: 5 },
    isFormUrl: (url) => String(url || "").startsWith("https://reportcontent.google.com/forms/legal_other_geo")
  };
})();
