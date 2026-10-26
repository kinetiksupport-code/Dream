// Caja de herramientas matemática del servidor (Bloque 2 ter, punto 3).
// Aritmética EXACTA con fracciones (BigInt), sin ejecutar nada que escriba el
// modelo: se lee el texto, se calcula aquí y se compara. La lista de
// operaciones sale de los fallos reales: la fracción generatriz (22/10/2026)
// y las igualdades con fracciones de los ejemplos («(123 − 12)/90 = 37/30»).

const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };

/** Fracción simplificada {n, d} con d > 0. */
export function frac(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new Error('division_by_zero');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
export const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
export const div = (a, b) => frac(a.n * b.d, a.d * b.n);
export const equal = (a, b) => a.n === b.n && a.d === b.d;
export const show = (f) => (f.d === 1n ? `${f.n}` : `${f.n}/${f.d}`);

/**
 * Decimal (exacto o periódico) → fracción. Acepta coma o punto y el periodo
 * como «…» repetido, entre paréntesis o con \overline:
 * «2,46», «0,428571428571…», «1,2333…», «0,(428571)», «1,2\overline{3}».
 * Con «…», el periodo es el bloque más corto que se repite al menos dos veces
 * al final (o la última cifra repetida, como en 1,2333…).
 * @returns {{ n: bigint, d: bigint } | null}
 */
export function decimalToFraction(text) {
  let s = String(text).trim().replace(/\s/g, '').replace(/^([-−]?\d+)\.(\d)/, '$1,$2').replace(/[.,]+$/, (t) => (/\.\.\./.test(t) ? '...' : ''));
  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) { negative = true; s = s.slice(1); }
  let int, nonRep = '', rep = '';
  let m;
  if ((m = /^(\d+),(\d*)\\overline\{(\d+)\}$/.exec(s)) || (m = /^(\d+),(\d*)\((\d+)\)$/.exec(s))) {
    [, int, nonRep, rep] = m;
  } else if ((m = /^(\d+),(\d+)(?:\.\.\.|…)$/.exec(s))) {
    int = m[1];
    const digits = m[2];
    let found = false;
    for (let len = 1; len <= Math.floor(digits.length / 2) && !found; len++) {
      for (let start = 0; start + 2 * len <= digits.length; start++) {
        const block = digits.slice(start, start + len);
        const tail = digits.slice(start);
        // El resto, desde start, son repeticiones de block (la última puede ir cortada).
        if (tail.length >= 2 * len && block.repeat(Math.ceil(tail.length / len)).startsWith(tail)) {
          nonRep = digits.slice(0, start); rep = block; found = true; break;
        }
      }
    }
    // Un solo periodo más un trozo (0,4285714…): bloque de 2 cifras o más.
    for (let len = 2; len < digits.length && !found; len++) {
      for (let start = 0; start + len < digits.length; start++) {
        const block = digits.slice(start, start + len);
        const tail = digits.slice(start);
        if (tail.length > len && block.repeat(2).startsWith(tail)) { nonRep = digits.slice(0, start); rep = block; found = true; break; }
      }
    }
    if (!found) return null;
  } else if ((m = /^(\d+)(?:,(\d+))?$/.exec(s))) {
    int = m[1]; nonRep = m[2] ?? '';
  } else return null;
  let result;
  if (!rep) result = frac(BigInt(int + nonRep), 10n ** BigInt(nonRep.length));
  else {
    // (todo sin coma con el periodo una vez − parte anterior al periodo) / (9…9 0…0)
    const all = BigInt(int + nonRep + rep);
    const before = BigInt(int + nonRep);
    const den = BigInt('9'.repeat(rep.length) + '0'.repeat(nonRep.length));
    result = frac(all - before, den);
  }
  return negative ? frac(-result.n, result.d) : result;
}

// ---------------------------------------------------------------------------
// Expresiones con fracciones: números, + − · × * / ÷, paréntesis y \frac{}{}.
function tokenize(expr) {
  const s = String(expr)
    .replace(/\\[dt]?frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))')
    .replace(/\\cdot|\\times|·|×/g, '*').replace(/\\div|÷/g, '/').replace(/−|–/g, '-')
    .replace(/\\left|\\right|\\,|\\;/g, '').replace(/[{}]/g, '').replace(/\s+/g, '');
  const tokens = [];
  for (let i = 0; i < s.length;) {
    const num = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
    if (num) { tokens.push(num[0]); i += num[0].length; continue; }
    if ('+-*/()'.includes(s[i])) { tokens.push(s[i]); i++; continue; }
    return null;
  }
  return tokens;
}

