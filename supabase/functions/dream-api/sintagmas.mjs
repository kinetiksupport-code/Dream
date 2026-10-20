// Actividad de sintagmas: lógica pura compartida por dream-api (Deno) y el
// cliente (Next). Sin red ni base de datos. La IA propone frases y su
// análisis; aquí se comprueba que el análisis respeta las reglas mecánicas y
// se corrige lo que marca el alumno. La corrección la decide este código, no
// el modelo (prompt «sintagmas» §2b).

/** @typedef {'SN'|'SV'|'SAdj'|'SAdv'|'SPrep'|'Det'|'N'|'E'} SyntaxLabel */
/**
 * Nodo del análisis: tramo de palabras [start, end) con su etiqueta.
 * `fn` (función: sujeto, CD…) queda para la segunda fase; hoy siempre null.
 * @typedef {{ label: SyntaxLabel, start: number, end: number, fn?: string|null, children?: SyntaxNode[] }} SyntaxNode
 */
/** Raya del alumno (sin anidar: el anidamiento sale de los tramos). @typedef {{ label: SyntaxLabel, start: number, end: number }} SyntaxMark */
/** Nombres que usa el profesor para cada etiqueta. @typedef {Partial<Record<SyntaxLabel, string>>} SyntaxNames */
/** @typedef {{ names: SyntaxNames, source: 'standard'|'notes' }} SyntaxConventions */
/** @typedef {'correct'|'wrong_label'|'missing'} SpanStatus */
/** @typedef {{ label: SyntaxLabel, start: number, end: number, status: SpanStatus, given?: SyntaxLabel }} SpanResult */

export const PHRASES = /** @type {const} */ (['SN', 'SV', 'SAdj', 'SAdv', 'SPrep']);
export const PARTS = /** @type {const} */ (['Det', 'N', 'E']);
/** Orden de los botones de etiqueta. */
export const LABELS = /** @type {SyntaxLabel[]} */ ([...PHRASES, ...PARTS]);

/** Nombre completo para el autocompletado y el lector de pantalla. */
export const FULL_NAMES = /** @type {Record<SyntaxLabel, string>} */ ({
  SN: 'sintagma nominal',
  SV: 'sintagma verbal',
  SAdj: 'sintagma adjetival',
  SAdv: 'sintagma adverbial',
  SPrep: 'sintagma preposicional',
  Det: 'determinante',
  N: 'núcleo',
  E: 'enlace',
});

/** Variantes que se aceptan al escribir (ya normalizadas: sin tildes, sin espacios ni signos). */
const ALIASES = /** @type {Record<string, SyntaxLabel>} */ ({
  sn: 'SN', gn: 'SN', sintagmanominal: 'SN', grupanominal: 'SN', gruponominal: 'SN', nominal: 'SN',
  sv: 'SV', gv: 'SV', sintagmaverbal: 'SV', grupoverbal: 'SV', verbal: 'SV',
  sadj: 'SAdj', sa: 'SAdj', gadj: 'SAdj', ga: 'SAdj', sintagmaadjetival: 'SAdj', grupoadjetival: 'SAdj', adjetival: 'SAdj',
  sadv: 'SAdv', gadv: 'SAdv', sintagmaadverbial: 'SAdv', grupoadverbial: 'SAdv', adverbial: 'SAdv',
  sprep: 'SPrep', sp: 'SPrep', gprep: 'SPrep', gp: 'SPrep', sintagmapreposicional: 'SPrep', grupopreposicional: 'SPrep', preposicional: 'SPrep',
  det: 'Det', d: 'Det', determinante: 'Det', act: 'Det', actualizador: 'Det',
  n: 'N', nucleo: 'N', nuc: 'N', nv: 'N', nucleoverbal: 'N',
  e: 'E', enlace: 'E', nexo: 'E', prep: 'E', preposicion: 'E',
});

export const MAX_WORDS = 14;
export const MIN_WORDS = 2;
const MAX_DEPTH = 7;
const MAX_NAME = 12;

