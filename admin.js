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
    filtroPagos: $("filtroPagos"),
    adminPagosList: $("adminPagosList"),
    buscarParticipante: $("buscarParticipante"),
    participantesCount: $("participantesCount"),
    adminPeople: $("adminPeople"),
    buscarStaff: $("buscarStaff"),
    staffCount: $("staffCount"),
    adminStaff: $("adminStaff"),
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

  const TABS = ["resumen", "pagos", "participantes", "staff", "equipos", "habitaciones"];
  const ESTADO_LABEL = { en_revision: "Por verificar", aprobado: "Verificado", rechazado: "Rechazado" };
  const TIPO_LABEL = { pago_movil: "Pago móvil", transferencia: "Transferencia" };
  const ROL_LABEL = { participante: "Participante", admin: "Organizador", master: "Organizador principal" };

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

    if (error || !prof || (prof.rol !== "admin" && prof.rol !== "master")) {
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

    bindTabs();
    bindForms();

    await Promise.all([loadResumen(), loadTeams(), loadRooms()]);
    await Promise.all([loadPagos(), loadPeople()]);
    renderRooms();
    bindStaff();
  }

  function esMaster() {
    return me?.rol === "master";
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
    const items = [
      ["Participantes", r.participantes, false],
      ["Sin equipo", r.sin_equipo, r.sin_equipo > 0],
      ["Solicitudes de equipo", r.solicitudes_equipo, r.solicitudes_equipo > 0],
      ["Sin habitación", r.sin_habitacion, r.sin_habitacion > 0],
      ["Equipos", r.equipos, false],
      ["Habitaciones", r.habitaciones, false],
      ["Pagos por verificar", r.pagos_por_verificar, r.pagos_por_verificar > 0],
      ["Pagos verificados", r.pagos_verificados, false],
    ];
    els.statGrid.innerHTML = items
      .map(([label, value, alert]) =>
        `<div class="stat ${alert ? "stat--alert" : ""}"><strong>${value ?? 0}</strong><span>${label}</span></div>`
      )
      .join("");

    const pend = r.pagos_por_verificar || 0;
    els.tabPagos.hidden = pend === 0;
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
    return ["participante", "admin", "master"]
      .map((r) => `<option value="${r}" ${r === sel ? "selected" : ""}>${ROL_LABEL[r]}</option>`)
      .join("");
  }

  async function setRole(personId, rol) {
    const { error } = await sb.from("profiles").update({ rol }).eq("id", personId);
    if (error) {
      alert(`No se pudo cambiar el rol: ${error.message}`);
      return;
    }
    await Promise.all([loadPeople(), loadResumen()]);
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
          </div>
        </div>`
      )
      .join("");

    els.adminStaff.querySelectorAll("select[data-staff-rol]").forEach((sel) =>
      sel.addEventListener("change", () => setRole(sel.dataset.staffRol, sel.value))
    );
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
               <button class="btn btn--ok btn--xs" data-ok="${p.id}">Aprobar</button>
               <button class="btn btn--no btn--xs" data-no="${p.id}">Rechazar</button>
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
  }

  els.buscarParticipante.addEventListener("input", renderPeople);

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
            <button class="btn btn--primary btn--xs" data-save="${t.id}">Guardar</button>
            <button class="btn btn--no btn--xs" data-del="${t.id}">Eliminar</button>
          </div>
        </div>`
      )
      .join("");

    els.adminEquipos.querySelectorAll("button[data-save]").forEach((btn) =>
      btn.addEventListener("click", () => saveTeam(btn.dataset.save))
    );
    els.adminEquipos.querySelectorAll("button[data-del]").forEach((btn) =>
      btn.addEventListener("click", () => deleteTeam(btn.dataset.del))
    );
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
