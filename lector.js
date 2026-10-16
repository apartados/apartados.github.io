(function () {
  "use strict";

  const CONFIG = window.APARTA2_CONFIG || {};
  const SUPABASE_URL = (CONFIG.SUPABASE_URL || "").replace(/\/+$/, "");
  const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY || "";

  const ROLES_OK = ["lector", "staff", "admin", "master"];
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  const $ = (id) => document.getElementById(id);
  const els = {
    loading: $("viewLoading"),
    login: $("viewLogin"),
    denied: $("viewDenied"),
    lector: $("viewLector"),
    loginForm: $("loginForm"),
    loginNote: $("loginNote"),
    loginEmail: $("loginEmail"),
    loginPass: $("loginPass"),
    userEmail: $("userEmail"),
    logoutBtn: $("logoutBtn"),
    mealSelect: $("mealSelect"),
    mealHint: $("mealHint"),
    camWrap: $("camWrap"),
    cam: $("cam"),
    camResult: $("camResult"),
    resultStatus: $("resultStatus"),
    resultName: $("resultName"),
    resultMeal: $("resultMeal"),
    startCam: $("startCam"),
    stopCam: $("stopCam"),
    camNote: $("camNote"),
    manualToken: $("manualToken"),
    manualBtn: $("manualBtn"),
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    els.loading.innerHTML = "<p>Falta configurar Supabase en config.js.</p>";
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let stream = null;
  let rafId = 0;
  let canvas = null;
  let ctx = null;
  let lastToken = null;
  let lastTime = 0;
  let resultTimer = 0;

  function show(view) {
    [els.loading, els.login, els.denied, els.lector].forEach((el) => (el.hidden = true));
    view.hidden = false;
  }

  function setNote(el, text, type) {
    el.textContent = text || "";
    el.classList.remove("ok", "error");
    if (type) el.classList.add(type);
  }

  function beep(kind) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g);
      g.connect(ac.destination);
      o.frequency.value = kind === "dup" ? 380 : kind === "bad" ? 200 : 880;
      g.gain.value = 0.08;
      o.start();
      setTimeout(() => {
        o.stop();
        ac.close();
      }, kind === "ok" ? 140 : 260);
    } catch (_) {
      /* sin audio */
    }
  }

  /* ---------------- Sesión ---------------- */
  async function init() {
    const { data } = await sb.auth.getSession();
    await render(data.session);
    sb.auth.onAuthStateChange((_e, session) => render(session));
  }

  async function render(session) {
    if (!session) {
      stopCamera();
      els.userEmail.textContent = "";
      els.logoutBtn.hidden = true;
      show(els.login);
      return;
    }
    els.userEmail.textContent = session.user.email;
    els.logoutBtn.hidden = false;
    show(els.loading);

    const { data: prof, error } = await sb
      .from("profiles")
      .select("rol, nombre")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !prof || !ROLES_OK.includes(prof.rol)) {
      show(els.denied);
      return;
    }

    show(els.lector);
    await loadMeals();
  }

  async function loadMeals() {
    const { data, error } = await sb.rpc("comidas_resumen");
    if (error) {
      console.error("[lector] comidas", error);
      els.mealHint.textContent = "No se pudieron cargar las comidas. Pide al organizador que las cree.";
      els.mealSelect.innerHTML = '<option value="">Sin comidas</option>';
      return;
    }
    if (!data || !data.length) {
      els.mealSelect.innerHTML = '<option value="">Sin comidas</option>';
      els.mealHint.textContent = "Todavía no hay comidas creadas.";
      return;
    }
    els.mealSelect.innerHTML = data
      .map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)} · ${c.dia} (${c.comieron}/${c.participantes})</option>`)
      .join("");
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---------------- Registro ---------------- */
  function mostrarResultado(tipo, nombre, comida) {
    els.camResult.hidden = false;
    els.camResult.className = `cam-result cam-result--${tipo}`;
    els.resultStatus.textContent =
      tipo === "ok"
        ? "Registrado"
        : tipo === "dup"
        ? "Ya había registrado"
        : tipo === "bloq"
        ? "Bloqueado"
        : "No reconocido";
    els.resultName.textContent = nombre || "—";
    els.resultMeal.textContent = comida || "";
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => (els.camResult.hidden = true), tipo === "bloq" ? 4500 : 3000);
  }

  async function registrar(token) {
    const comida = els.mealSelect.value;
    if (!comida) {
      beep("bad");
      mostrarResultado("bad", "Selecciona una comida", "");
      return;
    }

    const { data, error } = await sb.rpc("registrar_comida", { p_token: token, p_comida: comida });

    if (error) {
      console.error("[lector] registrar", error);
      beep("bad");
      mostrarResultado("bad", "Error al registrar", error.message || "");
      return;
    }
    if (!data || data.ok !== true) {
      beep("bad");
      mostrarResultado("bad", "QR no reconocido", "");
      return;
    }
    if (data.bloqueado) {
      beep("dup");
      mostrarResultado("bloq", data.nombre, `Espera ${data.minutos} min para volver a escanear`);
      return;
    }
    if (data.ya_registrado) {
      beep("dup");
      mostrarResultado("dup", data.nombre, data.comida);
    } else {
      beep("ok");
      mostrarResultado("ok", data.nombre, data.comida);
    }
    loadMeals();
  }

  function extraerToken(texto) {
    const m = String(texto || "").match(UUID_RE);
    return m ? m[0] : "";
  }

  /* ---------------- Cámara ---------------- */
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNote(els.camNote, "Este dispositivo o navegador no permite usar la cámara. Usa el registro manual.", "error");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch (err) {
      setNote(els.camNote, `No se pudo abrir la cámara: ${err.message}`, "error");
      return;
    }

    els.cam.srcObject = stream;
    await els.cam.play().catch(() => {});
    els.camWrap.classList.add("is-active");
    els.startCam.hidden = true;
    els.stopCam.hidden = false;
    setNote(els.camNote, "Apunta al QR del participante.", null);

    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d", { willReadFrequently: true });
    scanLoop();
  }

  function stopCamera() {
    cancelAnimationFrame(rafId);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    els.camWrap.classList.remove("is-active");
    els.startCam.hidden = false;
    els.stopCam.hidden = true;
  }

  function scanLoop() {
    if (!stream || !ctx) return;
    const v = els.cam;
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      const w = 480;
      const h = Math.round((v.videoHeight / v.videoWidth) * w) || 640;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(v, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const code = window.jsQR ? window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" }) : null;
      if (code && code.data) {
        const token = extraerToken(code.data);
        const now = Date.now();
        if (token && !(token === lastToken && now - lastTime < 4000)) {
          lastToken = token;
          lastTime = now;
          registrar(token);
        }
      }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  /* ---------------- Eventos ---------------- */
  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = els.loginForm.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Entrando…";
    setNote(els.loginNote, "", null);
    const { error } = await sb.auth.signInWithPassword({
      email: els.loginEmail.value.trim().toLowerCase(),
      password: els.loginPass.value,
    });
    btn.disabled = false;
    btn.textContent = "Entrar";
    if (error) setNote(els.loginNote, "Correo o contraseña incorrectos.", "error");
    else els.loginForm.reset();
  });

  els.logoutBtn.addEventListener("click", async () => {
    stopCamera();
    await sb.auth.signOut();
  });

  els.startCam.addEventListener("click", startCamera);
  els.stopCam.addEventListener("click", stopCamera);
  els.mealSelect.addEventListener("change", loadMeals);
  els.mealSelect.addEventListener("change", () => setNote(els.camNote, "", null));

  els.manualBtn.addEventListener("click", () => {
    const token = extraerToken(els.manualToken.value) || els.manualToken.value.trim();
    if (!token) {
      setNote(els.camNote, "Escribe o pega el contenido del QR.", "error");
      return;
    }
    registrar(token);
    els.manualToken.value = "";
  });

  init();
})();
