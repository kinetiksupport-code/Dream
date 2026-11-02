// Motor mínimo de los minijuegos de espera (prompt de la ruta, 0.10).
// Sin dependencias, sin red y sin sonido. Cada juego es un módulo aparte que
// solo se descarga al pulsarlo (import() en play-while-waiting.tsx).
// - Bucle con requestAnimationFrame y paso fijo (dt acotado).
// - Se pausa si la pestaña se oculta o la ventana pierde el foco.
// - Teclado (flechas y Espacio) y toque/ratón, con las mismas acciones.

export interface GameHooks {
  /** Puntos de la partida en curso. */
  onScore: (score: number) => void;
  /** Fin de la partida (el récord lo guarda quien llama). */
  onOver: (score: number) => void;
}
export interface GameApi {
  pause(): void;
  resume(): void;
  restart(): void;
  destroy(): void;
}
export type Input = "up" | "down" | "left" | "right" | "action";
export interface GameSpec<S> {
  /** Estado inicial de una partida. */
  init(w: number, h: number): S;
  /** Avanza dt segundos; devuelve true si la partida ha terminado. */
  step(s: S, dt: number, w: number, h: number): boolean;
  draw(c: CanvasRenderingContext2D, s: S, w: number, h: number): void;
  input(s: S, what: Input): void;
  /** Toque o clic en (x, y) del lienzo, en píxeles CSS. */
  point?(s: S, x: number, y: number, w: number, h: number): void;
  score(s: S): number;
}

export const COLORS = {
  bg: "#06081A",
  blue: "#155BFF",
  sky: "#6F8CFF",
  pale: "#B9C8FF",
  deep: "#1B2A6B",
  white: "#F3F5FA",
  dim: "rgba(243,245,250,.45)",
  green: "#3BD17A",
  orange: "#FF8A3D",
};

export function runGame<S>(canvas: HTMLCanvasElement, spec: GameSpec<S>, hooks: GameHooks): GameApi {
  const c = canvas.getContext("2d");
  let w = canvas.clientWidth || 320;
  let h = canvas.clientHeight || 320;
  let state = spec.init(w, h);
  let paused = false;
  let over = false;
  let last = 0;
  let raf = 0;
  let lastScore = -1;

  function size() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || w;
    h = canvas.clientHeight || h;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    c?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min((t - last) / 1000, 1 / 20) : 0;
    last = t;
    if (!c) return;
    if (!paused && !over) {
      over = spec.step(state, dt, w, h);
      const sc = spec.score(state);
      if (sc !== lastScore) {
        lastScore = sc;
        hooks.onScore(sc);
      }
      if (over) hooks.onOver(sc);
    }
    spec.draw(c, state, w, h);
  }
  const keys: Record<string, Input> = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", " ": "action", Enter: "action",
  };
  function onKey(e: KeyboardEvent) {
    const what = keys[e.key];
    if (!what || paused || over) return;
    e.preventDefault();
    spec.input(state, what);
  }
  function onPointer(e: PointerEvent) {
    if (paused || over) return;
    const r = canvas.getBoundingClientRect();
    if (spec.point) spec.point(state, e.clientX - r.left, e.clientY - r.top, w, h);
    else spec.input(state, "action");
  }
  const pause = () => {
    paused = true;
  };
  const onVisibility = () => {
    if (document.hidden) pause();
  };
  size();
  window.addEventListener("resize", size);
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPointer);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", pause);
  raf = requestAnimationFrame(frame);

  return {
    pause,
    resume() {
      paused = false;
      last = 0;
    },
    restart() {
      state = spec.init(w, h);
      over = false;
      paused = false;
      last = 0;
      lastScore = -1;
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
    },
  };
}

/** Récord por juego en este dispositivo (un número; no es contenido personal). */
export function readRecord(id: string) {
  try {
    return Number(localStorage.getItem(`dream-juego-${id}`)) || 0;
  } catch {
    return 0;
  }
}
export function saveRecord(id: string, score: number) {
  try {
    if (score > readRecord(id)) localStorage.setItem(`dream-juego-${id}`, String(score));
  } catch {
    /* sin almacenamiento: el récord no se guarda */
  }
}

export function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size = 16, color: string = COLORS.white) {
  c.fillStyle = color;
  c.font = `600 ${size}px system-ui, sans-serif`;
  c.textAlign = "center";
  c.fillText(s, x, y);
}