/** Evalúa una expresión con fracciones de forma exacta; null si no se entiende. */
export function evaluate(expr) {
  const tokens = tokenize(expr);
  if (!tokens?.length) return null;
  let i = 0;
  const peek = () => tokens[i];
  const primary = () => {
    const t = tokens[i++];
    if (t === '(') { const v = sum(); if (tokens[i++] !== ')') throw new Error('paren'); return v; }
    if (t === '-') return mul(frac(-1n), primary());
    if (t && /^\d/.test(t)) { const f = decimalToFraction(t); if (!f) throw new Error('num'); return f; }
    throw new Error('token');
  };
  const product = () => {
    let v = primary();
    while (peek() === '*' || peek() === '/') v = tokens[i++] === '*' ? mul(v, primary()) : div(v, primary());
    return v;
  };
  const sum = () => {
    let v = product();
    while (peek() === '+' || peek() === '-') v = tokens[i++] === '+' ? add(v, product()) : sub(v, product());
    return v;
  };
  try { const v = sum(); return i === tokens.length ? v : null; } catch { return null; }
}

// ---------------------------------------------------------------------------
/**
 * Busca en una respuesta igualdades comprobables y devuelve las que NO cuadran:
 * cadenas «A = B = C» de números, fracciones y decimales (también periódicos).
 * Solo mira lo que se puede calcular con exactitud; lo demás se ignora.
 * @param {string} answer
 * @returns {{ claim: string, left: string, right: string, expected: string }[]}
 */
export function checkEqualities(answer) {
  const text = String(answer)
    .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, ' ')
    .replace(/\\[dt]?frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))')
    .replace(/(\d),(\d*)\\overline\{(\d+)\}/g, '$1,$2($3)')
    .replace(/\\cdot|\\times/g, '·').replace(/\\div/g, '÷').replace(/\\left|\\right/g, '');
  const term = String.raw`[-−]?[\d(][\d.,…()+\-−*/·×÷ ]*`;
  const chain = new RegExp(`${term}(?:=\\s*${term})+`, 'g');
  const tidy = (p) => p.trim().replace(/(?:[.,]\s*|\s+)$/, '').replace(/,$/, '').trim();
  const wrong = [];
  // Pegado a una letra, un exponente, ½ o una operación, es un trozo de una
  // expresión que no sabemos leer entera («x² − 5x + 6 = 0», «½ · 2 · 25»): fuera.
  const foreign = /[\p{L}²³¹⁰⁴-⁹½⅓¼¾^+\-−*/·×÷]/u;
  for (const match of text.matchAll(chain)) {
    // Una palabra separada por un espacio («y 7 · 8») no cuenta; pegada, sí.
    const glued = text.charAt((match.index ?? 0) - 1);
    const spaced = text.slice(0, match.index).trimEnd().slice(-1);
    const before = /\p{L}/u.test(spaced) && glued !== spaced ? '' : spaced;
    // Lo que va justo detrás de la última cifra («= 2x»: la «x» está pegada).
    const after = text.charAt((match.index ?? 0) + match[0].replace(/[\s,.;:…]+$/, '').length);
    if ((before && foreign.test(before)) || (after && /[\p{L}²³¹⁰⁴-⁹^(]/u.test(after))) continue;
    const parts = match[0].split('=').map(tidy).filter(Boolean);
    if (parts.length < 2) continue;
    const values = parts.map((p) => decimalToFraction(p) ?? evaluate(p));
    for (let k = 1; k < parts.length; k++) {
      const a = values[k - 1], b = values[k];
      if (!a || !b) continue;
      if (!equal(a, b)) wrong.push({ claim: match[0].trim(), left: parts[k - 1], right: parts[k], expected: show(a) });
    }
  }
  return wrong;
}

/** Mensaje para pedir a la IA que corrija (sin dar la solución de deberes: solo el dato numérico). */
export function correctionNote(wrong) {
  return `COMPROBACIÓN DEL SERVIDOR: en tu respuesta anterior hay operaciones que no cuadran: ${wrong
    .slice(0, 3).map((w) => `«${w.left} = ${w.right}» es falso (${w.left} = ${w.expected})`).join('; ')}. Rehaz la respuesta con los números correctos. No menciones esta comprobación.`;
}
