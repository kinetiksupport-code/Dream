/**
 * Ritmo del efecto de escritura del chat (docs/HABLA_NATURAL.md, P5).
 *
 * Todo lo que Carlos puede pedir cambiar («más lento», «más rápido») está
 * aquí. Para ir más lento, baja `charsPerSecond`; para que una respuesta
 * larga no tarde tanto, baja `maxTotalMs`.
 */
export const TYPING = {
  /** Velocidad normal: ~40 caracteres por segundo (unas 7 palabras por segundo). */
  charsPerSecond: 40,
  /** Pausa tras punto, interrogación, exclamación o puntos suspensivos (ms, mín-máx). */
  pauseSentenceMs: [150, 250] as const,
  /** Pausa tras coma, punto y coma o dos puntos (ms, mín-máx). */
  pauseCommaMs: [60, 100] as const,
  /** Variación de cada palabra (±15 %), para que no suene a máquina. */
  jitter: 0.15,
  /** Tope: ninguna respuesta tarda más que esto en escribirse; si es larga, acelera. */
  maxTotalMs: 8000,
  /** Si lo que falta por escribir pasa de esto mientras llega, acelera poco a poco. */
  catchUpMs: 2500,
  /** …pero como mucho al doble y medio de la velocidad normal. */
  maxCatchUp: 2.5,
  /** Cuánto tarda en acelerar o frenar hacia el ritmo nuevo (ms). */
  smoothingMs: 300,
  /** «Dream está escribiendo…» sale si el primer carácter tarda más que esto. */
  indicatorDelayMs: 400,
};

/** Número pseudoaleatorio fijo por posición (0-1): el ritmo no cambia entre repintados. */
export function noise(i: number, salt = 0) {
  let x = (i + 1) * 374761393 + salt * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x ^= x >>> 16;
  return ((x >>> 0) % 10000) / 10000;
}

const between = ([a, b]: readonly [number, number], t: number) => a + (b - a) * t;

/**
 * Lo que tarda en «teclearse» una unidad (una palabra, o una fórmula entera)
 * más la pausa que deja detrás. `next` es el texto que sigue (un signo suelto
 * como «?» tras una fórmula cuenta para la pausa).
 */
export function unitCost(text: string, index: number, opts = TYPING) {
  const chars = Math.min(text.length, 24) + 1; // + el espacio
  const jitter = 1 + opts.jitter * (noise(index) * 2 - 1);
  let ms = (chars / opts.charsPerSecond) * 1000 * jitter;
  if (/[.!?…][»"”')\]*_]*$/.test(text)) ms += between(opts.pauseSentenceMs, noise(index, 1));
  else if (/[,;:][»"”')\]*_]*$/.test(text)) ms += between(opts.pauseCommaMs, noise(index, 2));
  return ms;
}
