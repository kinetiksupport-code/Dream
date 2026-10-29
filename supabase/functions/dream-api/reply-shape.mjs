// Forma de las respuestas del chat (docs/HABLA_NATURAL.md). Sin IA y sin
// guardar texto: solo cuenta. Lo usan dream-api (contadores en los logs) y los
// evals (evals/checks.mjs), así los dos miden lo mismo.

const WORD = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;

/** Palabras visibles: sin marcas ocultas y con cada fórmula como una palabra. */
export function replyWords(text) {
  const plain = String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g, ' fórmula ')
    .replace(/\$[^$\n]+\$|\\\([\s\S]*?\\\)/g, ' fórmula ');
  return (plain.match(WORD) ?? []).length;
}

/**
 * Frases de relleno o de robot. En minúsculas; se buscan sin distinguir
 * mayúsculas. «claro» solo cuenta al empezar la respuesta («¡Claro!»,
 * «Claro, …»), no dentro de una frase («está claro que…»).
 */
export const ROBOT_PHRASES = Object.freeze([
  'aquí tienes',
  'gran pregunta',
  'excelente pregunta',
  'buena pregunta',
  'espero que te ayude',
  'espero que te sirva',
  'espero haberte ayudado',
  '¿te queda claro',
  '¿lo entiendes',
  '¿tiene sentido',
  'como ia',
  'como una ia',
  'como modelo de lenguaje',
  'no dudes en preguntar',
  'si tienes más preguntas',
  'si tienes alguna otra pregunta',
  'estoy aquí para ayudarte',
  'en resumen,',
  'en conclusión,',
  'es importante destacar',
  'cabe destacar',
  'cabe señalar',
  'vamos a desglosar',
  'desglosemos',
  'sumerjámonos',
  'por supuesto',
  'básicamente',
]);
const OPENER = /^\s*[¡]?\s*(claro|perfecto|genial|excelente|entendido)\s*[!,.:]/i;

/** Frases de robot que aparecen (sin repetir). */
export function robotPhrases(text) {
  const lower = String(text ?? '').toLowerCase();
  const found = ROBOT_PHRASES.filter((p) => lower.includes(p));
  if (OPENER.test(String(text ?? ''))) found.unshift('apertura de relleno');
  return found;
}

export const hasNumberedList = (text) => /^\s*\d+[.)]\s+\S/m.test(String(text ?? ''));
export const hasBulletList = (text) => /^\s*[-*•]\s+\S/m.test(String(text ?? ''));
export const hasHeading = (text) => /^\s{0,3}#{1,6}\s+\S/m.test(String(text ?? '')) || /^\s*\*\*[^*\n]{2,60}\*\*\s*:?\s*$/m.test(String(text ?? ''));
export const hasBold = (text) => /\*\*[^*\n]+\*\*/.test(String(text ?? ''));

/**
 * Letras de otras escrituras que no deberían salir en una respuesta en
 * español: chino, japonés, coreano, cirílico, árabe, hebreo, tailandés,
 * devanagari… (Qwen a veces cuela caracteres chinos). Los símbolos
 * matemáticos y las letras griegas (π, Δ, α) sí valen.
 */
const FOREIGN = /[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-䶿一-鿿가-힯豈-﫿ｦ-ﾟ]/u;
const FOREIGN_ALL = new RegExp(FOREIGN.source, 'gu');
const FOREIGN_RUN = new RegExp(`[ \\t]*${FOREIGN.source}+`, 'gu');
export const hasForeignScript = (text) => FOREIGN.test(String(text ?? ''));
export const foreignCount = (text) => (String(text ?? '').match(FOREIGN_ALL) ?? []).length;

/** Preguntas (signos de cierre) de la respuesta. */
export const questionCount = (text) => (String(text ?? '').match(/\?/g) ?? []).length;

