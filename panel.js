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
    staffCard: document.getElementById("staffCard"),
    staffText: document.getElementById("staffText"),
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    els.loading.innerHTML = "<p>Falta configurar Supabase en config.js.</p>";
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let currentUser = null;
  let profile = null;

  const ROL_LABEL = { participante: "Participante", admin: "Organizador", master: "Organizador principal" };

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

  /* ---------------- Sesión ---------------- */
  async function init() {
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
      show(els.login);
      return;
    }

    currentUser = session.user;
    els.userEmail.textContent = session.user.email;
    els.logoutBtn.hidden = false;
    show(els.loading);

    const { data, error } = await sb
      .from("profiles")
      .select("id, nombre, email, telefono, edad, iglesia, talla, emergencia, notas, rol, qr_token, equipo_id, habitacion_id")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("[panel] perfil", error);
    }

    profile = data || null;
    show(els.panel);
    paint();
    loadTeams();
    loadRoom();
    paintQr();
  }

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

    const staff = profile.rol === "admin" || profile.rol === "master";
    els.staffCard.hidden = !staff;
    if (staff) {
      els.staffText.textContent =
        "Eres organizador. El panel de organizadores (equipos, habitaciones y control de comidas) se habilita en la siguiente fase.";
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
    const { data } = await sb.from("profiles").select("equipo_id, habitacion_id").eq("id", currentUser.id).maybeSingle();
    if (data && profile) {
      profile.equipo_id = data.equipo_id;
      profile.habitacion_id = data.habitacion_id;
    }
  }

  function paintTeams() {
    if (!profile) return;

    const mine = teams.find((t) => t.id === profile.equipo_id);
    els.teamBadge.textContent = mine ? mine.nombre : "Sin elegir";

    els.teamGrid.innerHTML = teams
      .map((t) => {
        const isMine = t.id === profile.equipo_id;
        const full = t.cupo > 0 && t.ocupados >= t.cupo && !isMine;
        const cupo = t.cupo > 0 ? `${t.ocupados}/${t.cupo}` : `${t.ocupados} inscritos`;
        return `
          <button type="button" class="team-option ${isMine ? "is-mine" : ""}"
                  data-team="${t.id}" ${full ? "disabled" : ""}>
            <span class="team-dot" style="background:${escapeHtml(t.color)}"></span>
            <strong>${escapeHtml(t.nombre)}</strong>
            <small>${isMine ? "Tu equipo" : full ? "Completo" : cupo}</small>
          </button>`;
      })
      .join("");

    els.teamGrid.querySelectorAll(".team-option").forEach((btn) => {
      btn.addEventListener("click", () => joinTeam(btn.dataset.team));
    });
  }

  async function joinTeam(teamId) {
    setMessage(els.teamNote, "Guardando tu elección…", null);
    els.teamGrid.querySelectorAll(".team-option").forEach((b) => (b.disabled = true));

    const { error } = await sb.rpc("unirse_equipo", { p_equipo: teamId });

    if (error) {
      console.error("[panel] unirse_equipo", error);
      setMessage(els.teamNote, error.message || "No se pudo asignar el equipo.", "error");
    } else {
      setMessage(els.teamNote, "¡Equipo asignado!", "ok");
      await refreshProfile();
    }

    await loadTeams();
    setTimeout(() => setMessage(els.teamNote, ""), 2600);
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
