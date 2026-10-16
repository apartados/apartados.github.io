(function () {
  "use strict";

  const CONFIG = window.APARTA2_CONFIG || {};
  const SUPABASE_URL = (CONFIG.SUPABASE_URL || "").replace(/\/+$/, "");
  const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY || "";

  const els = {
    loading: document.getElementById("viewLoading"),
    login: document.getElementById("viewLogin"),
    panel: document.getElementById("viewPanel"),
    loginForm: document.getElementById("loginForm"),
    loginNote: document.getElementById("loginNote"),
    loginEmail: document.getElementById("loginEmail"),
    loginPass: document.getElementById("loginPass"),
    userEmail: document.getElementById("userEmail"),
    logoutBtn: document.getElementById("logoutBtn"),
    helloName: document.getElementById("helloName"),
    helloRole: document.getElementById("helloRole"),
    infoList: document.getElementById("infoList"),
    teamGrid: document.getElementById("teamGrid"),
    teamBadge: document.getElementById("teamBadge"),
    teamNote: document.getElementById("teamNote"),
    roomBox: document.getElementById("roomBox"),
    qrBox: document.getElementById("qrBox"),
    qrDownload: document.getElementById("qrDownload"),
    passForm: document.getElementById("passForm"),
    passNote: document.getElementById("passNote"),
    bloqueCorreo: document.getElementById("bloqueCorreo"),
    correoActual: document.getElementById("correoActual"),
    correoForm: document.getElementById("correoForm"),
    nuevoCorreo: document.getElementById("nuevoCorreo"),
    correoNote: document.getElementById("correoNote"),
    pagoForm: document.getElementById("pagoForm"),
    pagoParte: document.getElementById("pagoParte"),
    pagoTipo: document.getElementById("pagoTipo"),
    pagoBanco: document.getElementById("pagoBanco"),
    pagoMonto: document.getElementById("pagoMonto"),
    pagoReferencia: document.getElementById("pagoReferencia"),
    pagoArchivo: document.getElementById("pagoArchivo"),
    pagoPreview: document.getElementById("pagoPreview"),
    pagoNote: document.getElementById("pagoNote"),
    pagosList: document.getElementById("pagosList"),
    pagosBadge: document.getElementById("pagosBadge"),
    pagoEstado: document.getElementById("pagoEstado"),
    panelBurger: document.getElementById("panelBurger"),
    panelSide: document.getElementById("panelSide"),
    panelOverlay: document.getElementById("panelOverlay"),
    sideStaff: document.getElementById("sideStaff"),
    avatarImg: document.getElementById("avatarImg"),
    avatarInitials: document.getElementById("avatarInitials"),
    avatarInput: document.getElementById("avatarInput"),
    avatarNote: document.getElementById("avatarNote"),
    btnEditarInfo: document.getElementById("btnEditarInfo"),
    infoForm: document.getElementById("infoForm"),
    infoNombre: document.getElementById("infoNombre"),
    infoEdad: document.getElementById("infoEdad"),
    infoTelefono: document.getElementById("infoTelefono"),
    infoIglesia: document.getElementById("infoIglesia"),
    infoTalla: document.getElementById("infoTalla"),
    infoEmergencia: document.getElementById("infoEmergencia"),
    infoNotas: document.getElementById("infoNotas"),
    infoNote: document.getElementById("infoNote"),
    btnCancelarInfo: document.getElementById("btnCancelarInfo"),
    staffCard: document.getElementById("sec-organizadores"),
    staffText: document.getElementById("staffText"),
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    els.loading.innerHTML = "<p>Falta configurar Supabase en config.js.</p>";
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let currentUser = null;
  let profile = null;

  const ROL_LABEL = { participante: "Participante", staff: "Staff", admin: "Organizador", master: "Organizador principal" };

  function show(view) {
    [els.loading, els.login, els.panel].forEach((el) => (el.hidden = true));
    view.hidden = false;
  }

  function setMessage(el, text, type) {
    el.textContent = text || "";
    el.classList.remove("ok", "error");
    if (type) el.classList.add(type);
  }

  function emptyDash(value) {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function emptyToNull(value) {
    const v = (value || "").trim();
    return v === "" ? null : v;
  }

  /* ---------------- Sesión ---------------- */
  async function init() {
    fillBanks();
    initSide();
    const { data } = await sb.auth.getSession();
    await render(data.session);

    sb.auth.onAuthStateChange((_event, session) => {
      render(session);
    });
  }

  async function render(session) {
    if (!session) {
      currentUser = null;
      profile = null;
      els.userEmail.textContent = "";
      els.logoutBtn.hidden = true;
      els.panelBurger.classList.remove("is-visible");
      closeSide();
      show(els.login);
      return;
    }

    currentUser = session.user;
    els.userEmail.textContent = session.user.email;
    els.logoutBtn.hidden = false;
    els.panelBurger.classList.add("is-visible");
    show(els.loading);

    const { data, error } = await sb
      .from("profiles")
      .select("id, nombre, email, telefono, edad, iglesia, talla, emergencia, notas, rol, qr_token, equipo_id, equipo_pendiente_id, habitacion_id")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("[panel] perfil", error);
    }

    profile = data || null;
    show(els.panel);
    paint();
    paintAvatar();
    if (profile?.rol === "participante") loadTeams();
    loadRoom();
    paintQr();
    loadPagos();
  }

  /* ---------------- Foto de perfil ---------------- */
  function avatarUrl(path) {
    if (!path) return "";
    return sb.storage.from("avatares").getPublicUrl(path).data.publicUrl;
  }

  function initialsOf(name) {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
  }

  function paintAvatar() {
    const path = profile?.avatar_path;
    const nombre = profile?.nombre || currentUser?.email || "";
    if (path) {
      els.avatarImg.src = avatarUrl(path);
      els.avatarImg.hidden = false;
      els.avatarInitials.textContent = initialsOf(nombre);
    } else {
      els.avatarImg.hidden = true;
      els.avatarImg.removeAttribute("src");
      els.avatarInitials.textContent = initialsOf(nombre);
    }
  }

  els.avatarInput.addEventListener("change", async () => {
    const file = els.avatarInput.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage(els.avatarNote, "Elige una imagen (JPG, PNG o WebP).", "error");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setMessage(els.avatarNote, "La imagen supera los 3 MB.", "error");
      return;
    }

    const label = els.avatarInput.closest(".avatar");
    label.classList.add("is-loading");
    setMessage(els.avatarNote, "Subiendo tu foto…", null);

    const previo = profile?.avatar_path || null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${currentUser.id}/avatar-${Date.now()}.${ext}`;

    const { error: upError } = await sb.storage
      .from("avatares")
      .upload(path, file, { contentType: file.type || undefined, upsert: true });

    if (upError) {
      label.classList.remove("is-loading");
      setMessage(els.avatarNote, `No se pudo subir la foto: ${upError.message}`, "error");
      return;
    }

    const { error: rpcError } = await sb.rpc("actualizar_avatar", { p_path: path });
    if (rpcError) {
      label.classList.remove("is-loading");
      await sb.storage.from("avatares").remove([path]);
      setMessage(els.avatarNote, rpcError.message, "error");
      return;
    }

    if (previo) await sb.storage.from("avatares").remove([previo]);
    if (profile) profile.avatar_path = path;

    label.classList.remove("is-loading");
    els.avatarInput.value = "";
    paintAvatar();
    setMessage(els.avatarNote, "¡Foto actualizada!", "ok");
    setTimeout(() => setMessage(els.avatarNote, ""), 3000);
  });

  function paint() {
    const nombre = profile?.nombre || currentUser?.email || "Participante";
    els.helloName.textContent = `Hola, ${nombre.split(" ")[0]}`;
    els.helloRole.textContent = ROL_LABEL[profile?.rol] || "Participante";

    if (!profile) {
      els.infoList.innerHTML = "<div><dt>Estado</dt><dd>Creando tu perfil…</dd></div>";
      return;
    }

    const rows = [
      ["Nombre", profile.nombre],
      ["Correo", profile.email],
      ["Edad", profile.edad],
      ["Teléfono", profile.telefono],
      ["Iglesia / Distrito", profile.iglesia],
      ["Talla de camiseta", profile.talla],
      ["Contacto de emergencia", profile.emergencia],
      ["Alergias / notas", profile.notas],
      ["Rol", ROL_LABEL[profile.rol] || profile.rol],
    ];
    els.infoList.innerHTML = rows
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(emptyDash(v))}</dd></div>`)
      .join("");

    const staff = profile.rol === "admin" || profile.rol === "master" || profile.rol === "staff";
    els.staffCard.hidden = !staff;
    els.sideStaff.hidden = !staff;
    if (staff) {
      els.staffText.textContent =
        "Eres parte del equipo organizador. Entra al panel para gestionar el evento.";
    }

    // Solo los participantes tienen color/equipo
    const esParticipante = profile.rol === "participante";
    document.getElementById("sec-equipo").hidden = !esParticipante;
    document.getElementById("sideEquipo").hidden = !esParticipante;

    // Solo el master puede cambiar su correo desde el panel
    els.bloqueCorreo.hidden = profile.rol !== "master";
    els.correoActual.textContent = profile.email || currentUser?.email || "—";

    // Solo el master puede editar su propia información
    els.btnEditarInfo.hidden = profile.rol !== "master";
    if (profile.rol !== "master") {
      els.infoForm.hidden = true;
      els.btnEditarInfo.textContent = "Editar";
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---------------- Equipos ---------------- */
  let teams = [];

  async function loadTeams() {
    const { data, error } = await sb.rpc("equipos_resumen");
    if (error) {
      console.error("[panel] equipos", error);
      els.teamGrid.innerHTML = '<p class="panel-muted">No se pudieron cargar los equipos.</p>';
      return;
    }
    teams = data || [];
    paintTeams();
  }

  async function refreshProfile() {
    const { data } = await sb
      .from("profiles")
      .select("equipo_id, equipo_pendiente_id, habitacion_id")
      .eq("id", currentUser.id)
      .maybeSingle();
    if (data && profile) {
      profile.equipo_id = data.equipo_id;
      profile.equipo_pendiente_id = data.equipo_pendiente_id;
      profile.habitacion_id = data.habitacion_id;
    }
  }

  function paintTeams() {
    if (!profile) return;

    const aprobado = teams.find((t) => t.id === profile.equipo_id);
    const pendiente = teams.find((t) => t.id === profile.equipo_pendiente_id);

    if (pendiente) {
      els.teamBadge.textContent = "Por aprobar";
      els.teamNote.innerHTML =
        `Solicitaste <strong>${escapeHtml(pendiente.nombre)}</strong>. Un organizador debe aprobarlo. ` +
        `<button type="button" class="link-btn" id="cancelarSolicitud">Cancelar solicitud</button>`;
      els.teamNote.className = "form-note";
      const cancel = document.getElementById("cancelarSolicitud");
      if (cancel) cancel.addEventListener("click", cancelarSolicitud);
    } else {
      els.teamBadge.textContent = aprobado ? aprobado.nombre : "Sin elegir";
      els.teamNote.textContent = aprobado
        ? "Equipo confirmado por el organizador."
        : "";
      els.teamNote.className = "form-note";
    }

    els.teamGrid.innerHTML = teams
      .map((t) => {
        const esAprobado = t.id === profile.equipo_id;
        const esPendiente = t.id === profile.equipo_pendiente_id;
        const llenos = t.cupo > 0 ? t.ocupados + t.pendientes : 0;
        const full = t.cupo > 0 && llenos >= t.cupo && !esAprobado && !esPendiente;
        const cupo = t.cupo > 0 ? `${t.ocupados}/${t.cupo}` : `${t.ocupados} confirmados`;
        const detalle = esAprobado ? "Tu equipo" : esPendiente ? "Solicitado" : full ? "Completo" : cupo;
        return `
          <button type="button" class="team-option ${esAprobado ? "is-mine" : ""} ${esPendiente ? "is-pending" : ""}"
                  data-team="${t.id}" ${full ? "disabled" : ""}>
            <span class="team-dot" style="background:${escapeHtml(t.color)}"></span>
            <strong>${escapeHtml(t.nombre)}</strong>
            <small>${detalle}</small>
          </button>`;
      })
      .join("");

    els.teamGrid.querySelectorAll(".team-option").forEach((btn) => {
      btn.addEventListener("click", () => solicitarEquipo(btn.dataset.team));
    });
  }

  async function solicitarEquipo(teamId) {
    setMessage(els.teamNote, "Enviando tu solicitud…", null);
    els.teamGrid.querySelectorAll(".team-option").forEach((b) => (b.disabled = true));

    const { error } = await sb.rpc("solicitar_equipo", { p_equipo: teamId });

    if (error) {
      console.error("[panel] solicitar_equipo", error);
      setMessage(els.teamNote, error.message || "No se pudo enviar la solicitud.", "error");
    } else {
      await refreshProfile();
    }
    await loadTeams();
  }

  async function cancelarSolicitud() {
    const { error } = await sb.rpc("cancelar_solicitud_equipo");
    if (error) {
      setMessage(els.teamNote, error.message, "error");
      return;
    }
    await refreshProfile();
    await loadTeams();
  }

  /* ---------------- Habitación ---------------- */
  async function loadRoom() {
    if (!profile) return;
    if (!profile.habitacion_id) {
      els.roomBox.innerHTML = "<strong>Pendiente</strong><span>El equipo organizador te la asignará.</span>";
      return;
    }
    const { data } = await sb.from("habitaciones").select("nombre, cupo").eq("id", profile.habitacion_id).maybeSingle();
    if (data) {
      els.roomBox.innerHTML = `<strong>${escapeHtml(data.nombre)}</strong><span>Capacidad: ${data.cupo || "—"} personas</span>`;
    } else {
      els.roomBox.innerHTML = "<strong>Pendiente</strong><span>El equipo organizador te la asignará.</span>";
    }
  }

  /* ---------------- QR ---------------- */
  function qrToPng(qr, cellSize, margin) {
    const count = qr.getModuleCount();
    const size = (count + margin * 2) * cellSize;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + margin) * cellSize, (r + margin) * cellSize, cellSize, cellSize);
        }
      }
    }
    return canvas.toDataURL("image/png");
  }

  function paintQr() {
    if (!profile || !profile.qr_token || typeof qrcode !== "function") {
      els.qrBox.innerHTML = '<span class="qr-empty">Tu QR estará disponible en un momento.</span>';
      els.qrDownload.removeAttribute("href");
      return;
    }

    const qr = qrcode(0, "M");
    qr.addData(String(profile.qr_token));
    qr.make();

    els.qrBox.innerHTML = `<img alt="Código QR de ${escapeHtml(profile.nombre || "participante")}" src="${qrToPng(qr, 6, 2)}" />`;
    els.qrDownload.href = qrToPng(qr, 12, 4);
    const slug = (profile.nombre || "participante")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    els.qrDownload.setAttribute("download", `qr-${slug}.png`);
  }

  /* ---------------- Pagos ---------------- */
  const BANCOS = [
    "Banco de Venezuela", "Banesco", "BBVA Provincial", "Mercantil",
    "Banco Nacional de Crédito (BNC)", "Banco Bicentenario", "Banco del Tesoro",
    "Banplus", "Banco Exterior", "Banco Fondo Común", "Bancamiga", "Banco BOD",
    "Banco del Sur", "Banco Plaza", "Bancrecer", "Mi Banco", "Banco Activo",
    "Banco Caroní", "Banco Sofitasa", "Banco Venezolano de Crédito",
    "Banco Digital de los Trabajadores", "Otro",
  ];
  const MAX_BYTES = 5 * 1024 * 1024;

  function fillBanks() {
    els.pagoBanco.innerHTML =
      '<option value="">Selecciona tu banco</option>' +
      BANCOS.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
  }

  async function loadPagos() {
    if (!currentUser) return;
    const { data, error } = await sb
      .from("pagos")
      .select("id, parte, tipo_pago, banco_origen, referencia, monto, moneda, estado, nota, comprobante_path, created_at")
      .eq("profile_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[panel] pagos", error);
      els.pagosList.innerHTML = '<p class="pagos-empty">No se pudo cargar tus pagos.</p>';
      return;
    }
    paintPagos(data || []);
  }

  async function paintPagos(pagos) {
    const porParte = { 1: null, 2: null };
    pagos.forEach((p) => {
      if (!porParte[p.parte] || p.estado === "aprobado") porParte[p.parte] = p;
    });
    const verificados = [1, 2].filter((n) => porParte[n] && porParte[n].estado === "aprobado").length;
    els.pagosBadge.textContent = `${verificados} de 2 verificados`;

    // sugiere la parte que falta por pagar
    if (!porParte[1]) els.pagoParte.value = "1";
    else if (!porParte[2]) els.pagoParte.value = "2";

    // mensaje de estado por parte
    const estadoTexto = {
      aprobado: ["Verificado", "Tu pago fue confirmado", "✓"],
      en_revision: ["Por verificar", "Recibido, esperando confirmación", "⏳"],
      rechazado: ["Rechazado", "Revisa los datos y vuelve a enviarlo", "✕"],
      sin_enviar: ["Sin enviar", "Aún no has subido esta parte", "–"],
    };

    els.pagoEstado.innerHTML = [1, 2]
      .map((n) => {
        const p = porParte[n];
        const key = p ? p.estado : "sin_enviar";
        const [titulo, detalle, icono] = estadoTexto[key];
        return `
          <div class="pago-pill pago-pill--${key}">
            <span class="pago-pill__icon" aria-hidden="true">${icono}</span>
            <span class="pago-pill__text">
              <strong>Parte ${n}: ${titulo}</strong>
              <small>${detalle}</small>
            </span>
          </div>`;
      })
      .join("");

    if (!pagos.length) {
      els.pagosList.innerHTML = '<p class="pagos-empty">Todavía no has enviado ningún comprobante.</p>';
      return;
    }

    const tipoLabel = { pago_movil: "Pago móvil", transferencia: "Transferencia" };
    const estadoLabel = { en_revision: "Por verificar", aprobado: "Verificado", rechazado: "Rechazado" };

    els.pagosList.innerHTML = pagos
      .map((p) => {
        const fecha = new Date(p.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
        const monto = p.monto ? ` · ${Number(p.monto).toLocaleString("es-VE")} ${p.moneda}` : "";
        return `
          <div class="pago-item">
            <div class="pago-item__info">
              <strong>Parte ${p.parte} · ${tipoLabel[p.tipo_pago] || p.tipo_pago}</strong>
              <small>${escapeHtml(p.banco_origen)} · Ref. ${escapeHtml(p.referencia)}${monto} · ${fecha}</small>
              ${p.nota ? `<small>Nota: ${escapeHtml(p.nota)}</small>` : ""}
            </div>
            <div class="pago-item__side">
              <span class="estado estado--${p.estado}">${estadoLabel[p.estado] || p.estado}</span>
              <a class="view" href="#" data-file="${escapeHtml(p.comprobante_path || "")}">Ver comprobante</a>
            </div>
          </div>`;
      })
      .join("");

    els.pagosList.querySelectorAll("a.view").forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const path = a.dataset.file;
        if (!path) return;
        const { data, error } = await sb.storage.from("comprobantes").createSignedUrl(path, 3600);
        if (error) {
          setMessage(els.pagoNote, "No se pudo abrir el comprobante.", "error");
          return;
        }
        window.open(data.signedUrl, "_blank", "noopener");
      });
    });
  }

  els.pagoArchivo.addEventListener("change", () => {
    const file = els.pagoArchivo.files[0];
    els.pagoPreview.hidden = true;
    els.pagoPreview.innerHTML = "";
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setMessage(els.pagoNote, "El archivo supera los 5 MB.", "error");
      els.pagoArchivo.value = "";
      return;
    }
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      els.pagoPreview.innerHTML = `<img src="${url}" alt="Vista previa del comprobante" />`;
      els.pagoPreview.hidden = false;
    } else {
      els.pagoPreview.innerHTML = `<span>${escapeHtml(file.name)}</span>`;
      els.pagoPreview.hidden = false;
    }
  });

  els.pagoForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const parte = Number(els.pagoParte.value);
    const banco = els.pagoBanco.value.trim();
    const referencia = els.pagoReferencia.value.trim();
    const file = els.pagoArchivo.files[0];

    if (!banco) return setMessage(els.pagoNote, "Selecciona el banco de origen.", "error");
    if (!referencia) return setMessage(els.pagoNote, "Escribe la referencia de la transacción.", "error");
    if (!file) return setMessage(els.pagoNote, "Adjunta el comprobante o captura del pago.", "error");
    if (file.size > MAX_BYTES) return setMessage(els.pagoNote, "El archivo supera los 5 MB.", "error");

    const btn = els.pagoForm.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Enviando…";
    setMessage(els.pagoNote, "Subiendo tu comprobante…", null);

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${currentUser.id}/parte${parte}-${Date.now()}.${ext}`;

    const { error: upError } = await sb.storage
      .from("comprobantes")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (upError) {
      console.error("[panel] upload", upError);
      btn.disabled = false;
      btn.textContent = "Enviar comprobante";
      setMessage(els.pagoNote, `No se pudo subir el archivo: ${upError.message}`, "error");
      return;
    }

    const monto = els.pagoMonto.value.trim();
    const { error: dbError } = await sb.from("pagos").insert({
      profile_id: currentUser.id,
      parte,
      tipo_pago: els.pagoTipo.value,
      banco_origen: banco,
      referencia,
      monto: monto === "" ? null : Number(monto),
      comprobante_path: path,
    });

    btn.disabled = false;
    btn.textContent = "Enviar comprobante";

    if (dbError) {
      console.error("[panel] insert pago", dbError);
      await sb.storage.from("comprobantes").remove([path]);
      setMessage(els.pagoNote, `No se pudo registrar el pago: ${dbError.message}`, "error");
      return;
    }

    setMessage(els.pagoNote, "¡Comprobante enviado! Queda en revisión.", "ok");
    els.pagoForm.reset();
    els.pagoPreview.hidden = true;
    els.pagoPreview.innerHTML = "";
    await loadPagos();
    setTimeout(() => setMessage(els.pagoNote, ""), 4000);
  });

  /* ---------------- Menú lateral ---------------- */
  function openSide() {
    els.panelSide.classList.add("is-open");
    els.panelOverlay.hidden = false;
    els.panelBurger.setAttribute("aria-expanded", "true");
  }
  function closeSide() {
    els.panelSide.classList.remove("is-open");
    els.panelOverlay.hidden = true;
    els.panelBurger.setAttribute("aria-expanded", "false");
  }

  function initSide() {
    els.panelBurger.addEventListener("click", () => {
      els.panelSide.classList.contains("is-open") ? closeSide() : openSide();
    });
    els.panelOverlay.addEventListener("click", closeSide);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSide();
    });

    const links = [...els.panelSide.querySelectorAll("a")];
    const sections = links.map((a) => document.getElementById(a.dataset.target)).filter(Boolean);

    links.forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.getElementById(a.dataset.target);
        if (!target) return;
        closeSide();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", `#${a.dataset.target}`);
      });
    });

    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((l) => l.classList.toggle("active", l.dataset.target === entry.target.id));
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    sections.forEach((s) => spy.observe(s));
  }

  /* ---------------- Editar mi información (master) ---------------- */
  function abrirEdicionInfo() {
    els.infoNombre.value = profile?.nombre || "";
    els.infoEdad.value = profile?.edad ?? "";
    els.infoTelefono.value = profile?.telefono || "";
    els.infoIglesia.value = profile?.iglesia || "";
    els.infoTalla.value = profile?.talla || "";
    els.infoEmergencia.value = profile?.emergencia || "";
    els.infoNotas.value = profile?.notas || "";
    els.infoForm.hidden = false;
    els.btnEditarInfo.textContent = "Cerrar";
    setMessage(els.infoNote, "", null);
  }

  function cerrarEdicionInfo() {
    els.infoForm.hidden = true;
    els.btnEditarInfo.textContent = "Editar";
    setMessage(els.infoNote, "", null);
  }

  els.btnEditarInfo.addEventListener("click", () => {
    els.infoForm.hidden ? abrirEdicionInfo() : cerrarEdicionInfo();
  });
  els.btnCancelarInfo.addEventListener("click", cerrarEdicionInfo);

  els.infoForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nombre = els.infoNombre.value.trim().replace(/\s+/g, " ");
    const edadTxt = els.infoEdad.value.trim();

    if (nombre.length < 3) return setMessage(els.infoNote, "Escribe tu nombre completo.", "error");
    if (edadTxt !== "" && Number(edadTxt) < 15) {
      return setMessage(els.infoNote, "La edad debe ser de 15 años en adelante.", "error");
    }

    const btn = els.infoForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Guardando…";

    const patch = {
      nombre,
      edad: edadTxt === "" ? null : Number(edadTxt),
      telefono: emptyToNull(els.infoTelefono.value),
      iglesia: emptyToNull(els.infoIglesia.value),
      talla: emptyToNull(els.infoTalla.value),
      emergencia: emptyToNull(els.infoEmergencia.value),
      notas: emptyToNull(els.infoNotas.value),
    };

    const { error } = await sb.from("profiles").update(patch).eq("id", currentUser.id);

    btn.disabled = false;
    btn.textContent = "Guardar cambios";

    if (error) {
      console.error("[panel] info", error);
      setMessage(els.infoNote, `No se pudo guardar: ${error.message}`, "error");
      return;
    }

    Object.assign(profile, patch);
    paint();
    paintAvatar();
    els.infoForm.hidden = true;
    els.btnEditarInfo.textContent = "Editar";
    els.helloName.textContent = `Hola, ${nombre.split(" ")[0]}`;
    setMessage(els.infoNote, "", null);
  });

  /* ---------------- Login ---------------- */
  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = els.loginForm.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Entrando…";
    setMessage(els.loginNote, "", null);

    const { error } = await sb.auth.signInWithPassword({
      email: els.loginEmail.value.trim().toLowerCase(),
      password: els.loginPass.value,
    });

    btn.disabled = false;
    btn.textContent = "Entrar";

    if (error) {
      setMessage(els.loginNote, "Correo o contraseña incorrectos.", "error");
      return;
    }
    els.loginForm.reset();
  });

  els.logoutBtn.addEventListener("click", async () => {
    await sb.auth.signOut();
  });

  /* ---------------- Cambiar correo ---------------- */
  els.correoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nuevo = els.nuevoCorreo.value.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo)) {
      setMessage(els.correoNote, "Escribe un correo válido.", "error");
      return;
    }
    if (nuevo === (profile?.email || "").toLowerCase()) {
      setMessage(els.correoNote, "Ese ya es tu correo actual.", "error");
      return;
    }

    const btn = els.correoForm.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Actualizando…";

    const { error } = await sb.rpc("cambiar_mi_correo", { p_email: nuevo });

    btn.disabled = false;
    btn.textContent = "Actualizar correo";

    if (error) {
      setMessage(els.correoNote, error.message || "No se pudo cambiar el correo.", "error");
      return;
    }

    if (profile) profile.email = nuevo;
    els.correoActual.textContent = nuevo;
    els.userEmail.textContent = nuevo;
    els.correoForm.reset();
    setMessage(els.correoNote, "¡Correo actualizado! Úsalo para iniciar sesión la próxima vez.", "ok");
  });

  /* ---------------- Cambiar contraseña ---------------- */
  els.passForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pass = document.getElementById("newPass").value;
    const pass2 = document.getElementById("newPass2").value;

    if (pass.length < 8) {
      setMessage(els.passNote, "La contraseña debe tener al menos 8 caracteres.", "error");
      return;
    }
    if (pass !== pass2) {
      setMessage(els.passNote, "Las contraseñas no coinciden.", "error");
      return;
    }

    const btn = els.passForm.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Actualizando…";

    const { error } = await sb.auth.updateUser({ password: pass });

    btn.disabled = false;
    btn.textContent = "Actualizar contraseña";

    if (error) {
      setMessage(els.passNote, error.message, "error");
      return;
    }
    els.passForm.reset();
    setMessage(els.passNote, "Contraseña actualizada.", "ok");
  });

  init();
})();
