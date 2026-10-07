import { createClient } from "@supabase/supabase-js";
let client: ReturnType<typeof createClient> | undefined;
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Falta configurar la conexión de Dream.");
  return (client ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  }));
}

/** Public Auth settings only; avoids navigating to a disabled OAuth provider. */
export async function assertGoogleAvailable() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Falta configurar la conexión de Dream.");
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("No se pudo preparar el acceso. Inténtalo de nuevo.");
  const settings: unknown = await response.json();
  if (
    settings &&
    typeof settings === "object" &&
    "external" in settings &&
    settings.external &&
    typeof settings.external === "object" &&
    "google" in settings.external &&
    settings.external.google === false
  )
    throw new Error("El acceso con Google no está disponible todavía.");
}