/**
 * Regla de cambio de fase (prompt «sintagmas» §5). Se cuentan solo las
 * frases hechas en la fase actual.
 */
export const PHASE_RULE = Object.freeze({ window: 5, up: 0.8, down: 0.5 });
/** Nivel 1–5: cuántas palabras tiene la frase. Sube con 3 frases seguidas ≥ 80 %, baja con 2 < 50 %. */
export const LEVEL_RULE = Object.freeze({ min: 1, max: 5, upAfter: 3, up: 0.8, downAfter: 2, down: 0.5 });
export const LEVEL_WORDS = Object.freeze({ 1: [2, 4], 2: [3, 6], 3: [5, 8], 4: [6, 10], 5: [8, 14] });

/** Minúsculas, sin tildes, sin espacios ni signos. @param {unknown} value */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]/g, '');
}

/** Palabras de la frase, sin signos de puntuación. @param {string} text */
export function tokenize(text) {
  return String(text ?? '').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? [];
}

/** @param {unknown} value @returns {value is SyntaxLabel} */
export function isLabel(value) {
  return typeof value === 'string' && /** @type {string[]} */ (LABELS).includes(value);
}
/** @param {SyntaxLabel} label */
export const isPhrase = (label) => /** @type {string[]} */ (PHRASES).includes(label);

/**
 * Etiqueta escrita por el alumno → etiqueta canónica, o null si no se
 * reconoce. Acepta mayúsculas, sin tildes, con o sin paréntesis, nombre
 * completo o abreviatura, y los nombres del profesor.
 * @param {unknown} value @param {SyntaxNames} [names]
 * @returns {SyntaxLabel|null}
 */
export function normalizeLabel(value, names = {}) {
  const key = normalizeText(value);
  if (!key) return null;
  for (const label of LABELS) {
    const own = names[label];
    if (own && normalizeText(own) === key) return label;
  }
  return ALIASES[key] ?? null;
}

/** Cómo se ve una etiqueta con las convenciones del profesor. @param {SyntaxLabel} label @param {SyntaxNames} [names] */
export function displayLabel(label, names = {}) {
  return names[label] || label;
}

/** Nombre completo con la palabra del profesor («grupo» si usa GN). @param {SyntaxLabel} label @param {SyntaxNames} [names] */
export function fullName(label, names = {}) {
  const base = FULL_NAMES[label];
  return isPhrase(label) && /^g/i.test(names[label] ?? '') ? base.replace('sintagma', 'grupo') : base;
}

/**
 * Sugerencias del autocompletado: las etiquetas cuyo nombre corto, nombre
 * completo o variante empieza por lo escrito. Primero las usadas hace poco.
 * @param {string} input @param {SyntaxNames} [names] @param {SyntaxLabel[]} [recent]
 * @returns {SyntaxLabel[]}
 */
export function suggestLabels(input, names = {}, recent = []) {
  const key = normalizeText(input);
  const ordered = [...new Set([...recent.filter(isLabel), ...LABELS])];
  if (!key) return ordered;
  const exact = normalizeLabel(input, names);
  const matches = ordered.filter((label) => {
    if (normalizeText(displayLabel(label, names)).startsWith(key)) return true;
    if (normalizeText(fullName(label, names)).startsWith(key)) return true;
    return Object.entries(ALIASES).some(([alias, target]) => target === label && alias.length > 1 && alias.startsWith(key));
  });
  return exact ? [exact, ...matches.filter((label) => label !== exact)] : matches;
}

/**
 * Convenciones del profesor saneadas: solo nombres cortos y reconocibles.
 * @param {unknown} raw @param {'standard'|'notes'} [source]
 * @returns {SyntaxConventions}
 */
