// Cliente del panel de administración. Habla con dream-api con el token de la
// sesión del propio administrador; la comprobación real la hace el servidor en
// cada petición. No usa callDream a propósito: los 403 del panel (sesión del
// panel caducada, pide código nuevo) no deben cerrar la sesión de Dream.
import { getSupabase } from "@/lib/supabase";

export const ADMIN_BAN_RULES: Readonly<Record<string, string>> = Object.freeze({
  "G-INSULT": "Insultos, acoso o lenguaje ofensivo",
  "G-JAILBREAK": "Trucos para que la IA dé la solución o ignore sus normas",
  "G-SPAM": "Spam, mensajes repetidos o saturar el chat",
  "G-BOT": "Bots, scripts, scraping o sobrecargar el servicio",
  "G-MULTI": "Varias cuentas para saltarse límites, cola o un baneo",
  "G-EDAD": "Compartir la cuenta o mentir sobre la edad",
  "G-EXAMEN": "Usar Dream en un examen oficial o prueba evaluable",
  "G-COPYRIGHT": "Subir material con derechos de autor sin permiso",
  "G-DATOS": "Subir datos personales de otras personas",
  "G-ILEGAL": "Contenido ilegal, violento, sexual, discriminatorio o que incite a hacerse daño",
  "G-HACK": "Intentar acceder a datos de otros usuarios o hackear el sistema",
  "G-COMERCIAL": "Uso comercial o reventa sin permiso por escrito",
});
export const BAN_DURATIONS = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "permanent", label: "Permanente (pide confirmación)" },
] as const;

export interface AdminReply {
  status: number;
  data: Record<string, unknown> | null;
}

export async function adminCall(action: string, payload: Record<string, unknown> = {}): Promise<AdminReply> {
  const { data } = await getSupabase().auth.getSession();
  const url = process.env.NEXT_PUBLIC_DREAM_API_URL;
  if (!data.session || !url) return { status: 401, data: null };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, action }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    let body: Record<string, unknown> | null = null;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {}
    return { status: response.status, data: body };
  } catch {
    return { status: 0, data: null };
  }
}

export interface UserRef {
  user_id?: string;
  user_short?: string;
  user_email?: string;
}
export interface InboxAppeal extends UserRef { id: string; body: string; created_at: string; days_left?: number; due_at?: string; status?: string }
export interface InboxObservation extends UserRef { id: string; status: string; entries: number; shared: boolean; ends_at: string; ip_prefix: string }
export interface InboxSanction extends UserRef { id: string; kind: string; rule: string; until: string | null; decided_by: string; created_at: string }
export interface InboxIpBlock { ip_prefix: string; until: string; rule: string }
export interface InboxEvent extends UserRef { rule: string; origin: string; severity: string; created_at: string }
/** Memoria del chat: totales de un día (docs/MEMORIA-CHAT.md, Bloque 4). */
export interface MemoryDay {
  day: string;
  turns: number;
  with_files: number;
  material: number;
  reupload_retries: number;
  routes: number;
  router_llm: number;
  router_asks: number;
  dreams: number;
  index_tokens: number;
  board_tokens: number;
  router_tokens: number;
}
export interface Inbox {
  appeals: InboxAppeal[];
  observations: InboxObservation[];
  proposals: InboxSanction[];
  active_bans: InboxSanction[];
  ip_blocks: InboxIpBlock[];
  events: InboxEvent[];
}
export interface UserCard {
  user_short: string;
  user_email: string;
  ban: { banned: boolean; until?: string | null; permanent?: boolean; rule?: string };
  sanctions: InboxSanction[];
  events: InboxEvent[];
  appeals: InboxAppeal[];
  observations: InboxObservation[];
}