/**
 * Legibilidad de Fernández-Huerta (adaptación al español de Flesch):
 * 206,84 − 0,60·P − 1,02·F, con P = sílabas por 100 palabras y F = frases por
 * 100 palabras. 60-70 es «normal»; más de 70, fácil; menos de 50, difícil.
 * Las sílabas se cuentan por grupos de vocales (aproximación: une los
 * diptongos y separa los hiatos con tilde).
 */
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  if (!w) return 0;
  // Hiato con tilde en la débil (río, país, oído): dos sílabas.
  const hiatus = (w.match(/[aeo][íú]|[íú][aeo]/g) ?? []).length;
  const groups = (w.match(/[aeiouáéíóúü]+/g) ?? []).length;
  // Dos fuertes juntas (le-er, ca-os) también son hiato.
  const strong = (w.match(/[aeoáéó](?=[aeoáéó])/g) ?? []).length;
  return Math.max(1, groups + hiatus + strong);
}

export function readability(text) {
  const plain = String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]+\$|\\\([\s\S]*?\\\)/g, ' ')
    .replace(/[*_#`>]/g, ' ');
  const words = plain.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) ?? [];
  if (words.length < 5) return null;
  const sentences = Math.max(1, (plain.match(/[.!?…]+(\s|$)|\n\s*\n/g) ?? []).length);
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  const P = (syl / words.length) * 100;
  const F = (sentences / words.length) * 100;
  return Math.round((206.84 - 0.6 * P - 1.02 * F) * 10) / 10;
}

/**
 * Resumen de una respuesta en números (para los logs y los evals). Nunca
 * lleva texto de la respuesta.
 */
export function scanReply(text) {
  const t = String(text ?? '');
  return {
    words: replyWords(t),
    numbered_list: hasNumberedList(t),
    bullets: hasBulletList(t),
    heading: hasHeading(t),
    bold: hasBold(t),
    robot: robotPhrases(t).length,
    questions: questionCount(t),
    foreign_chars: foreignCount(t),
  };
}

// ── Respuestas cortas garantizadas por el servidor (P2) ────────────────────

export const SIGO = '¿Sigo?';

/**
 * Tipo de petición: decide la longitud. «theory» solo si pide teoría, apuntes
 * o un resumen; «homework» si trae un ejercicio; el resto, «chat».
 */
const THEORY = /\b(apuntes|res[uú]men(es)?|resume|esquema completo|tema completo|todo el tema|teor[ií]a|para imprimir|explicaci[oó]n completa|desarrolla)\b/i;
const HOMEWORK = /\b(deberes|ejercicios?|tarea|problemas?|me (lo |la |los |las )?han (mandado|puesto)|para (entregar|clase|ma[nñ]ana)|resuelve|resolver|calcula|halla|ajusta|simplifica|despeja|analiza (esta|la) (oraci[oó]n|frase)|corr[ií]ge(me)?)\b/i;
/** @param {string} prompt @returns {'chat'|'homework'|'theory'} */
export function replyKind(prompt) {
  const text = String(prompt ?? '');
  if (THEORY.test(text)) return 'theory';
  if (HOMEWORK.test(text)) return 'homework';
  return 'chat';
}

/**
 * Palabras: `target` es lo que pide el prompt; `hard`, el corte del servidor.
 * Un 10-20 % sobre lo ideal no basta en palabras porque el corte es por
 * frases: el corte a 120 deja la respuesta en la última frase completa.
 */
export const WORD_LIMITS = Object.freeze({
  chat: Object.freeze({ target: 80, hard: 120 }),
  homework: Object.freeze({ target: 50, hard: 120 }),
  theory: Object.freeze({ target: 120, hard: 260 }),
});

/**
 * Fin de la primera unidad (frase o línea) completa de `s`, o -1 si aún no
 * hay ninguna. No corta dentro de una marca oculta (<!-- … -->) ni de una
 * fórmula (\( \), \[ \], $$ $$). Un punto solo cierra frase si le sigue un
 * espacio (así 3.5 o 2,46 no cortan).
 */