export function sanitizeConventions(raw, source = 'standard') {
  /** @type {SyntaxNames} */
  const names = {};
  const given = raw && typeof raw === 'object' && 'names' in raw ? /** @type {{names: unknown}} */ (raw).names : raw;
  if (given && typeof given === 'object') {
    for (const label of LABELS) {
      const value = /** @type {Record<string, unknown>} */ (given)[label];
      if (typeof value !== 'string') continue;
      const name = value.trim().replace(/[()]/g, '');
      if (!name || name.length > MAX_NAME || !/^[\p{L}.]+$/u.test(name)) continue;
      // Solo se acepta si es una variante conocida de esa misma etiqueta.
      if (ALIASES[normalizeText(name)] !== label) continue;
      if (name !== label) names[label] = name;
    }
  }
  return { names, source: Object.keys(names).length || source === 'notes' ? source : 'standard' };
}

/** Lista plana del árbol, de arriba abajo y de izquierda a derecha. @param {SyntaxNode[]} nodes @param {number} [depth] */
export function flatten(nodes, depth = 0) {
  /** @type {(SyntaxMark & {depth: number})[]} */
  const out = [];
  for (const node of nodes) {
    out.push({ label: node.label, start: node.start, end: node.end, depth });
    if (node.children?.length) out.push(...flatten(node.children, depth + 1));
  }
  return out;
}

/** Dos tramos se cruzan si se solapan sin que uno contenga al otro. @param {{start:number,end:number}} a @param {{start:number,end:number}} b */
export function crosses(a, b) {
  const overlap = a.start < b.end && b.start < a.end;
  const contains = (x, y) => x.start <= y.start && y.end <= x.end;
  return overlap && !contains(a, b) && !contains(b, a);
}

/**
 * Comprueba las reglas mecánicas de un análisis (prompt §2b). Devuelve la
 * lista de fallos; vacía si es válido.
 * @param {number} wordCount @param {SyntaxNode[]} nodes
 * @returns {string[]}
 */
export function treeErrors(wordCount, nodes) {
  const errors = [];
  if (!Array.isArray(nodes) || !nodes.length) return ['sin_analisis'];
  if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) errors.push('longitud');
  const top = nodes.map((n) => n.label);
  if (!top.every((l) => l === 'SN' || l === 'SV')) errors.push('raiz_no_sn_sv');
  if (top.filter((l) => l === 'SV').length !== 1) errors.push('un_sv');
  if (top.filter((l) => l === 'SN').length > 1) errors.push('un_sujeto');
  coverage(nodes, 0, wordCount, 'frase', errors);
  for (const node of nodes) check(node, 0, errors);
  return [...new Set(errors)];
}

/** @param {SyntaxNode[]} children @param {number} start @param {number} end @param {string} where @param {string[]} errors */
function coverage(children, start, end, where, errors) {
  let at = start;
  for (const child of children) {
    if (!Number.isInteger(child?.start) || !Number.isInteger(child?.end) || child.start >= child.end) {
      errors.push(`tramo_invalido:${where}`);
      return;
    }
    if (child.start !== at) errors.push(child.start > at ? `hueco:${where}` : `solape:${where}`);
    at = child.end;
  }
  if (at !== end) errors.push(at < end ? `hueco:${where}` : `se_sale:${where}`);
}

/** @param {SyntaxNode} node @param {number} depth @param {string[]} errors */
function check(node, depth, errors) {
  if (!isLabel(node?.label)) return void errors.push('etiqueta');
  if (depth > MAX_DEPTH) return void errors.push('profundidad');
  const children = Array.isArray(node.children) ? node.children : [];
  if (!isPhrase(node.label)) {
    if (children.length) errors.push(`parte_con_hijos:${node.label}`);
    return;
  }
  coverage(children, node.start, node.end, node.label, errors);
  const labels = children.map((c) => c.label);
  if (node.label === 'SPrep') {
    // Enlace + término: nunca se parte la preposición de su término.
    if (labels.length !== 2 || labels[0] !== 'E' || !['SN', 'SAdv', 'SAdj'].includes(labels[1])) errors.push('sprep_enlace_termino');
  } else {
    if (labels.filter((l) => l === 'N').length !== 1) errors.push(`un_nucleo:${node.label}`);
    if (labels.includes('E')) errors.push(`enlace_fuera:${node.label}`);
    if (labels.includes('SV')) errors.push(`sv_dentro:${node.label}`);
    if (node.label !== 'SN' && labels.includes('Det')) errors.push(`det_fuera:${node.label}`);
    // El determinante va delante de su núcleo.
    if (node.label === 'SN' && labels.indexOf('Det') > labels.indexOf('N')) errors.push('det_tras_nucleo');
  }
  for (const child of children) check(child, depth + 1, errors);
}

