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

/* ---------------- Registro (crea cuenta real) ---------------- */
const CONFIG = window.APARTA2_CONFIG || {};
const SUPABASE_URL = (CONFIG.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY || "";
const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);

const sb = isConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const form = document.getElementById("registroForm");
const note = document.getElementById("formNote");
const acepto = document.getElementById("acepto");
const aceptoError = document.getElementById("aceptoError");
const submitBtn = form.querySelector('button[type="submit"]');

const rules = {
  nombre: (v) => v.trim().length >= 3 || "Escribe tu nombre completo.",
  edad: (v) => (Number(v) >= 15) || "Debes tener 15 años o más.",
  telefono: (v) => v.replace(/\D/g, "").length >= 7 || "Ingresa un teléfono válido.",
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Ingresa un correo válido.",
  password: (v) => v.length >= 8 || "La contraseña debe tener al menos 8 caracteres.",
  password2: (v) => v === form.password.value || "Las contraseñas no coinciden.",
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

const fotoInput = document.getElementById("foto");
const fotoPreview = document.getElementById("fotoPreview");

if (fotoInput) {
  fotoInput.addEventListener("change", () => {
    fotoPreview.innerHTML = "";
    fotoPreview.hidden = true;
    const file = fotoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNote("La foto debe ser una imagen (JPG, PNG o WebP).", "error");
      fotoInput.value = "";
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setNote("La foto supera los 3 MB.", "error");
      fotoInput.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    fotoPreview.innerHTML = `<img src="${url}" alt="Vista previa de tu foto" />`;
    fotoPreview.hidden = false;
  });
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (form.website.value.trim() !== "") {
    form.reset();
    return;
  }

  const fields = [...form.querySelectorAll("input[name], select[name]")].filter((el) => rules[el.name]);
  const valid = fields.map(validateField).every(Boolean);

  aceptoError.style.display = acepto.checked ? "none" : "block";
  aceptoError.textContent = acepto.checked ? "" : "Debes aceptar las normas del retiro.";

  const foto = fotoInput ? fotoInput.files[0] : null;
  const fotoError = fotoInput ? fotoInput.closest(".field").querySelector(".error") : null;
  let fotoValida = true;
  if (!foto) {
    fotoValida = false;
    if (fotoError) fotoError.textContent = "La foto de perfil es obligatoria.";
    if (fotoInput) fotoInput.closest(".field").classList.add("invalid");
  } else if (!foto.type.startsWith("image/")) {
    fotoValida = false;
    if (fotoError) fotoError.textContent = "Sube una imagen (JPG, PNG o WebP).";
  } else if (foto.size > 3 * 1024 * 1024) {
    fotoValida = false;
    if (fotoError) fotoError.textContent = "La foto supera los 3 MB.";
  } else if (fotoError) {
    fotoInput.closest(".field").classList.remove("invalid");
    fotoError.textContent = "";
  }

  if (!valid || !acepto.checked || !fotoValida) {
    setNote("Revisa los campos marcados en rojo.", "error");
    form.querySelector(".invalid input, .invalid select")?.focus();
    return;
  }

  if (!isConfigured) {
    setNote("El registro todavía no está conectado. Falta configurar Supabase en config.js.", "error");
    return;
  }

  const nombre = form.nombre.value.trim().replace(/\s+/g, " ");
  const email = form.email.value.trim().toLowerCase();

  submitBtn.disabled = true;
  submitBtn.textContent = "Creando tu cuenta…";
  setNote("Creando tu cuenta…", null);

  const { error } = await sb.auth.signUp({
    email,
    password: form.password.value,
    options: {
      data: {
        nombre,
        edad: form.edad.value.trim(),
        telefono: form.telefono.value.trim(),
        iglesia: emptyToNull(form.iglesia.value) || "",
        talla: form.talla.value || "",
        emergencia: emptyToNull(form.emergencia.value) || "",
        notas: emptyToNull(form.notas.value) || "",
      },
    },
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Crear mi cuenta y registrarme";

  if (error) {
    console.error("[registro]", error);
    const yaExiste = /already registered|already exists/i.test(error.message);
    const esRed = /failed to fetch|network|name_not_resolved|load failed|fetch/i.test(error.message || "");
    setNote(
      yaExiste
        ? "Ese correo ya tiene una cuenta. Entra a tu panel o usa otro correo."
        : esRed
        ? "No se pudo conectar con el servidor. Revisa tu conexión o que el servicio esté activo."
        : `No pudimos crear tu cuenta: ${error.message}`,
      "error"
    );
    if (yaExiste) form.email.focus();
    return;
  }

  // Subir la foto de perfil (obligatoria)
  let fotoSubida = true;
  try {
    const { data: sesion } = await sb.auth.getSession();
    const uid = sesion?.session?.user?.id;
    if (uid && foto) {
      const ext = (foto.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const ruta = `${uid}/avatar-${Date.now()}.${ext}`;
      const { error: upError } = await sb.storage
        .from("avatares")
        .upload(ruta, foto, { contentType: foto.type || undefined, upsert: true });
      if (!upError) {
        await sb.rpc("actualizar_avatar", { p_path: ruta });
      } else {
        fotoSubida = false;
        console.error("[registro] foto", upError);
      }
    }
  } catch (err) {
    fotoSubida = false;
    console.error("[registro] foto", err);
  }

  const primerNombre = nombre.split(" ")[0];
  setNote(
    fotoSubida
      ? `¡Listo, ${primerNombre}! Tu cuenta está creada. Te llevamos a tu panel…`
      : `¡Listo, ${primerNombre}! Tu cuenta está creada, pero la foto no se pudo subir. Súbela desde tu panel.`,
    "ok"
  );
  form.reset();
  setTimeout(() => {
    window.location.href = "panel.html";
  }, 1600);
});