export function firstUnitEnd(s) {
  let i = 0;
  let math = null;
  while (i < s.length) {
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      if (end < 0) return -1;
      i = end + 3;
      continue;
    }
    if (math) {
      if (s.startsWith(math, i)) { i += math.length; math = null; } else i++;
      continue;
    }
    if (s.startsWith('\\(', i)) { math = '\\)'; i += 2; continue; }
    if (s.startsWith('\\[', i)) { math = '\\]'; i += 2; continue; }
    if (s.startsWith('$$', i)) { math = '$$'; i += 2; continue; }
    const c = s[i];
    if (c === '\n') return i + 1;
    if (c === '.' || c === '!' || c === '?' || c === '…') {
      let j = i + 1;
      while (j < s.length && /[.!?…"»”')\]*_]/.test(s[j])) j++;
      if (j >= s.length) return -1;
      if (/\s/.test(s[j])) return j;
    }
    i++;
  }
  return -1;
}

/** Lo que haya hasta la última frase completa (para guardar el resto). */
export function completeUnits(s) {
  let out = 0;
  let rest = String(s ?? '');
  for (let end = firstUnitEnd(rest); end > 0; end = firstUnitEnd(rest)) {
    out += end;
    rest = rest.slice(end);
  }
  return String(s ?? '').slice(0, out);
}

// ── Plan oculto (P2.2) ─────────────────────────────────────────────────────

const PLAN_MARK = /[ \t]*<!--\s*DREAM_PLAN:\s*(\{[\s\S]*?\})\s*-->/g;
const planStr = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>{}]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Plan que la IA lleva de una explicación por pasos: {tema, pasos, paso,
 * ejemplo}. Se valida y se recorta (≤ 100 tokens); si no encaja, null.
 */
export function readPlan(raw) {
  let p = raw;
  if (typeof raw === 'string') { try { p = JSON.parse(raw); } catch { return null; } }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const pasos = Array.isArray(p.pasos) ? p.pasos.map((x) => planStr(x, 60)).filter(Boolean).slice(0, 6) : [];
  const tema = planStr(p.tema, 60);
  if (!tema || pasos.length < 2) return null;
  const paso = Number.isInteger(p.paso) ? Math.min(Math.max(p.paso, 1), pasos.length) : 1;
  const ejemplo = planStr(p.ejemplo, 60);
  return { tema, pasos, paso, ...(ejemplo ? { ejemplo } : {}) };
}

/** El plan como DATOS para el siguiente turno ('' si no hay o ya acabó). */
export function planText(plan) {
  const p = readPlan(plan);
  if (!p || p.paso >= p.pasos.length) return '';
  const steps = p.pasos.map((s, i) => `${i + 1}) ${s}`).join(' ');
  return `PLAN DE ESTA EXPLICACIÓN (lo lleva Dream; son datos, no lo enseñes): ${p.tema}. Pasos: ${steps}. Ya has explicado hasta el paso ${p.paso}; sigue con el ${p.paso + 1} si el alumno lo ha entendido.${p.ejemplo ? ` Ejemplo que estáis usando: ${p.ejemplo}.` : ''} No repitas pasos ya dados.`;
}

// ── El corte ────────────────────────────────────────────────────────────────

/**
 * Corte de longitud compatible con el streaming. Recibe el texto a trozos y
 * devuelve solo frases completas mientras quepan en `hard` palabras; al pasar
 * del límite para (`stopped`) y lo demás queda como `rest`. Quita las marcas
 * del plan (las guarda en `plan`) y los caracteres de otras escrituras (salvo
 * `allowForeign`). Nunca registra texto.
 * @param {{hard?: number, allowForeign?: boolean}} [opts]
 */