/**
 * Análisis de la IA (con textos) → árbol con índices de palabra. Cada nodo
 * trae `text`; se busca en orden dentro del tramo del padre. Devuelve null
 * si algún texto no encaja.
 * @param {string[]} words @param {unknown} raw
 * @returns {SyntaxNode[]|null}
 */
export function treeFromText(words, raw) {
  const keys = words.map(normalizeText);
  /** @param {unknown} list @param {number} start @param {number} end @param {number} depth @returns {SyntaxNode[]|null} */
  const build = (list, start, end, depth) => {
    if (!Array.isArray(list) || depth > MAX_DEPTH) return null;
    const out = [];
    let at = start;
    for (const item of list) {
      if (!item || typeof item !== 'object') return null;
      const { label: rawLabel, text, children } = /** @type {Record<string, unknown>} */ (item);
      const label = normalizeLabel(rawLabel);
      const parts = tokenize(String(text ?? '')).map(normalizeText);
      if (!label || !parts.length) return null;
      let found = -1;
      for (let i = at; i + parts.length <= end; i++) {
        if (parts.every((p, j) => keys[i + j] === p)) { found = i; break; }
      }
      if (found < 0) return null;
      /** @type {SyntaxNode} */
      const node = { label, start: found, end: found + parts.length, fn: null };
      if (Array.isArray(children) && children.length) {
        const built = build(children, node.start, node.end, depth + 1);
        if (!built) return null;
        node.children = built;
      }
      out.push(node);
      at = node.end;
    }
    return out;
  };
  return build(raw, 0, words.length, 0);
}

/**
 * Rayas del alumno → árbol (el anidamiento sale de quién contiene a quién).
 * Con el mismo tramo, el sintagma va por encima de su parte.
 * @param {SyntaxMark[]} marks @returns {SyntaxNode[]}
 */
export function treeFromMarks(marks) {
  const sorted = [...marks].sort((a, b) => a.start - b.start || b.end - a.end || rank(a.label) - rank(b.label));
  /** @type {SyntaxNode[]} */
  const roots = [];
  /** @type {SyntaxNode[]} */
  const stack = [];
  for (const mark of sorted) {
    /** @type {SyntaxNode} */
    const node = { label: mark.label, start: mark.start, end: mark.end, fn: null };
    while (stack.length && !(stack[stack.length - 1].start <= node.start && node.end <= stack[stack.length - 1].end && isPhrase(stack[stack.length - 1].label))) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) (parent.children ??= []).push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}
/** @param {SyntaxLabel} label */
const rank = (label) => (isPhrase(label) ? 0 : 1);

/**
 * Rayas que manda el navegador, saneadas: etiquetas conocidas, dentro de la
 * frase, sin repetidas ni cruzadas. null si algo no cuadra.
 * @param {unknown} raw @param {number} wordCount @param {SyntaxNames} [names]
 * @returns {SyntaxMark[]|null}
 */
export function sanitizeMarks(raw, wordCount, names = {}) {
  if (!Array.isArray(raw) || raw.length > wordCount * 4 + 4) return null;
  /** @type {SyntaxMark[]} */
  const marks = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const { start, end, label: rawLabel } = /** @type {Record<string, unknown>} */ (item);
    const label = normalizeLabel(rawLabel, names);
    if (!label || !Number.isInteger(start) || !Number.isInteger(end)) return null;
    const s = /** @type {number} */ (start), e = /** @type {number} */ (end);
    if (s < 0 || e > wordCount || s >= e) return null;
    if (marks.some((m) => m.start === s && m.end === e && m.label === label)) continue;
    if (marks.some((m) => crosses(m, { start: s, end: e }))) return null;
    marks.push({ label, start: s, end: e });
  }
  return marks;
}

