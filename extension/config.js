/**
 * Shared config. This file is injected BOTH declaratively (content_scripts)
 * and programmatically (chrome.scripting), so everything is wrapped in an IIFE
 * with a re-entry guard — a top-level `const` here would throw
 * "Identifier 'FIELD_MAP' has already been declared" on the second injection.
 *
 * Field matching prefers Google's stable attributes (name/id/aria-label) on the
 * real form, then falls back to label/context text.
 */
(() => {
  if (typeof window !== "undefined" && window.POB_DMCA_CONFIG) return;

  const FIELD_MAP = {
    country: {
      type: "select",
      attrs: ["market_residence"],
      keywords: ["country of residence", "country/region", "country"],
    },
    copyrightHolder: {
      type: "text",
      attrs: ["represented_copyright_holder"],
      keywords: [
        "full legal name of the copyright holder you represent",
        "copyright holder you represent",
        "legal name of the copyright holder",
        "copyright holder",
        "on whose behalf",
        "rights holder",
      ],
    },
    fullName: {
      type: "text",
      attrs: ["full_name"],
      keywords: ["full legal name", "your full name", "your name"],
      skip: ["copyright holder", "company", "on whose behalf", "signature"],
    },
    company: {
      type: "text",
      attrs: ["companyname", "company_name"],
      keywords: ["company name", "company"],
    },
    email: {
      type: "text",
      attrs: ["contact_email_noprefill", "contact_email"],
      keywords: ["contact email address", "contact email", "email address", "email"],
      skip: ["confirm", "cc "],
    },
    workDescription: {
      type: "textarea",
      attrs: ["description_of_copyrighted_work"],
      keywords: [
        "identify and describe the copyrighted work",
        "describe the copyrighted work",
        "description of the copyrighted work",
        "describe your work",
        "copyrighted work",
      ],
      skip: ["where can we see", "example"],
    },
    authorizedExample: {
      type: "any",
      attrs: ["location_of_copyrighted_work"],
      keywords: [
        "where can we see an authorised example",
        "where can we see an authorized example",
        "enter your examples here",
        "authorised example",
        "authorized example",
        "example of the work",
        "your examples",
      ],
    },
    infringingUrls: {
      type: "url-list",
      attrs: ["url_box"],
      keywords: [
        "allegedly infringing urls",
        "allegedly infringing url",
        "enter your url(s) here",
        "enter your urls here",
        "enter your url",
        "allegedly infringing",
        "location of infringing material",
        "infringing url",
        "infringing material",
      ],
    },
    signature: {
      type: "text",
      attrs: ["signature"],
      keywords: ["signature", "sign here", "typed name"],
      skip: ["date"],
    },
  };

  /** Links/buttons that add another single-URL input. */
  const ADD_LINK_LABELS = [
    "add additional field",
    "add additional link",
    "add another link",
    "add additional urls",
    "add additional url",
    "add a field",
  ];

  /** Confirmed checkbox names on the live Maps/Geo form. */
  const SWORN_ATTRS = ["dmca_affirmations_authorized", "dmca_affirmations_penalty"];

  const SWORN_KEYWORDS = [
    "please tick to confirm",
    "please check to confirm",
    "good faith belief",
    "under penalty of perjury",
    "i am the copyright owner",
    "information in this notification is accurate",
    "i accept",
  ];

  const FEEDBACK_KEYWORDS = [
    "ask for feedback about my support experience",
    "feedback about my support",
  ];

  /** URL prefixes where the form may live. */
  const FORM_URL_PREFIXES = [
    "https://support.google.com/legal/contact/lr_dmca",
    "https://support.google.com/legal/",
    "https://reportcontent.google.com/forms/",
  ];

  /** The exact Google Maps / Geo copyright form. */
  const GOOGLE_FORM_URL =
    "https://support.google.com/legal/contact/lr_dmca?product=geo&uraw=&hl=en-GB";

  const DEFAULT_DETAILS = {
    apiBase: "https://peopleopinionbox.com",
    apiKey: "",
    country: "United States",
    fullName: "Jordan",
    company: "People Opinion Box",
    copyrightHolder: "Jordan",
    email: "",
    signature: "Jordan",
    batchSize: 90,
    tickFeedback: false,
    // 1-by-1 mode
    twoCaptchaKey: "198d7aa18c85d7f16929fd671988cd6b",
    autoSubmit: false,
    autoSubmitDelay: 5,
  };

  const CONFIG = {
    FIELD_MAP,
    ADD_LINK_LABELS,
    SWORN_ATTRS,
    SWORN_KEYWORDS,
    FEEDBACK_KEYWORDS,
    FORM_URL_PREFIXES,
    GOOGLE_FORM_URL,
    DEFAULT_DETAILS,
    isFormUrl(url) {
      return FORM_URL_PREFIXES.some((prefix) => String(url || "").startsWith(prefix));
    },
  };

  if (typeof window !== "undefined") window.POB_DMCA_CONFIG = CONFIG;
})();