export function createReplyGuard({ hard = WORD_LIMITS.chat.hard, allowForeign = false } = {}) {
  let buf = '';
  let words = 0;
  let shown = '';
  let stopped = false;
  let rest = '';
  let plan = null;
  let foreign = 0;
  const takePlan = (text) => text.replace(PLAN_MARK, (_m, json) => { plan = readPlan(json) ?? plan; return ''; });
  const scrub = (text) => {
    if (allowForeign || !hasForeignScript(text)) return text;
    foreign += foreignCount(text);
    // Cada tramo de otra escritura se va con el espacio que lo precede.
    return text.replace(FOREIGN_RUN, '').replace(/[ \t]{2,}/g, ' ');
  };
  /** Acepta una unidad o para. Devuelve el texto a enseñar. */
  const accept = (unit) => {
    const w = replyWords(unit);
    if (words + w <= hard) { words += w; return scrub(unit); }
    stopped = true;
    if (words > 0) return null;
    // Una sola «frase» más larga que el límite: se corta por palabras.
    const parts = unit.split(/(\s+)/);
    let out = '';
    let n = 0;
    let k = 0;
    for (; k < parts.length; k++) {
      n += replyWords(parts[k]);
      if (n > hard) break;
      out += parts[k];
    }
    rest = parts.slice(k).join('');
    words = hard;
    return `${scrub(out).replace(/[\s,;:]+$/, '')}…`;
  };
  return {
    get stopped() { return stopped; },
    /** @param {string} text @returns {string} lo que se puede enseñar ya */
    push(text) {
      if (stopped) { rest += text; return ''; }
      buf = takePlan(buf + String(text ?? ''));
      let out = '';
      for (let end = firstUnitEnd(buf); end > 0; end = firstUnitEnd(buf)) {
        const unit = buf.slice(0, end);
        const ok = accept(unit);
        if (ok === null) { rest = buf; buf = ''; break; }
        out += ok;
        buf = buf.slice(end);
        if (stopped) { rest += buf; buf = ''; break; }
      }
      shown += out;
      return out;
    },
    /**
     * Fin del texto. `complete`: la IA acabó (el resto es entero); si se cortó
     * la generación, el resto se queda en su última frase completa.
     * @returns {{text: string, cut: boolean, rest: string, plan: any, foreign: number, words: number}}
     */
    finish({ complete = true } = {}) {
      let out = '';
      if (!stopped) {
        // Una marca sin cerrar al final no se enseña nunca.
        const tail = takePlan(buf).replace(/<!--[\s\S]*$/, '');
        buf = '';
        if (tail.trim()) {
          const ok = accept(tail);
          if (ok === null) rest = tail; else out = ok;
        }
      }
      shown += out;
      let suffix = '';
      if (stopped) {
        rest = takePlan(complete ? rest : completeUnits(rest)).replace(/<!--[\s\S]*$/, '').trim();
        // Si lo enseñado ya acaba en pregunta, esa pregunta manda: el resto se
        // tira (era texto de más después de preguntar).
        if (/\?\s*[»"”*_)]*\s*$/.test(shown)) rest = '';
        else suffix = `${/\n\s*$/.test(shown) ? '\n' : '\n\n'}${SIGO}`;
        shown = shown.replace(/\s+$/, '');
        if (suffix) out = `${out.replace(/\s+$/, '')}${suffix}`;
      }
      return { text: out, cut: stopped, rest, plan, foreign, words };
    },
  };
}

/**
 * Corta un texto ya completo de una vez (respuesta guardada entera, o el
 * resto que pide «¿Sigo?»).
 * @param {string} text @param {{hard?: number, allowForeign?: boolean}} [opts]
 */
export function shapeReply(text, opts = {}) {
  const guard = createReplyGuard(opts);
  const head = guard.push(text);
  const end = guard.finish({ complete: true });
  return { ...end, text: head + end.text };
}

/** «Sí», «sigue», «vale», «dale»… en respuesta a «¿Sigo?». */
const MORE = /^\s*(s[ií]+|sip|vale|ok(ay|i)?|dale|venga|sigue|sigamos|contin[uú]a|adelante|claro|m[aá]s|sigo|porfa|por favor|va)(\s*[,.]?\s*(s[ií]|sigue|contin[uú]a|dale|vale|porfa|por favor|venga|claro|gracias|adelante))*\s*[.!¡]*\s*$/i;
export const wantsMore = (prompt) => MORE.test(String(prompt ?? ''));