/**
 * Compara las rayas del alumno con el análisis oficial. Coinciden si tienen
 * el mismo tramo y la misma etiqueta (ya normalizada).
 * @param {SyntaxNode[]} official @param {SyntaxMark[]} marks
 */
export function compareAnalysis(official, marks) {
  const expected = flatten(official);
  const used = new Set();
  /** @type {SpanResult[]} */
  const spans = expected.map(({ label, start, end }) => {
    const same = marks.findIndex((m, i) => !used.has(i) && m.start === start && m.end === end && m.label === label);
    if (same >= 0) { used.add(same); return { label, start, end, status: /** @type {SpanStatus} */ ('correct') }; }
    return { label, start, end, status: /** @type {SpanStatus} */ ('missing') };
  });
  // Mismo tramo con otra etiqueta: se cuenta como etiqueta equivocada.
  for (const span of spans) {
    if (span.status !== 'missing') continue;
    const other = marks.findIndex((m, i) => !used.has(i) && m.start === span.start && m.end === span.end);
    if (other >= 0) { used.add(other); span.status = 'wrong_label'; span.given = marks[other].label; }
  }
  const extra = marks.filter((_, i) => !used.has(i));
  const correct = spans.filter((s) => s.status === 'correct').length;
  /** @type {Partial<Record<SyntaxLabel, {ok: number, total: number}>>} */
  const byLabel = {};
  for (const span of spans) {
    const entry = (byLabel[span.label] ??= { ok: 0, total: 0 });
    entry.total++;
    if (span.status === 'correct') entry.ok++;
  }
  return {
    spans,
    extra,
    correct,
    total: spans.length,
    score: spans.length ? correct / (spans.length + extra.length) : 0,
    perfect: correct === spans.length && !extra.length,
    byLabel,
  };
}

/**
 * Explicación corta y amable de cada fallo, hecha en código (sin IA).
 * @param {SpanResult} span @param {string[]} words @param {SyntaxNames} [names]
 */
export function spanFeedback(span, words, names = {}) {
  const text = words.slice(span.start, span.end).join(' ');
  const name = displayLabel(span.label, names);
  if (span.status === 'correct') return `«${text}»: ${name}. ¡Bien!`;
  if (span.status === 'wrong_label') return `«${text}» es un ${name} (${fullName(span.label, names)}), no ${displayLabel(/** @type {SyntaxLabel} */ (span.given), names)}.`;
  return `Faltaba marcar «${text}» como ${name} (${fullName(span.label, names)}).`;
}

/**
 * Pista (prompt §3): la primera dice qué tipo de cosa falta y dónde; la
 * segunda, cómo empieza su etiqueta.
 * @param {SyntaxNode[]} official @param {SyntaxMark[]} marks @param {1|2} level @param {SyntaxNames} [names]
 */
export function hintFor(official, marks, level, names = {}) {
  const { spans, extra } = compareAnalysis(official, marks);
  const next = spans.find((s) => s.status !== 'correct');
  if (!next) {
    if (extra.length) return { text: 'Te sobra alguna raya. Revisa las que no encajan.', start: extra[0].start, end: extra[0].end };
    return { text: 'Lo tienes todo. ¡Pulsa Comprobar!', start: null, end: null };
  }
  const kind = isPhrase(next.label) ? 'un sintagma' : next.label === 'N' ? 'un núcleo' : next.label === 'Det' ? 'un determinante' : 'un enlace';
  const where = next.status === 'wrong_label' ? 'Revisa la etiqueta de esta raya' : `Aquí falta ${kind}`;
  if (level === 1) return { text: `${where}.`, start: next.start, end: next.end };
  const name = displayLabel(next.label, names);
  const shown = isPhrase(next.label) && name.length > 2 ? `${name.slice(0, 2)}…` : `${name.slice(0, 1)}…`;
  return { text: `${where}: su etiqueta empieza por «${shown}».`, start: next.start, end: next.end };
}

