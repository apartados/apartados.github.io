(function () {
  "use strict";

  // Cierre de sesión por inactividad.
  // Se activa solo cuando hay una sesión iniciada.
  window.initSessionGuard = function (sb, opts) {
    const idleMinutes = (opts && opts.idleMinutes) || 30;
    const idleMs = idleMinutes * 60 * 1000;
    const warnMs = Math.min(2 * 60 * 1000, Math.floor(idleMs / 3)); // aviso 2 min antes
    const throttleMs = 1000;

    let active = false;
    let idleTimer = 0;
    let warnTimer = 0;
    let lastReset = 0;
    let expiring = false;

    // Banner de aviso
    const banner = document.createElement("div");
    banner.className = "session-banner";
    banner.hidden = true;
    banner.innerHTML =
      '<span class="session-banner__text">Tu sesión se cerrará por inactividad.</span>' +
      '<button type="button" class="session-banner__btn">Seguir conectado</button>';
    document.body.appendChild(banner);

    const textEl = banner.querySelector(".session-banner__text");
    const btn = banner.querySelector(".session-banner__btn");

    function showBanner(msg) {
      textEl.textContent = msg;
      btn.hidden = true;
      banner.hidden = false;
    }

    function handleExpire() {
      if (expiring) return;
      expiring = true;
      clearTimeout(idleTimer);
      clearTimeout(warnTimer);
      sb.auth.signOut().catch(() => {});
      const url = new URL(window.location.href);
      url.searchParams.set("timeout", "1");
      window.location.replace(url.toString());
    }

    function reset() {
      if (!active) return;
      const now = Date.now();
      if (now - lastReset < throttleMs) return;
      lastReset = now;

      clearTimeout(idleTimer);
      clearTimeout(warnTimer);
      banner.hidden = true;

      warnTimer = setTimeout(() => {
        if (!active) return;
        textEl.textContent = "Tu sesión se cerrará en 2 minutos por inactividad.";
        btn.hidden = false;
        banner.hidden = false;
      }, Math.max(idleMs - warnMs, 0));

      idleTimer = setTimeout(handleExpire, idleMs);
    }

    function stop() {
      active = false;
      clearTimeout(idleTimer);
      clearTimeout(warnTimer);
      banner.hidden = true;
    }

    btn.addEventListener("click", reset);

    ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "focus"].forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true })
    );

    // Si venimos de un cierre por inactividad, mostrarlo
    const params = new URLSearchParams(window.location.search);
    if (params.get("timeout") === "1") {
      showBanner("Tu sesión se cerró por inactividad.");
      setTimeout(() => (banner.hidden = true), 8000);
      params.delete("timeout");
      const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.history.replaceState(null, "", clean);
    }

    sb.auth.getSession().then(({ data }) => {
      if (data && data.session) {
        active = true;
        reset();
      }
    });

    sb.auth.onAuthStateChange((_event, session) => {
      if (session) {
        active = true;
        reset();
      } else {
        stop();
      }
    });

    return { reset, stop };
  };
})();
