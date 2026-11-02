(function () {
  "use strict";

  // Google Analytics 4.
  // Se activa solo si config.js tiene un ID válido (G-XXXXXXXXXX).
  const CONFIG = window.APARTA2_CONFIG || {};
  const id = String(CONFIG.GA_MEASUREMENT_ID || "").trim();

  if (!/^G-[A-Z0-9]+$/i.test(id)) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id, {
    anonymize_ip: true,
    send_page_view: true,
  });
})();
