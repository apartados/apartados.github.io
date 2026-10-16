const nav = document.getElementById("nav");
const burger = document.getElementById("burger");
const navLinks = document.getElementById("navLinks");
const yearEl = document.getElementById("year");

yearEl.textContent = new Date().getFullYear();

window.addEventListener("scroll", () => {
  nav.classList.toggle("is-scrolled", window.scrollY > 24);
});

burger.addEventListener("click", () => {
  const open = navLinks.classList.toggle("is-open");
  burger.setAttribute("aria-expanded", String(open));
});

navLinks.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    navLinks.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  })
);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        entry.target.style.transitionDelay = `${Math.min(i * 80, 320)}ms`;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.14, rootMargin: "0px 0px -60px 0px" }
);

document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

/* ---------------- Registro ---------------- */
const CONFIG = window.APARTA2_CONFIG || {};
const SUPABASE_URL = (CONFIG.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY || "";
const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const form = document.getElementById("registroForm");
const note = document.getElementById("formNote");
const acepto = document.getElementById("acepto");
const aceptoError = document.getElementById("aceptoError");
const submitBtn = form.querySelector('button[type="submit"]');

const rules = {
  nombre: (v) => v.trim().length >= 3 || "Escribe tu nombre completo.",
  edad: (v) => (Number(v) >= 14 && Number(v) <= 30) || "Debes tener entre 14 y 30 años.",
  telefono: (v) => v.replace(/\D/g, "").length >= 7 || "Ingresa un teléfono válido.",
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Ingresa un correo válido.",
};

function setNote(message, type) {
  note.textContent = message;
  note.classList.remove("ok", "error");
  if (type) note.classList.add(type);
}

function validateField(input) {
  const rule = rules[input.name];
  if (!rule) return true;

  const result = rule(input.value);
  const wrapper = input.closest(".field");
  const errorEl = wrapper.querySelector(".error");

  if (result !== true) {
    wrapper.classList.add("invalid");
    errorEl.textContent = result;
    return false;
  }

  wrapper.classList.remove("invalid");
  errorEl.textContent = "";
  return true;
}

form.querySelectorAll("input, select").forEach((input) => {
  input.addEventListener("blur", () => {
    if (rules[input.name]) validateField(input);
  });
  input.addEventListener("input", () => {
    if (input.closest(".field")?.classList.contains("invalid")) validateField(input);
  });
});

function emptyToNull(value) {
  const v = (value || "").trim();
  return v === "" ? null : v;
}

function buildPayload() {
  return {
    nombre: form.nombre.value.trim().replace(/\s+/g, " "),
    edad: Number(form.edad.value),
    telefono: form.telefono.value.trim(),
    email: form.email.value.trim().toLowerCase(),
    iglesia: emptyToNull(form.iglesia.value),
    talla: emptyToNull(form.talla.value),
    emergencia: emptyToNull(form.emergencia.value),
    notas: emptyToNull(form.notas.value),
  };
}

async function sendToSupabase(payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/registros`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) return;

  let detail = "";
  try {
    const body = await res.json();
    detail = body.message || body.hint || "";
  } catch (_) {
    /* respuesta sin cuerpo */
  }
  throw new Error(detail || `Error ${res.status}`);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (form.website.value.trim() !== "") {
    form.reset();
    return;
  }

  const fields = [...form.querySelectorAll("input[name], select[name]")].filter(
    (el) => rules[el.name]
  );
  const valid = fields.map(validateField).every(Boolean);

  aceptoError.style.display = acepto.checked ? "none" : "block";
  aceptoError.textContent = acepto.checked ? "" : "Debes aceptar las normas del retiro.";

  if (!valid || !acepto.checked) {
    setNote("Revisa los campos marcados en rojo.", "error");
    form.querySelector(".invalid input, .invalid select")?.focus();
    return;
  }

  if (!isConfigured) {
    setNote(
      "El registro todavía no está conectado a la base de datos. Falta configurar Supabase en config.js.",
      "error"
    );
    return;
  }

  const nombre = form.nombre.value.trim().split(" ")[0];
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando…";
  setNote("Guardando tu registro…", null);

  try {
    await sendToSupabase(buildPayload());
    setNote(
      `¡Listo, ${nombre}! Tu registro fue enviado. Pronto te contactaremos con los detalles.`,
      "ok"
    );
    form.reset();
  } catch (error) {
    console.error("[registro]", error);
    setNote(
      "No pudimos guardar tu registro. Revisa tu conexión e inténtalo de nuevo.",
      "error"
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirmar registro";
  }
});
