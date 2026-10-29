// Moderación, lado del alumno (B6): ver por qué está baneado, reclamar y marcar
// avisos como vistos. Todo pasa por aquí con la clave de servicio; el alumno no
// escribe en las tablas mod_*. Las normas son las filas de la tabla G de los
// términos (content/legal/terminos.ts, §6.G), dichas en palabras sencillas.

export const STUDENT_MOD_ACTIONS = new Set(["mod_ban_info", "mod_appeal_create", "mod_notices", "mod_ack"]);

/** Plazo máximo de respuesta, como dicen los términos. */
export const APPEAL_DEADLINE_DAYS = 30;
export const APPEAL_MAX_CHARS = 2000;

/** Fila de la tabla G en palabras sencillas, para que el alumno entienda qué norma. */
export const RULE_PLAIN = Object.freeze({
  "G-INSULT": "tratar con respeto a todo el mundo, también al tutor de IA",
  "G-JAILBREAK": "usar Dream para aprender, sin trucos para que la IA dé la solución o ignore sus normas",
  "G-SPAM": "no enviar mensajes repetidos ni saturar el chat",
  "G-BOT": "no usar programas automáticos ni sobrecargar el servicio",
  "G-MULTI": "una persona, una cuenta: no crear cuentas extra para saltarse límites o un baneo",
  "G-EDAD": "no compartir la cuenta ni mentir sobre la edad",
  "G-EXAMEN": "no usar Dream durante un examen oficial o una prueba evaluable",
  "G-COPYRIGHT": "subir solo contenido propio o que tengas derecho a usar",
  "G-DATOS": "no subir datos personales de otras personas",
  "G-ILEGAL": "no subir ni pedir contenido ilegal, violento, sexual, discriminatorio o que incite a hacerse daño",
  "G-HACK": "no intentar acceder a datos de otros usuarios ni saltarse la seguridad",
  "G-COMERCIAL": "no usar Dream con fines comerciales sin permiso por escrito",
  ADMIN: "una decisión del equipo de Dream",
});
const FALLBACK = "las normas de uso de Dream";

/** «G-SPAM:observe» → «G-SPAM». */
export const ruleKey = (rule) => String(rule ?? "").split(":")[0];
export const ruleReason = (rule) => RULE_PLAIN[ruleKey(rule)] ?? FALLBACK;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (body) => ({ status: 200, body });
const fail = (status, code, error) => ({ status, body: { error, code } });

/**
 * Devuelve { status, body } o null si la acción no es de este módulo.
 * rpc(nombre, argumentos) lanza si la base de datos da error.
 */
/** @param {{ action: string, body: any, userId: string, rpc: any,
 *   humanCheck?: ((token: unknown) => Promise<{ ok: boolean, status?: number, code?: string, message?: string }>) | null }} options */
export async function handleStudentModeration({ action, body, userId, rpc, humanCheck = null }) {
  if (!STUDENT_MOD_ACTIONS.has(action)) return null;
  try {
    if (action === "mod_ban_info") {
      const state = await rpc("mod_ban_state", { p_user: userId });
      const appeals = await rpc("mod_appeals_list", { p_user: userId });
      if (!state?.banned) return ok({ ban: null, code: null, appeals, deadline_days: APPEAL_DEADLINE_DAYS });
      // El código es del baneo: se crea si no existe y es el mismo mientras siga abierto.
      const code = await rpc("mod_appeal_code", { p_user: userId });
      return ok({
        ban: { rule: ruleKey(state.rule), reason: ruleReason(state.rule), until: state.until ?? null, permanent: state.permanent === true },
        code,
        appeals,
        deadline_days: APPEAL_DEADLINE_DAYS,
      });
    }
    if (action === "mod_appeal_create") {
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (text.length < 1 || text.length > APPEAL_MAX_CHARS) return fail(400, "texto_no_valido", `Escribe entre 1 y ${APPEAL_MAX_CHARS} caracteres.`);
      const sanction = typeof body.sanction_id === "string" && UUID.test(body.sanction_id) ? body.sanction_id : null;
      // Turnstile (docs/turnstile.md): un bot no puede llenar la cola de reclamaciones.
      if (humanCheck) {
        const human = await humanCheck(body.turnstile_token);
        if (!human.ok) return fail(human.status ?? 403, human.code ?? "turnstile_failed", human.message);
      }
      const result = await rpc("mod_appeal_create", { p_user: userId, p_body: text, p_sanction: sanction });
      if (!result?.ok) {
        if (result?.code === "demasiadas_abiertas") return fail(409, "demasiadas_abiertas", "Ya tienes 3 reclamaciones abiertas. Espera a que respondamos a alguna.");
        return fail(400, "texto_no_valido", `Escribe entre 1 y ${APPEAL_MAX_CHARS} caracteres.`);
      }
      return ok({ ok: true, code: result.code, due_at: result.due_at, deadline_days: APPEAL_DEADLINE_DAYS });
    }
    if (action === "mod_notices") {
      const items = await rpc("mod_notices", { p_user: userId });
      return ok({
        items: (items ?? []).map((n) => ({ id: n.id, kind: n.kind, rule: ruleKey(n.rule), reason: ruleReason(n.rule), until: n.until ?? null, created_at: n.created_at })),
      });
    }
    // mod_ack
    if (typeof body.id !== "string" || !UUID.test(body.id)) return fail(400, "invalid", "Aviso no válido.");
    return ok({ ok: (await rpc("mod_ack", { p_user: userId, p_id: body.id })) === true });
  } catch {
    return fail(503, "moderation_unavailable", "No se pudo completar ahora. Inténtalo de nuevo en un rato.");
  }
}
