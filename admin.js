(function () {
  "use strict";

  const CONFIG = window.APARTA2_CONFIG || {};
  const SUPABASE_URL = (CONFIG.SUPABASE_URL || "").replace(/\/+$/, "");
  const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY || "";

  const $ = (id) => document.getElementById(id);
  const els = {
    loading: $("viewLoading"),
    denied: $("viewDenied"),
    admin: $("viewAdmin"),
    userEmail: $("userEmail"),
    logoutBtn: $("logoutBtn"),
    adminRole: $("adminRole"),
    tabs: $("adminTabs"),
    tabPagos: $("tabPagos"),
    statGrid: $("statGrid"),
    financeBlock: $("financeBlock"),
    financeGrid: $("financeGrid"),
    filtroPagos: $("filtroPagos"),
    adminPagosList: $("adminPagosList"),
    buscarParticipante: $("buscarParticipante"),
    participantesCount: $("participantesCount"),
    adminPeople: $("adminPeople"),
    buscarStaff: $("buscarStaff"),
    staffCount: $("staffCount"),
    adminStaff: $("adminStaff"),
    fichaSelector: $("fichaSelector"),
    fichaSelect: $("fichaSelect"),
    fichaOverlay: $("fichaOverlay"),
    fichaBody: $("fichaBody"),
    fichaClose: $("fichaClose"),
    lightbox: $("lightbox"),
    lightboxImg: $("lightboxImg"),
    lightboxClose: $("lightboxClose"),
    comidaForm: $("comidaForm"),
    comidaNombre: $("comidaNombre"),
    comidaDia: $("comidaDia"),
    comidaOrden: $("comidaOrden"),
    comidaNote: $("comidaNote"),
    adminComidas: $("adminComidas"),
    bancoForm: $("bancoForm"),
    bancoNote: $("bancoNote"),
    bkBanco: $("bkBanco"), bkTitular: $("bkTitular"), bkDocumento: $("bkDocumento"),
    bkTipo: $("bkTipo"), bkCuenta: $("bkCuenta"),
    pmBanco: $("pmBanco"), pmTelefono: $("pmTelefono"), pmDocumento: $("pmDocumento"),
    bkInstrucciones: $("bkInstrucciones"),
    tasaDolar: $("tasaDolar"), tasaInfo: $("tasaInfo"),
    parte1Usd: $("parte1Usd"), parte2Usd: $("parte2Usd"),
    pago1Desde: $("pago1Desde"), pago1Hasta: $("pago1Hasta"),
    pago2Desde: $("pago2Desde"), pago2Hasta: $("pago2Hasta"),
    equipoForm: $("equipoForm"),
    equipoNombre: $("equipoNombre"),
    equipoColor: $("equipoColor"),
    equipoCupo: $("equipoCupo"),
    equipoOrden: $("equipoOrden"),
    equipoNote: $("equipoNote"),
    adminEquipos: $("adminEquipos"),
    habitacionForm: $("habitacionForm"),
    habitacionNombre: $("habitacionNombre"),
    habitacionCupo: $("habitacionCupo"),
    habitacionNote: $("habitacionNote"),
    adminHabitaciones: $("adminHabitaciones"),
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    els.loading.innerHTML = "<p>Falta configurar Supabase en config.js.</p>";
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  if (window.initSessionGuard) {
    window.initSessionGuard(sb, { idleMinutes: Number(CONFIG.SESSION_IDLE_MINUTES) || 30 });
  }

  const TABS = ["resumen", "pagos", "participantes", "comidas", "staff", "equipos", "habitaciones", "ajustes"];
  const ESTADO_LABEL = { en_revision: "Por verificar", aprobado: "Verificado", rechazado: "Rechazado" };
  const TIPO_LABEL = { pago_movil: "Pago móvil", transferencia: "Transferencia" };
  const ROL_LABEL = { participante: "Participante", lector: "Lector QR", staff: "Staff", admin: "Organizador", master: "Organizador principal" };

  let me = null;
  let myId = null;
  let teams = [];
  let rooms = [];
  let people = [];
  let pagos = [];

  function show(view) {
    [els.loading, els.denied, els.admin].forEach((el) => (el.hidden = true));
    view.hidden = false;
  }

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function avatarUrl(path) {
    return path ? sb.storage.from("avatares").getPublicUrl(path).data.publicUrl : "";
  }

  function initials(name) {
    const p = (name || "").trim().split(/\s+/).filter(Boolean);
    return p.length ? (p[0][0] + (p[1]?.[0] || "")).toUpperCase() : "?";
  }

  function avatarTag(person, cls) {
    const url = avatarUrl(person.avatar_path);
    return url
      ? `<img class="${cls}" src="${esc(url)}" alt="${esc(person.nombre || "")}" loading="lazy" />`
      : `<span class="${cls}">${esc(initials(person.nombre))}</span>`;
  }

  /* ---------------- Arranque ---------------- */
  async function init() {
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session) {
      window.location.href = "panel.html";
      return;
    }
    myId = session.user.id;

    const { data: prof, error } = await sb
      .from("profiles")
      .select("id, nombre, rol")
      .eq("id", myId)
      .maybeSingle();

    if (error || !prof || !["staff", "admin", "master"].includes(prof.rol)) {
      show(els.denied);
      return;
    }

    me = prof;
    els.userEmail.textContent = session.user.email;
    els.logoutBtn.hidden = false;
    els.adminRole.textContent = ROL_LABEL[prof.rol] || prof.rol;
    show(els.admin);

    // Equipos, habitaciones y staff: solo el master
    if (prof.rol !== "master") {
      els.tabs.querySelector('[data-tab="equipos"]').hidden = true;
      els.tabs.querySelector('[data-tab="habitaciones"]').hidden = true;
      els.tabs.querySelector('[data-tab="staff"]').hidden = true;
    }
    if (!esAdminOMaster()) {
      els.tabs.querySelector('[data-tab="ajustes"]').hidden = true;
    }
    els.fichaSelector.hidden = prof.rol !== "master";
    // Cobranzas: solo admin y master (el staff no las ve)
    if (!esAdminOMaster()) {
      els.tabs.querySelector('[data-tab="pagos"]').hidden = true;
    }

    bindTabs();
    bindForms();

    await Promise.all([loadResumen(), loadTeams(), loadRooms()]);
    const tareas = [loadPeople(), loadComidas(), loadBancoAdmin()];
    if (esAdminOMaster()) tareas.push(loadPagos());
    await Promise.all(tareas);
    renderRooms();
    bindStaff();
    bindFicha();
    els.comidaForm.hidden = !esAdminOMaster();
  }

  function esMaster() {
    return me?.rol === "master";
  }

  function esAdminOMaster() {
    return me?.rol === "admin" || me?.rol === "master";
  }

  function bindTabs() {
    els.tabs.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => switchTab(btn.dataset.tab))
    );
  }

  function switchTab(tab) {
    const btn = els.tabs.querySelector(`[data-tab="${tab}"]`);
    if (btn?.hidden) tab = "resumen";
    els.tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    TABS.forEach((t) => ($(`tab-${t}`).hidden = t !== tab));
  }

  /* ---------------- Resumen ---------------- */
  async function loadResumen() {
    const { data, error } = await sb.rpc("resumen_evento");
    if (error) {
      console.error("[admin] resumen", error);
      els.statGrid.innerHTML = '<p class="empty-note">No se pudo cargar el resumen.</p>';
      return;
    }
    const r = data || {};
    const financiero = esAdminOMaster();
    const items = [
      ["Participantes", r.participantes, false],
      ["Sin equipo", r.sin_equipo, r.sin_equipo > 0],
      ["Solicitudes de equipo", r.solicitudes_equipo, r.solicitudes_equipo > 0],
      ["Sin habitación", r.sin_habitacion, r.sin_habitacion > 0],
      ["Equipos", r.equipos, false],
      ["Habitaciones", r.habitaciones, false],
      ["Staff", (r.staff || 0) + (r.admins || 0) + (r.masters || 0), false],
    ];
    if (financiero) {
      items.push(["Pagos por verificar", r.pagos_por_verificar, r.pagos_por_verificar > 0]);
      items.push(["Pagos verificados", r.pagos_verificados, false]);
    }

    els.statGrid.innerHTML = items
      .map(([label, value, alert]) =>
        `<div class="stat ${alert ? "stat--alert" : ""}"><strong>${value ?? 0}</strong><span>${label}</span></div>`
      )
      .join("");

    // Bloque de finanzas: solo lectura, únicamente admin/master
    if (financiero) {
      const bs = (n) => `${Number(n || 0).toLocaleString("es-VE")} Bs`;
      els.financeBlock.hidden = false;
      els.financeGrid.innerHTML = [
        ["Recaudado (verificado)", bs(r.recaudado), "ok"],
        ["Monto por verificar", bs(r.por_verificar_monto), "warn"],
        ["Pagos verificados", r.pagos_verificados ?? 0, ""],
        ["Pagos por verificar", r.pagos_por_verificar ?? 0, "warn"],
      ]
        .map(
          ([label, value, kind]) => `
          <div class="finance-item finance-item--${kind}">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>`
        )
        .join("");
    } else {
      els.financeBlock.hidden = true;
    }

    const pend = r.pagos_por_verificar || 0;
    els.tabPagos.hidden = !financiero || pend === 0;
    els.tabPagos.textContent = pend;
  }

  /* ---------------- Pagos ---------------- */
  async function loadPagos() {
    const { data, error } = await sb
      .from("pagos")
      .select("id, parte, tipo_pago, banco_origen, referencia, monto, moneda, estado, nota, comprobante_path, created_at, profile_id, profiles!pagos_profile_id_fkey(nombre, email, avatar_path)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[admin] pagos", error);
      els.adminPagosList.innerHTML = '<p class="empty-note">No se pudieron cargar los pagos.</p>';
      return;
    }
    pagos = data || [];
    renderPagos();
  }

  function renderPagos() {
    const filtro = els.filtroPagos.value;
    const lista = filtro ? pagos.filter((p) => p.estado === filtro) : pagos;

    if (!lista.length) {
      els.adminPagosList.innerHTML = '<p class="empty-note">No hay pagos en esta vista.</p>';
      return;
    }

    els.adminPagosList.innerHTML = lista
      .map((p) => {
        const quien = p.profiles || {};
        const fecha = new Date(p.created_at).toLocaleString("es-VE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        const monto = p.monto ? `${Number(p.monto).toLocaleString("es-VE")} ${p.moneda}` : "—";
        const acciones =
          p.estado === "en_revision"
            ? `<input class="pago-nota" data-id="${p.id}" placeholder="Nota (opcional al rechazar)" />
               <button class="btn btn--ok btn--xs" data-accion="aprobado" data-id="${p.id}">Verificar</button>
               <button class="btn btn--no btn--xs" data-accion="rechazado" data-id="${p.id}">Rechazar</button>`
            : `<span class="estado estado--${p.estado}">${ESTADO_LABEL[p.estado]}</span>
               <button class="btn btn--ghost btn--xs" data-accion="en_revision" data-id="${p.id}">Reabrir</button>`;
        return `
          <div class="pago-item">
            <div class="admin-row__info">
              ${avatarTag(quien, "mini-avatar")}
              <div>
                <strong>${esc(quien.nombre || "Sin nombre")}</strong>
                <small>${esc(quien.email || "")}</small>
                <small>Parte ${p.parte} · ${TIPO_LABEL[p.tipo_pago] || p.tipo_pago} · ${esc(p.banco_origen)} · Ref. ${esc(p.referencia)} · ${monto}</small>
                <small>${fecha}${p.nota ? ` · Nota: ${esc(p.nota)}` : ""}</small>
              </div>
            </div>
            <div class="pago-item__side">
              <a class="view" href="#" data-file="${esc(p.comprobante_path || "")}">Ver comprobante</a>
              ${acciones}
            </div>
          </div>`;
      })
      .join("");

    els.adminPagosList.querySelectorAll("a.view").forEach((a) =>
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const { data, error } = await sb.storage.from("comprobantes").createSignedUrl(a.dataset.file, 3600);
        if (error) return;
        window.open(data.signedUrl, "_blank", "noopener");
      })
    );

    els.adminPagosList.querySelectorAll("button[data-accion]").forEach((btn) =>
      btn.addEventListener("click", () => cambiarEstadoPago(btn.dataset.id, btn.dataset.accion))
    );
  }

  async function cambiarEstadoPago(id, estado) {
    const notaInput = els.adminPagosList.querySelector(`.pago-nota[data-id="${id}"]`);
    const patch = { estado, revisado_por: myId, revisado_at: new Date().toISOString() };
    if (notaInput && notaInput.value.trim()) patch.nota = notaInput.value.trim();

    const { error } = await sb.from("pagos").update(patch).eq("id", id);
    if (error) {
      console.error("[admin] cambiar estado", error);
      alert(`No se pudo actualizar: ${error.message}`);
      return;
    }
    await Promise.all([loadPagos(), loadResumen()]);
  }

  els.filtroPagos.addEventListener("change", renderPagos);

  /* ---------------- Participantes ---------------- */
  async function loadPeople() {
    const { data, error } = await sb.rpc("participantes_lista");
    if (error) {
      console.error("[admin] participantes", error);
      els.adminPeople.innerHTML = '<p class="empty-note">No se pudo cargar la lista.</p>';
      return;
    }
    people = data || [];
    renderPeople();
    renderStaff();
  }

  function rolOptions(sel) {
    return ["participante", "lector", "staff", "admin", "master"]
      .map((r) => `<option value="${r}" ${r === sel ? "selected" : ""}>${ROL_LABEL[r]}</option>`)
      .join("");
  }

  /* ---------------- Ficha del participante (master) ---------------- */
  function abrirFicha(id) {
    const p = people.find((x) => x.id === id);
    if (!p) return;

    const url = avatarUrl(p.avatar_path);
    const foto = url
      ? `<img src="${esc(url)}" alt="${esc(p.nombre || "")}" />`
      : `<span class="ficha-avatar">${esc(initials(p.nombre))}</span>`;

    const equipo = p.equipo_nombre
      ? `<span class="color-chip" style="background:${esc(p.equipo_color)}"></span> ${esc(p.equipo_nombre)}`
      : "Sin equipo";
    const solicitud = p.equipo_pendiente_nombre
      ? ` (solicitó ${esc(p.equipo_pendiente_nombre)})`
      : "";
    const fecha = new Date(p.created_at).toLocaleString("es-VE", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const filas = [
      ["Correo", p.email],
      ["Teléfono / WhatsApp", p.telefono],
      ["Edad", p.edad],
      ["Iglesia / Distrito", p.iglesia],
      ["Talla de camiseta", p.talla],
      ["Contacto de emergencia", p.emergencia],
      ["Alergias / condiciones", p.notas],
      ["Equipo", equipo + solicitud],
      ["Habitación", p.habitacion_nombre || "Sin asignar"],
      ["Inscripción", fecha],
    ];

    els.fichaBody.innerHTML = `
      <div class="ficha-head">
        ${foto}
        <div>
          <h2 id="fichaNombre">${esc(p.nombre || "Sin nombre")}</h2>
          <small>${esc(ROL_LABEL[p.rol] || p.rol)}</small>
        </div>
      </div>
      <dl class="ficha-list">
        ${filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${v === null || v === undefined || v === "" ? "—" : (k === "Equipo" ? v : esc(v))}</dd></div>`).join("")}
      </dl>

      <div class="ficha-pass">
        <h3>Contraseña</h3>
        <p class="ficha-pass__note">
          Por seguridad la contraseña actual está <strong>cifrada y no se puede ver</strong>.
          Puedes asignar una nueva y dársela al usuario.
        </p>
        <div class="ficha-pass__row">
          <input type="text" id="fichaNewPass" placeholder="Nueva contraseña (mín. 8)" autocomplete="off" />
          <button type="button" class="btn btn--ghost btn--xs" id="fichaGenPass">Generar</button>
          <button type="button" class="btn btn--primary btn--xs" id="fichaSetPass">Restablecer</button>
        </div>
        <p class="form-note" id="fichaPassNote" role="status"></p>
      </div>`;

    els.fichaOverlay.hidden = false;
    document.body.style.overflow = "hidden";

    const fotoEl = els.fichaBody.querySelector(".ficha-head img");
    if (fotoEl) fotoEl.addEventListener("click", () => abrirLightbox(fotoEl.src));

    const passInput = document.getElementById("fichaNewPass");
    document.getElementById("fichaGenPass").addEventListener("click", () => {
      passInput.value = generarClave();
      passInput.focus();
    });
    document.getElementById("fichaSetPass").addEventListener("click", () => {
      restablecerPassword(id, passInput.value);
    });
  }

  function generarClave() {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 10; i++) out += abc[Math.floor(Math.random() * abc.length)];
    return out;
  }

  async function restablecerPassword(id, pass) {
    const note = document.getElementById("fichaPassNote");
    if (!pass || pass.length < 8) {
      note.textContent = "La contraseña debe tener al menos 8 caracteres.";
      note.className = "form-note error";
      return;
    }
    note.textContent = "Guardando…";
    note.className = "form-note";
    const { error } = await sb.rpc("restablecer_password", { p_id: id, p_password: pass });
    if (error) {
      note.textContent = `No se pudo restablecer: ${error.message}`;
      note.className = "form-note error";
      return;
    }
    note.innerHTML = `Contraseña actualizada. Compártela con el usuario: <strong>${esc(pass)}</strong>`;
    note.className = "form-note ok";
  }

  function cerrarFicha() {
    els.fichaOverlay.hidden = true;
    cerrarLightbox();
    document.body.style.overflow = "";
  }

  function abrirLightbox(src) {
    if (!src) return;
    els.lightboxImg.src = src;
    els.lightbox.hidden = false;
  }

  function cerrarLightbox() {
    els.lightbox.hidden = true;
    els.lightboxImg.removeAttribute("src");
  }

  async function setRole(personId, rol) {
    const { error } = await sb.from("profiles").update({ rol }).eq("id", personId);
    if (error) {
      alert(`No se pudo cambiar el rol: ${error.message}`);
      return;
    }
    await Promise.all([loadPeople(), loadResumen()]);
  }

  async function borrarCuenta(id, nombre) {
    if (!confirm(`¿Borrar la cuenta de "${nombre}"?\n\nSe elimina el usuario, su perfil, su foto y sus pagos. No se puede deshacer.`)) return;
    const { error } = await sb.rpc("borrar_cuenta", { p_id: id });
    if (error) {
      alert(`No se pudo borrar: ${error.message}`);
      return;
    }
    await Promise.all([loadPeople(), loadResumen(), loadTeams()]);
  }

  function renderStaff() {
    const q = els.buscarStaff.value.trim().toLowerCase();
    const lista = q
      ? people.filter((p) => `${p.nombre || ""} ${p.email || ""}`.toLowerCase().includes(q))
      : people;

    const masters = people.filter((p) => p.rol === "master").length;
    const admins = people.filter((p) => p.rol === "admin").length;
    els.staffCount.textContent = `${masters} master · ${admins} admin · ${people.length} usuarios`;

    if (!lista.length) {
      els.adminStaff.innerHTML = '<p class="empty-note">Sin resultados.</p>';
      return;
    }

    els.adminStaff.innerHTML = lista
      .map(
        (p) => `
        <div class="person">
          <div class="person__main">
            ${avatarTag(p, "mini-avatar")}
            <div class="person__data">
              <strong>${esc(p.nombre || "Sin nombre")}${p.id === myId ? ' <span class="yo">Tú</span>' : ""}</strong>
              <small>${esc(p.email || "")}</small>
            </div>
          </div>
          <div class="person__controls">
            <label class="mini-label">Rol
              <select data-staff-rol="${p.id}">${rolOptions(p.rol)}</select>
            </label>
            ${
              p.id !== myId
                ? `<button class="btn btn--no btn--xs" data-borrar="${p.id}">Borrar</button>`
                : ""
            }
          </div>
        </div>`
      )
      .join("");

    els.adminStaff.querySelectorAll("select[data-staff-rol]").forEach((sel) =>
      sel.addEventListener("change", () => setRole(sel.dataset.staffRol, sel.value))
    );

    els.adminStaff.querySelectorAll("button[data-borrar]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const persona = people.find((p) => p.id === btn.dataset.borrar);
        borrarCuenta(btn.dataset.borrar, persona?.nombre || "esta persona");
      })
    );
  }

  function bindFicha() {
    els.fichaClose.addEventListener("click", cerrarFicha);
    els.fichaOverlay.addEventListener("click", (e) => {
      if (e.target === els.fichaOverlay) cerrarFicha();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!els.lightbox.hidden) cerrarLightbox();
      else cerrarFicha();
    });
    els.lightboxClose.addEventListener("click", cerrarLightbox);
    els.lightbox.addEventListener("click", (e) => {
      if (e.target === els.lightbox) cerrarLightbox();
    });
    els.fichaSelect.addEventListener("change", () => {
      if (els.fichaSelect.value) abrirFicha(els.fichaSelect.value);
      els.fichaSelect.value = "";
    });
  }

  function bindStaff() {
    els.buscarStaff.addEventListener("input", renderStaff);
  }

  function renderPeople() {
    const q = els.buscarParticipante.value.trim().toLowerCase();
    const lista = q
      ? people.filter((p) => `${p.nombre || ""} ${p.email || ""}`.toLowerCase().includes(q))
      : people;

    els.participantesCount.textContent = `${lista.length} de ${people.length}`;

    if (!lista.length) {
      els.adminPeople.innerHTML = '<p class="empty-note">Sin resultados.</p>';
      return;
    }

    const roomOptions = (sel) =>
      '<option value="">Sin habitación</option>' +
      rooms
        .map((r) => `<option value="${r.id}" ${r.id === sel ? "selected" : ""}>${esc(r.nombre)}</option>`)
        .join("");

    const teamOptions = (sel) =>
      '<option value="">Sin equipo</option>' +
      teams
        .map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.nombre)}</option>`)
        .join("");

    const dis = esMaster() ? "" : "disabled";

    els.adminPeople.innerHTML = lista
      .map((p) => {
        const equipo = p.equipo_nombre
          ? `<span class="chip" style="background:${esc(p.equipo_color)};width:14px;height:14px;border:0"></span> ${esc(p.equipo_nombre)}`
          : "Sin equipo";
        const solicitud = p.equipo_pendiente_id
          ? `<div class="solicitud">
               <span class="chip" style="background:${esc(p.equipo_pendiente_color)};width:12px;height:12px;border:0"></span>
               Solicita <strong>${esc(p.equipo_pendiente_nombre)}</strong>
               ${
                 esMaster()
                   ? `<button class="btn btn--ok btn--xs" data-ok="${p.id}">Aprobar</button>
                      <button class="btn btn--no btn--xs" data-no="${p.id}">Rechazar</button>`
                   : ""
               }
             </div>`
          : "";
        return `
          <div class="person">
            <div class="person__main">
              ${avatarTag(p, "mini-avatar")}
              <div class="person__data">
                <strong>${esc(p.nombre || "Sin nombre")}</strong>
                <small>${esc(p.email || "")}</small>
                <small>${esc(p.iglesia || "Sin iglesia")} · ${p.edad ?? "—"} años · Talla ${esc(p.talla || "—")} · ${equipo}</small>
                ${solicitud}
              </div>
            </div>
            <div class="person__controls">
              <label class="mini-label">Equipo
                <select data-team="${p.id}" ${dis}>${teamOptions(p.equipo_id)}</select>
              </label>
              <label class="mini-label">Habitación
                <select data-room="${p.id}" ${dis}>${roomOptions(p.habitacion_id)}</select>
              </label>
              <label class="mini-label">Rol
                <select data-rol="${p.id}" ${esMaster() ? "" : "disabled"}>${rolOptions(p.rol)}</select>
              </label>
              ${
                esMaster() && p.id !== myId
                  ? `<button class="btn btn--ghost btn--xs" data-ficha="${p.id}">Ver ficha</button>
                     <button class="btn btn--no btn--xs" data-borrar="${p.id}">Borrar</button>`
                  : ""
              }
            </div>
          </div>`;
      })
      .join("");

    els.adminPeople.querySelectorAll("select[data-team]").forEach((sel) =>
      sel.addEventListener("change", async () => {
        const { error } = await sb
          .from("profiles")
          .update({ equipo_id: sel.value || null, equipo_pendiente_id: null })
          .eq("id", sel.dataset.team);
        if (error) {
          alert(`No se pudo asignar: ${error.message}`);
          return;
        }
        await Promise.all([loadPeople(), loadTeams(), loadResumen()]);
      })
    );

    els.adminPeople.querySelectorAll("button[data-ok]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const persona = people.find((p) => p.id === btn.dataset.ok);
        if (!persona) return;
        const { error } = await sb
          .from("profiles")
          .update({ equipo_id: persona.equipo_pendiente_id, equipo_pendiente_id: null })
          .eq("id", persona.id);
        if (error) {
          alert(`No se pudo aprobar: ${error.message}`);
          return;
        }
        await Promise.all([loadPeople(), loadTeams(), loadResumen()]);
      })
    );

    els.adminPeople.querySelectorAll("button[data-no]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const { error } = await sb
          .from("profiles")
          .update({ equipo_pendiente_id: null })
          .eq("id", btn.dataset.no);
        if (error) {
          alert(`No se pudo rechazar: ${error.message}`);
          return;
        }
        await Promise.all([loadPeople(), loadTeams(), loadResumen()]);
      })
    );

    els.adminPeople.querySelectorAll("select[data-room]").forEach((sel) =>
      sel.addEventListener("change", async () => {
        const { error } = await sb
          .from("profiles")
          .update({ habitacion_id: sel.value || null })
          .eq("id", sel.dataset.room);
        if (error) {
          alert(`No se pudo asignar: ${error.message}`);
          return;
        }
        await Promise.all([loadPeople(), loadResumen()]);
      })
    );

    els.adminPeople.querySelectorAll("select[data-rol]").forEach((sel) =>
      sel.addEventListener("change", () => setRole(sel.dataset.rol, sel.value))
    );

    els.adminPeople.querySelectorAll("button[data-borrar]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const persona = people.find((p) => p.id === btn.dataset.borrar);
        borrarCuenta(btn.dataset.borrar, persona?.nombre || "esta persona");
      })
    );

    els.adminPeople.querySelectorAll("button[data-ficha]").forEach((btn) =>
      btn.addEventListener("click", () => abrirFicha(btn.dataset.ficha))
    );

    // select de ficha (solo master)
    if (esMaster()) {
      els.fichaSelect.innerHTML =
        '<option value="">Elegir participante…</option>' +
        lista
          .map((p) => `<option value="${p.id}">${esc(p.nombre || p.email)} — ${esc(p.email)}</option>`)
          .join("");
    }
  }

  els.buscarParticipante.addEventListener("input", renderPeople);

  /* ---------------- Comidas ---------------- */
  async function loadComidas() {
    const { data, error } = await sb.rpc("comidas_resumen");
    if (error) {
      console.error("[admin] comidas", error);
      els.adminComidas.innerHTML = '<p class="empty-note">No se pudieron cargar las comidas.</p>';
      return;
    }
    renderComidas(data || []);
  }

  function renderComidas(comidas) {
    if (!comidas.length) {
      els.adminComidas.innerHTML =
        '<p class="empty-note">Todavía no hay comidas. ' +
        (esAdminOMaster() ? "Crea la primera en el formulario de arriba." : "Pide al organizador que las cree.") +
        "</p>";
      return;
    }

    els.adminComidas.innerHTML = comidas
      .map(
        (c) => `
        <div class="admin-row comida-row" data-comida="${c.id}">
          <div class="admin-row__info">
            <div>
              <strong>${esc(c.nombre)}</strong>
              <small>${c.dia} · <b>${c.comieron}</b> de ${c.participantes} comieron</small>
            </div>
          </div>
          <div class="admin-row__side">
            <button class="btn btn--ghost btn--xs" data-ver="${c.id}">Ver quiénes</button>
            ${esAdminOMaster() ? `<button class="btn btn--no btn--xs" data-delcomida="${c.id}">Eliminar</button>` : ""}
          </div>
          <div class="comida-detalle" id="det-${c.id}" hidden></div>
        </div>`
      )
      .join("");

    els.adminComidas.querySelectorAll("button[data-ver]").forEach((btn) =>
      btn.addEventListener("click", () => toggleDetalleComida(btn.dataset.ver))
    );
    els.adminComidas.querySelectorAll("button[data-delcomida]").forEach((btn) =>
      btn.addEventListener("click", () => borrarComida(btn.dataset.delcomida))
    );
  }

  async function toggleDetalleComida(id) {
    const box = document.getElementById(`det-${id}`);
    if (!box) return;
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = '<p class="empty-note">Cargando…</p>';

    const { data, error } = await sb.rpc("comida_asistentes", { p_comida: id });
    if (error) {
      box.innerHTML = `<p class="empty-note">${esc(error.message)}</p>`;
      return;
    }
    const lista = data || [];
    const comieron = lista.filter((p) => p.asistio).length;
    const faltan = lista.filter((p) => !p.asistio);

    box.innerHTML = `
      <div class="comida-resumen">
        <span class="verif-chip"><span class="dot" style="background:#7ee2a0"></span>Comieron: ${comieron}</span>
        <span class="verif-chip"><span class="dot" style="background:#ff9a9a"></span>Faltan: ${faltan.length}</span>
      </div>
      <div class="comida-lista">
        ${lista
          .map(
            (p) => `
          <div class="comida-persona ${p.asistio ? "is-ok" : "is-no"}">
            <span class="comida-persona__mark">${p.asistio ? "✓" : "—"}</span>
            <span class="comida-persona__name">${esc(p.nombre)}</span>
            <span class="comida-persona__team">${p.equipo ? esc(p.equipo) : "Sin equipo"}</span>
          </div>`
          )
          .join("")}
      </div>`;
  }

  async function borrarComida(id) {
    if (!confirm("¿Eliminar esta comida y sus registros?")) return;
    const { error } = await sb.from("comidas").delete().eq("id", id);
    if (error) {
      alert(`No se pudo eliminar: ${error.message}`);
      return;
    }
    await Promise.all([loadComidas(), loadResumen()]);
  }

  /* ---------------- Datos bancarios ---------------- */
  async function loadBancoAdmin() {
    const { data, error } = await sb.from("configuracion")
      .select("banco, titular, documento, cuenta, tipo_cuenta, pago_movil_banco, pago_movil_telefono, pago_movil_documento, instrucciones, tasa_dolar, monto_parte1_usd, monto_parte2_usd, tasa_actualizada_at, pago1_desde, pago1_hasta, pago2_desde, pago2_hasta")
      .eq("id", 1).maybeSingle();
    if (error || !data) return;
    els.bkBanco.value = data.banco || "";
    els.bkTitular.value = data.titular || "";
    els.bkDocumento.value = data.documento || "";
    els.bkTipo.value = data.tipo_cuenta || "";
    els.bkCuenta.value = data.cuenta || "";
    els.pmBanco.value = data.pago_movil_banco || "";
    els.pmTelefono.value = data.pago_movil_telefono || "";
    els.pmDocumento.value = data.pago_movil_documento || "";
    els.bkInstrucciones.value = data.instrucciones || "";
    els.tasaDolar.value = data.tasa_dolar ?? "";
    els.parte1Usd.value = data.monto_parte1_usd ?? 20;
    els.parte2Usd.value = data.monto_parte2_usd ?? 15;
    els.tasaInfo.value = data.tasa_actualizada_at
      ? new Date(data.tasa_actualizada_at).toLocaleString("es-VE")
      : "Sin definir";
    els.pago1Desde.value = data.pago1_desde || "";
    els.pago1Hasta.value = data.pago1_hasta || "";
    els.pago2Desde.value = data.pago2_desde || "";
    els.pago2Hasta.value = data.pago2_hasta || "";
  }

  async function guardarBanco(e) {
    e.preventDefault();
    const btn = els.bancoForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Guardando…";
    const { error } = await sb.from("configuracion").update({
      banco: els.bkBanco.value.trim() || null,
      titular: els.bkTitular.value.trim() || null,
      documento: els.bkDocumento.value.trim() || null,
      tipo_cuenta: els.bkTipo.value.trim() || null,
      cuenta: els.bkCuenta.value.trim() || null,
      pago_movil_banco: els.pmBanco.value.trim() || null,
      pago_movil_telefono: els.pmTelefono.value.trim() || null,
      pago_movil_documento: els.pmDocumento.value.trim() || null,
      instrucciones: els.bkInstrucciones.value.trim() || null,
      tasa_dolar: els.tasaDolar.value.trim() === "" ? null : Number(els.tasaDolar.value),
      monto_parte1_usd: Number(els.parte1Usd.value) || 20,
      monto_parte2_usd: Number(els.parte2Usd.value) || 15,
      tasa_actualizada_at: new Date().toISOString(),
      pago1_desde: els.pago1Desde.value || null,
      pago1_hasta: els.pago1Hasta.value || null,
      pago2_desde: els.pago2Desde.value || null,
      pago2_hasta: els.pago2Hasta.value || null,
      actualizado_at: new Date().toISOString(),
    }).eq("id", 1);
    btn.disabled = false; btn.textContent = "Guardar ajustes";
    if (error) {
      els.bancoNote.textContent = `No se pudo guardar: ${error.message}`;
      els.bancoNote.className = "form-note error";
      return;
    }
    els.bancoNote.textContent = "Ajustes guardados (tasa, montos, fechas y datos bancarios).";
    els.bancoNote.className = "form-note ok";
    setTimeout(() => (els.bancoNote.textContent = ""), 3000);
  }

  /* ---------------- Equipos ---------------- */
  async function loadTeams() {
    const { data, error } = await sb.rpc("equipos_resumen");
    if (error) {
      console.error("[admin] equipos", error);
      return;
    }
    teams = data || [];
    renderTeams();
  }

  function renderTeams() {
    if (!teams.length) {
      els.adminEquipos.innerHTML = '<p class="empty-note">Todavía no hay equipos.</p>';
      return;
    }
    els.adminEquipos.innerHTML = teams
      .map(
        (t) => `
        <div class="admin-row" data-team-row="${t.id}">
          <div class="admin-row__info">
            <input type="text" value="${esc(t.nombre)}" data-f="nombre" />
            <input type="color" value="${esc(t.color)}" data-f="color" />
            <input type="number" min="0" value="${t.cupo}" data-f="cupo" title="Cupo (0 = sin límite)" />
            <input type="number" min="0" value="${t.orden}" data-f="orden" title="Orden" />
            <small>${t.ocupados} confirmados · ${t.pendientes} por aprobar</small>
          </div>
          <div class="admin-row__side">
            ${esMaster() ? `<button class="btn btn--ghost btn--xs" data-miembros="${t.id}">Ver miembros</button>` : ""}
            <button class="btn btn--primary btn--xs" data-save="${t.id}">Guardar</button>
            <button class="btn btn--no btn--xs" data-del="${t.id}">Eliminar</button>
          </div>
          <div class="equipo-detalle" id="miem-${t.id}" hidden></div>
        </div>`
      )
      .join("");

    els.adminEquipos.querySelectorAll("button[data-save]").forEach((btn) =>
      btn.addEventListener("click", () => saveTeam(btn.dataset.save))
    );
    els.adminEquipos.querySelectorAll("button[data-del]").forEach((btn) =>
      btn.addEventListener("click", () => deleteTeam(btn.dataset.del))
    );
    els.adminEquipos.querySelectorAll("button[data-miembros]").forEach((btn) =>
      btn.addEventListener("click", () => toggleMiembrosEquipo(btn.dataset.miembros))
    );
  }

  async function toggleMiembrosEquipo(id) {
    const box = document.getElementById(`miem-${id}`);
    if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<p class="empty-note">Cargando…</p>';

    const { data, error } = await sb.rpc("equipo_miembros", { p_equipo: id });
    if (error) { box.innerHTML = `<p class="empty-note">${esc(error.message)}</p>`; return; }
    const lista = data || [];
    if (!lista.length) { box.innerHTML = '<p class="empty-note">Sin integrantes todavía.</p>'; return; }

    box.innerHTML = `
      <p class="panel-muted">Orden de inscripción (el 1 fue el primero). Los que pasen del cupo deben salir del equipo.</p>
      <div class="comida-lista">
        ${lista.map((m) => `
          <div class="comida-persona is-no" style="background:rgba(255,255,255,0.04)">
            <span class="comida-persona__mark" style="color:var(--amber)">${m.posicion}</span>
            <span class="comida-persona__name">${esc(m.nombre)}</span>
            <span class="comida-persona__team">${new Date(m.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "2-digit" })}</span>
          </div>`).join("")}
      </div>`;
  }

  async function saveTeam(id) {
    const row = els.adminEquipos.querySelector(`[data-team-row="${id}"]`);
    const patch = {};
    row.querySelectorAll("[data-f]").forEach((el) => {
      patch[el.dataset.f] = el.dataset.f === "cupo" || el.dataset.f === "orden" ? Number(el.value) : el.value;
    });
    const { error } = await sb.from("equipos").update(patch).eq("id", id);
    if (error) {
      alert(`No se pudo guardar: ${error.message}`);
      return;
    }
    await Promise.all([loadTeams(), loadResumen()]);
  }

  async function deleteTeam(id) {
    if (!confirm("¿Eliminar este equipo? Los participantes quedarán sin equipo.")) return;
    const { error } = await sb.from("equipos").delete().eq("id", id);
    if (error) {
      alert(`No se pudo eliminar: ${error.message}`);
      return;
    }
    await Promise.all([loadTeams(), loadResumen(), loadPeople()]);
  }

  /* ---------------- Habitaciones ---------------- */
  async function loadRooms() {
    const { data, error } = await sb.from("habitaciones").select("*").order("nombre");
    if (error) {
      console.error("[admin] habitaciones", error);
      return;
    }
    rooms = data || [];
    renderRooms();
  }

  function renderRooms() {
    if (!rooms.length) {
      els.adminHabitaciones.innerHTML = '<p class="empty-note">Todavía no hay habitaciones.</p>';
      return;
    }
    els.adminHabitaciones.innerHTML = rooms
      .map((r) => {
        const ocupados = people.filter((p) => p.habitacion_id === r.id).length;
        return `
        <div class="admin-row" data-room-row="${r.id}">
          <div class="admin-row__info">
            <input type="text" value="${esc(r.nombre)}" data-f="nombre" />
            <input type="number" min="1" value="${r.cupo}" data-f="cupo" title="Cupo" />
            <small>${ocupados} asignados</small>
          </div>
          <div class="admin-row__side">
            <button class="btn btn--primary btn--xs" data-save="${r.id}">Guardar</button>
            <button class="btn btn--no btn--xs" data-del="${r.id}">Eliminar</button>
          </div>
        </div>`;
      })
      .join("");

    els.adminHabitaciones.querySelectorAll("button[data-save]").forEach((btn) =>
      btn.addEventListener("click", () => saveRoom(btn.dataset.save))
    );
    els.adminHabitaciones.querySelectorAll("button[data-del]").forEach((btn) =>
      btn.addEventListener("click", () => deleteRoom(btn.dataset.del))
    );
  }

  async function saveRoom(id) {
    const row = els.adminHabitaciones.querySelector(`[data-room-row="${id}"]`);
    const patch = {};
    row.querySelectorAll("[data-f]").forEach((el) => {
      patch[el.dataset.f] = el.dataset.f === "cupo" ? Number(el.value) : el.value;
    });
    const { error } = await sb.from("habitaciones").update(patch).eq("id", id);
    if (error) {
      alert(`No se pudo guardar: ${error.message}`);
      return;
    }
    await Promise.all([loadRooms(), loadResumen()]);
  }

  async function deleteRoom(id) {
    if (!confirm("¿Eliminar esta habitación?")) return;
    const { error } = await sb.from("habitaciones").delete().eq("id", id);
    if (error) {
      alert(`No se pudo eliminar: ${error.message}`);
      return;
    }
    await Promise.all([loadRooms(), loadResumen(), loadPeople()]);
  }

  /* ---------------- Formularios ---------------- */
  function bindForms() {
    els.equipoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await sb.from("equipos").insert({
        nombre: els.equipoNombre.value.trim(),
        color: els.equipoColor.value,
        cupo: Number(els.equipoCupo.value) || 0,
        orden: Number(els.equipoOrden.value) || 0,
      });
      if (error) {
        els.equipoNote.textContent = error.message;
        els.equipoNote.className = "form-note error";
        return;
      }
      els.equipoForm.reset();
      els.equipoColor.value = "#ff6a00";
      els.equipoCupo.value = 0;
      els.equipoOrden.value = 0;
      els.equipoNote.textContent = "Equipo agregado.";
      els.equipoNote.className = "form-note ok";
      await Promise.all([loadTeams(), loadResumen()]);
      setTimeout(() => (els.equipoNote.textContent = ""), 3000);
    });

    els.comidaForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await sb.from("comidas").insert({
        nombre: els.comidaNombre.value.trim(),
        dia: els.comidaDia.value,
        orden: Number(els.comidaOrden.value) || 0,
      });
      if (error) {
        els.comidaNote.textContent = error.message;
        els.comidaNote.className = "form-note error";
        return;
      }
      els.comidaForm.reset();
      els.comidaOrden.value = 0;
      els.comidaNote.textContent = "Comida agregada.";
      els.comidaNote.className = "form-note ok";
      await Promise.all([loadComidas(), loadResumen()]);
      setTimeout(() => (els.comidaNote.textContent = ""), 3000);
    });

    els.bancoForm.addEventListener("submit", guardarBanco);

    els.habitacionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await sb.from("habitaciones").insert({
        nombre: els.habitacionNombre.value.trim(),
        cupo: Number(els.habitacionCupo.value) || 1,
      });
      if (error) {
        els.habitacionNote.textContent = error.message;
        els.habitacionNote.className = "form-note error";
        return;
      }
      els.habitacionForm.reset();
      els.habitacionCupo.value = 4;
      els.habitacionNote.textContent = "Habitación agregada.";
      els.habitacionNote.className = "form-note ok";
      await Promise.all([loadRooms(), loadResumen()]);
      setTimeout(() => (els.habitacionNote.textContent = ""), 3000);
    });

    els.logoutBtn.addEventListener("click", async () => {
      await sb.auth.signOut();
      window.location.href = "panel.html";
    });
  }

  init();
})();
