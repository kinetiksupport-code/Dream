import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APPEAL_DEADLINE_DAYS, APPEAL_MAX_CHARS, isAppealCode, isModerationBlock, limitText, untilText } from "../lib/moderation";
import { RULES } from "../supabase/functions/dream-api/moderation.mjs";
import { CONTENT_RULES } from "../supabase/functions/dream-api/content-moderation.mjs";
import {
  APPEAL_DEADLINE_DAYS as SERVER_DEADLINE,
  APPEAL_MAX_CHARS as SERVER_MAX,
  RULE_PLAIN,
  STUDENT_MOD_ACTIONS,
  ruleKey,
  ruleReason,
} from "../supabase/functions/dream-api/student-moderation.mjs";
import { BAN_ALLOWED_ACTIONS } from "../supabase/functions/dream-api/moderation.mjs";

const read = (f: string) => readFileSync(f, "utf8");

// B6: lado del alumno. Tono amable, 30 días a la vista y nada de datos personales en Crisp.

test("every rule the system can apply has a plain-words reason", () => {
  for (const id of [...Object.values(RULES), ...Object.values(CONTENT_RULES)].map((r) => r.id))
    assert.ok(RULE_PLAIN[id as keyof typeof RULE_PLAIN], id);
  assert.equal(ruleKey("G-SPAM:observe"), "G-SPAM");
  assert.equal(ruleReason("G-SPAM:observe"), RULE_PLAIN["G-SPAM"]);
  assert.equal(ruleReason("INVENTADA"), "las normas de uso de Dream");
  // Sin acusar: ningún motivo empieza por «has» ni usa tono de reproche.
  for (const text of Object.values(RULE_PLAIN)) assert.doesNotMatch(text, /^(has|eres|intentaste)\b/i);
});

test("the student actions are exactly the ones a banned account may still use", () => {
  assert.deepEqual([...STUDENT_MOD_ACTIONS].sort(), ["mod_ack", "mod_appeal_create", "mod_ban_info", "mod_notices"]);
  assert.ok(BAN_ALLOWED_ACTIONS.has("mod_ban_info") && BAN_ALLOWED_ACTIONS.has("mod_appeal_create"));
  assert.ok(!BAN_ALLOWED_ACTIONS.has("mod_notices") && !BAN_ALLOWED_ACTIONS.has("mod_ack"));
  assert.ok(BAN_ALLOWED_ACTIONS.has("account_delete") && BAN_ALLOWED_ACTIONS.has("profile"));
});

test("the 30-day deadline and the 2000-character limit match on both sides", () => {
  assert.equal(APPEAL_DEADLINE_DAYS, 30);
  assert.equal(SERVER_DEADLINE, APPEAL_DEADLINE_DAYS);
  assert.equal(SERVER_MAX, APPEAL_MAX_CHARS);
  assert.equal(APPEAL_MAX_CHARS, 2000);
  const sql = read("supabase/migrations/20261026090000_moderation_student.sql");
  assert.match(sql, /interval '30 days'/);
  assert.match(sql, /char_length\(v_body\) > 2000/);
  assert.match(sql, />= 3 then/);
  assert.match(read("components/moderation/appeal-form.tsx"), /APPEAL_DEADLINE_DAYS/);
});

test("duration texts are clear and friendly", () => {
  assert.equal(untilText(null, true), "de forma permanente");
  assert.equal(untilText("2099-01-01T00:00:00Z", true), "de forma permanente");
  assert.match(untilText("2026-11-12T10:00:00Z", false), /^hasta el 12 de noviembre de 2026$/);
  assert.match(limitText("2026-10-22T11:30:00Z"), /^hasta el 22 de octubre, /);
  assert.equal(limitText(null), "durante un tiempo");
});

