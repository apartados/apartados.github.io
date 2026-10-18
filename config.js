// Configuración pública de Apartados 2.0
// La anon key de Supabase es pública por diseño: la seguridad se controla
// con Row Level Security (ver supabase/schema.sql). NUNCA pongas aquí la
// service_role key.

window.APARTA2_CONFIG = {
  SUPABASE_URL: "https://sgrhbbxemceogssoewbm.supabase.co",
  SESSION_IDLE_MINUTES: 30,
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncmhiYnhlbWNlb2dzc29ld2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTY2MjIsImV4cCI6MjEwNzczMjYyMn0.cTU4AgmhOgD8YCWkSMdgJVpbJNaGzh6Nfp6_mVStJBc",
};
