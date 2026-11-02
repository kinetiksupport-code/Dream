// Revienta el orbe: tócalos antes de que lleguen arriba. Con teclado, mueve el
// visor con las flechas y revienta con Espacio. Si uno escapa, se acaba
// (sin vidas: 0.10 del prompt).
import { COLORS, type GameSpec } from "./engine";

interface Orb { x: number; y: number; r: number; v: number }
interface S { orbs: Orb[]; t: number; popped: number; lost: number; cx: number; cy: number }

function pop(s: S, x: number, y: number) {
  const i = s.orbs.findIndex((o) => Math.hypot(o.x - x, o.y - y) < o.r + 8);
  if (i >= 0) {
    s.orbs.splice(i, 1);
    s.popped++;
  }
}

const orbes: GameSpec<S> = {
  init: (w, h) => ({ orbs: [], t: 0, popped: 0, lost: 0, cx: w / 2, cy: h / 2 }),
  step(s, dt, w, h) {
    s.t += dt;
    const every = Math.max(0.55, 1.3 - s.popped * 0.02);
    if (s.t > every) {
      s.t = 0;
      const r = 14 + Math.random() * 12;
      s.orbs.push({ x: r + Math.random() * (w - 2 * r), y: h + r, r, v: 50 + Math.random() * 40 + s.popped * 1.5 });
    }
    for (const o of s.orbs) o.y -= o.v * dt;
    const before = s.orbs.length;
    s.orbs = s.orbs.filter((o) => o.y + o.r > 0);
    s.lost += before - s.orbs.length;
    return s.lost > 0;
  },
  input(s, what) {
    const m = 24;
    if (what === "up") s.cy -= m;
    if (what === "down") s.cy += m;
    if (what === "left") s.cx -= m;
    if (what === "right") s.cx += m;
    if (what === "action") pop(s, s.cx, s.cy);
  },
  point(s, x, y) {
    s.cx = x;
    s.cy = y;
    pop(s, x, y);
  },
  draw(c, s, w, h) {
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, w, h);
    for (const o of s.orbs) {
      const g = c.createRadialGradient(o.x - o.r / 3, o.y - o.r / 3, 2, o.x, o.y, o.r);
      g.addColorStop(0, COLORS.pale);
      g.addColorStop(1, COLORS.blue);
      c.fillStyle = g;
      c.beginPath();
      c.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = COLORS.white;
    c.beginPath();
    c.arc(s.cx, s.cy, 12, 0, Math.PI * 2);
    c.stroke();
  },
  score: (s) => s.popped,
};
export default orbes;
