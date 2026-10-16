(function () {
  "use strict";

  const CONFIG = window.APARTA2_CONFIG || {};
  const SUPABASE_URL = (CONFIG.SUPABASE_URL || "").replace(/\/+$/, "");
  const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY || "";

  const ROL_LABEL = { participante: "Participante", staff: "Staff", admin: "Organizador", master: "Organizador principal" };

  const params = new URLSearchParams(window.location.search);
  const token = params.get("t");
  const nombreEnQr = (params.get("n") || "").trim();

  const $ = (id) => document.getElementById(id);
  const loading = $("verifLoading");
  const ok = $("verifOk");
  const error = $("verifError");

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function initials(name) {
    const p = (name || "").trim().split(/\s+/).filter(Boolean);
    return p.length ? (p[0][0] + (p[1]?.[0] || "")).toUpperCase() : "?";
  }

  function mostrarError(msg) {
    loading.hidden = true;
    ok.hidden = true;
    error.hidden = false;
    if (msg) $("verifErrorMsg").textContent = msg;
  }

  function mostrarPersona(datos, aviso) {
    loading.hidden = true;
    error.hidden = true;
    ok.hidden = false;

    $("verifRol").textContent = ROL_LABEL[datos.rol] || "Participante";
    $("verifNombre").textContent = datos.nombre || "Sin nombre";

    if (datos.avatar_path) {
      const url = `${SUPABASE_URL}/storage/v1/object/public/avatares/${datos.avatar_path}`;
      const img = $("verifFoto");
      img.src = url;
      img.hidden = false;
      $("verifIniciales").style.display = "none";
    } else {
      $("verifIniciales").textContent = initials(datos.nombre);
    }

    const chips = [];
    if (datos.equipo) {
      chips.push(
        `<span class="verif-chip"><span class="dot" style="background:${esc(datos.equipo_color || "#888")}"></span>${esc(datos.equipo)}</span>`
      );
    }
    if (datos.habitacion) chips.push(`<span class="verif-chip">Habitación: ${esc(datos.habitacion)}</span>`);
    if (aviso) chips.push(`<span class="verif-chip" style="color:#ffd166">${esc(aviso)}</span>`);
    $("verifMeta").innerHTML = chips.join("");
  }

  if (!token) {
    mostrarError("El código no contiene un identificador válido.");
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    // Sin conexión a la base: al menos mostramos el nombre que trae el QR
    if (nombreEnQr) mostrarPersona({ nombre: nombreEnQr, rol: "participante" }, "Sin conexión: nombre tomado del código");
    else mostrarError("Falta configurar la conexión.");
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  sb.rpc("verificar_qr", { p_token: token })
    .then(({ data, error: rpcError }) => {
      if (rpcError || !data || data.encontrado !== true) {
        if (nombreEnQr) {
          mostrarPersona({ nombre: nombreEnQr, rol: "participante" }, "Verificación no disponible");
        } else {
          mostrarError();
        }
        return;
      }
      mostrarPersona(data);
    })
    .catch(() => {
      if (nombreEnQr) mostrarPersona({ nombre: nombreEnQr, rol: "participante" }, "Sin conexión: nombre tomado del código");
      else mostrarError("No se pudo conectar para verificar.");
    });
})();
