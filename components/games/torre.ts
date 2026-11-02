// Torre: suelta cada bloque justo encima del anterior. Espacio, Intro o toque.
import { COLORS, type GameSpec } from "./engine";

const H = 24;
interface Block { x: number; w: number }
interface S { stack: Block[]; moving: Block; dir: number; speed: number; done: boolean }

const torre: GameSpec<S> = {
  init: (w) => {
    const base = { x: w / 2 - 75, w: 150 };
    return { stack: [base], moving: { x: 0, w: 150 }, dir: 1, speed: 140, done: false };
  },
  step(s, dt, w) {
    s.moving.x += s.dir * s.speed * dt;
    if (s.moving.x + s.moving.w > w) s.dir = -1;
    if (s.moving.x < 0) s.dir = 1;
    return s.done;
  },
  input(s, what) {
    if (what !== "action") return;
    const top = s.stack[s.stack.length - 1];
    const left = Math.max(top.x, s.moving.x);
    const right = Math.min(top.x + top.w, s.moving.x + s.moving.w);
    if (right <= left) {
      s.done = true;
      return;
    }
    s.stack.push({ x: left, w: right - left });
    s.moving = { x: 0, w: right - left };
    s.speed = Math.min(s.speed + 12, 360);
  },
  draw(c, s, w, h) {
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, w, h);
    const shades = [COLORS.deep, "#2443B0", COLORS.blue, COLORS.sky];
    // La torre baja cuando crece, para que siempre se vea la cima.
    const shift = Math.max(0, (s.stack.length + 2) * H - h);
    s.stack.forEach((b, i) => {
      c.fillStyle = shades[i % shades.length];
      c.fillRect(b.x, h - (i + 1) * H + shift, b.w, H - 2);
    });
    c.fillStyle = COLORS.pale;
    c.fillRect(s.moving.x, h - (s.stack.length + 1) * H + shift, s.moving.w, H - 2);
  },
  score: (s) => s.stack.length - 1,
};
export default torre;