test("appeal codes have one format and an email or name is not one", () => {
  assert.ok(isAppealCode("DREAM-K7QM-2XPD"));
  for (const bad of ["", "dream-k7qm-2xpd", "DREAM-K7QM-2XP", "DREAM-K7QM-2XPD0", "DREAM-I0O1-ABCD", "alumno@gmail.com", "Ana García"]) assert.ok(!isAppealCode(bad), bad);
  const sql = read("supabase/migrations/20261026090000_moderation_student.sql");
  assert.match(sql, /\[A-Z2-9\]\{4\}/);
  assert.match(sql, /'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'/, "alfabeto sin letras que se confundan");
  assert.ok(!/auth\.users|email|display_name/i.test(sql.slice(sql.indexOf("mod_make_code"), sql.indexOf("mod_appeal_create"))), "el código no sale de datos de la cuenta");
});

test("moderation blocks (429) are recognised and offer «Reclamar»", () => {
  assert.ok(isModerationBlock("mod_ip_blocked") && isModerationBlock("mod_user_limited"));
  assert.ok(!isModerationBlock("dream_budget") && !isModerationBlock("provider_rate_limit"), "los límites de Groq/Tavily tienen sus propios mensajes");
  const api = read("lib/dream-api.ts");
  assert.match(api, /code === "banned"[\s\S]*dream:banned/);
  assert.match(api, /mod_ip_blocked[\s\S]*dream:mod-limited/);
  const notices = read("components/moderation/notices.tsx");
  assert.match(notices, /href="\/reclamar"/);
  assert.match(notices, /Tu conexión está bloqueada un tiempo/);
});

test("the ban screen says what the prompt asks and offers only appeal, claim and delete account", () => {
  const screen = read("components/moderation/ban-screen.tsx");
  assert.match(screen, /Has sido baneado de la plataforma/);
  assert.match(screen, /Hacer una apelación|SupportChatButton/);
  assert.match(read("components/moderation/support-chat-button.tsx"), /Hacer una apelación/);
  assert.match(screen, /Motivo/);
  assert.match(screen, /Duración/);
  assert.match(screen, /Tu código de apelación/);
  assert.match(screen, /account_delete/);
  assert.match(screen, /hellodream@edudream\.es/, "copia de datos por correo, como dice la privacidad");
  // Nada de la app: ni conversaciones, ni menú, ni acciones de IA.
  assert.ok(!/callDream\("(chat|conversations|exams|test_|messages)/.test(screen));
  // El shell la pone ANTES que todo lo demás y no carga conversaciones de un baneado.
  const shell = read("components/shell.tsx");
  assert.ok(shell.indexOf("<BanScreen") < shell.indexOf("consentGate(profile)"));
  assert.match(shell, /!banned\) void refresh\(\)/);
});

test("Crisp loads only after a click and never receives the account's email, name or id", () => {
  const button = read("components/moderation/support-chat-button.tsx");
  const lib = read("lib/crisp.ts");
  assert.match(button, /noticeAccepted\(storage\(\)\)/, "aviso de privacidad antes de cargarlo");
  assert.match(button, /async function openChat\(\)[\s\S]*await crisp\(\)\.open\(\)/);
  for (const text of [button, lib, read("components/moderation/ban-screen.tsx")]) {
    assert.doesNotMatch(text, /user:email|user:nickname|session:data|setData|identify|useDream\(\)\.profile|profile\.email/i);
  }
  assert.match(button, /No se pudo abrir el chat ahora\./, "mensaje discreto de una línea y el formulario como alternativa");
  // Crisp no se importa ni se ejecuta al arrancar la app (solo el botón lo toca).
  assert.ok(!/crisp/i.test(read("app/layout.tsx")) && !/crisp/i.test(read("components/providers.tsx")));
});

test("a banned student never touches mod tables from the browser", () => {
  for (const f of ["lib/moderation.ts", "components/moderation/ban-screen.tsx", "components/moderation/appeal-form.tsx", "components/moderation/notices.tsx"]) {
    const text = read(f);
    assert.ok(!/getSupabase|\.from\(|supabase\.rpc|mod_sanctions|mod_appeals/.test(text.replace(/\/\*[\s\S]*?\*\//g, "")), f);
  }
});
