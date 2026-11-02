// Snake: come estrellas sin chocarte contigo. Flechas o deslizar/tocar el lado.
import { COLORS, type GameSpec } from "./engine";

const N = 16;
type P = [number, number];
interface S { body: P[]; dir: P; next: P; star: P; t: number; eaten: number; done: boolean }

function freeCell(body: P[]): P {
  for (let i = 0; i < 200; i++) {
    const p: P = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)];
    if (!body.some(([x, y]) => x === p[0] && y === p[1])) return p;
  }
  return [0, 0];
}

const snake: GameSpec<S> = {
  init: () => {
    const body: P[] = [[8, 8], [7, 8], [6, 8]];
    return { body, dir: [1, 0], next: [1, 0], star: freeCell(body), t: 0, eaten: 0, done: false };
  },
  step(s, dt) {
    s.t += dt;
    const every = Math.max(0.07, 0.16 - s.eaten * 0.004);
    if (s.t < every) return s.done;
    s.t = 0;
    s.dir = s.next;
    const [hx, hy] = s.body[0];
    const head: P = [hx + s.dir[0], hy + s.dir[1]];
    if (head[0] < 0 || head[1] < 0 || head[0] >= N || head[1] >= N || s.body.some(([x, y]) => x === head[0] && y === head[1])) {
      s.done = true;
      return true;
    }
    s.body.unshift(head);
    if (head[0] === s.star[0] && head[1] === s.star[1]) {
      s.eaten++;
      s.star = freeCell(s.body);
    } else s.body.pop();
    return false;
  },
  input(s, what) {
    const dirs: Record<string, P> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const d = dirs[what];
    if (d && (d[0] !== -s.dir[0] || d[1] !== -s.dir[1])) s.next = d;
  },
  // Toque: gira hacia el lado de la cabeza donde se toca.
  point(s, x, y, w, h) {
    const cell = Math.min(w, h) / N;
    const [hx, hy] = s.body[0];
    const dx = x - (hx + 0.5) * cell - (w - cell * N) / 2;
    const dy = y - (hy + 0.5) * cell - (h - cell * N) / 2;
    this.input(s, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  },
  draw(c, s, w, h) {
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, w, h);
    const cell = Math.min(w, h) / N;
    const ox = (w - cell * N) / 2;
    const oy = (h - cell * N) / 2;
    c.strokeStyle = "rgba(255,255,255,.06)";
    c.strokeRect(ox, oy, cell * N, cell * N);
    c.fillStyle = COLORS.orange;
    c.beginPath();
    c.arc(ox + (s.star[0] + 0.5) * cell, oy + (s.star[1] + 0.5) * cell, cell * 0.35, 0, Math.PI * 2);
    c.fill();
    s.body.forEach(([x, y], i) => {
      c.fillStyle = i === 0 ? COLORS.pale : COLORS.blue;
      c.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
    });
  },
  score: (s) => s.eaten,
};
export default snake;