/**
 * Fase tras una frase más (prompt §5). `scores`: aciertos (0–1) de las frases
 * hechas en la fase actual, de la más antigua a la más reciente.
 * @param {'options'|'write'} phase @param {number[]} scores
 * @returns {'options'|'write'}
 */
export function nextPhase(phase, scores, rule = PHASE_RULE) {
  const last = scores.slice(-rule.window);
  if (last.length < rule.window) return phase;
  const mean = last.reduce((a, b) => a + b, 0) / last.length;
  if (phase === 'options' && mean >= rule.up) return 'write';
  if (phase === 'write' && mean < rule.down) return 'options';
  return phase;
}

/**
 * Nivel tras una frase más. `scores`: aciertos desde el último cambio de nivel.
 * @param {number} level @param {number[]} scores
 */
export function nextLevel(level, scores, rule = LEVEL_RULE) {
  const up = scores.slice(-rule.upAfter);
  if (level < rule.max && up.length === rule.upAfter && up.every((s) => s >= rule.up)) return level + 1;
  const down = scores.slice(-rule.downAfter);
  if (level > rule.min && down.length === rule.downAfter && down.every((s) => s < rule.down)) return level - 1;
  return level;
}

/**
 * La etiqueta que más falla (para alternar frases que la trabajen), o null.
 * @param {Partial<Record<SyntaxLabel, {ok: number, total: number}>>[]} history
 */
export function weakestLabel(history, minTotal = 4, below = 0.7) {
  /** @type {Partial<Record<SyntaxLabel, {ok: number, total: number}>>} */
  const sum = {};
  for (const entry of history) {
    for (const label of LABELS) {
      const item = entry?.[label];
      if (!item) continue;
      const acc = (sum[label] ??= { ok: 0, total: 0 });
      acc.ok += Number(item.ok) || 0;
      acc.total += Number(item.total) || 0;
    }
  }
  let worst = /** @type {SyntaxLabel|null} */ (null);
  let worstRate = below;
  for (const label of LABELS) {
    const item = sum[label];
    if (!item || item.total < minTotal) continue;
    const rate = item.ok / item.total;
    if (rate < worstRate) { worst = label; worstRate = rate; }
  }
  return worst;
}

/**
 * Resumen del final: qué dominas (≥ 80 %) y qué repasar (< 60 %).
 * @param {Partial<Record<SyntaxLabel, {ok: number, total: number}>>[]} history
 */
export function sessionSummary(history) {
  /** @type {Partial<Record<SyntaxLabel, {ok: number, total: number}>>} */
  const sum = {};
  for (const entry of history) for (const label of LABELS) {
    const item = entry?.[label];
    if (!item) continue;
    const acc = (sum[label] ??= { ok: 0, total: 0 });
    acc.ok += item.ok; acc.total += item.total;
  }
  const mastered = LABELS.filter((l) => sum[l] && sum[l].ok / sum[l].total >= 0.8);
  const review = LABELS.filter((l) => sum[l] && sum[l].ok / sum[l].total < 0.6);
  return { mastered, review, totals: sum };
}

/**
 * Valida una frase propuesta por la IA y la convierte en análisis oficial.
 * Devuelve null si el JSON no cumple el esquema o las reglas, o si la IA no
 * está segura (no se muestra).
 * @param {unknown} raw
 * @returns {{ text: string, words: string[], analysis: SyntaxNode[] }|null}
 */
export function acceptSentence(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { text, analysis, confidence } = /** @type {Record<string, unknown>} */ (raw);
  if (typeof text !== 'string' || text.length > 200) return null;
  if (confidence !== undefined && confidence !== 'alta') return null;
  const clean = text.trim().replace(/\s+/g, ' ');
  const words = tokenize(clean);
  if (words.length < MIN_WORDS || words.length > MAX_WORDS) return null;
  const tree = treeFromText(words, analysis);
  if (!tree || treeErrors(words.length, tree).length) return null;
  return { text: clean, words, analysis: tree };
}
