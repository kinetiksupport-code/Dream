// Pong contra Orb: flechas arriba/abajo o tocar arriba/abajo. Gana quien llegue a 5.
import { COLORS, text, type GameSpec } from "./engine";

const PH = 70;
interface S { you: number; orb: number; bx: number; by: number; vx: number; vy: number; mine: number; theirs: number; move: number; started: boolean }

function serve(s: S, w: number, h: number, dir: number) {
  s.bx = w / 2;
  s.by = h / 2;
  s.vx = 220 * dir;
  s.vy = (Math.random() - 0.5) * 220;
}

const pong: GameSpec<S> = {
  init(w, h) {
    const s = { you: h / 2, orb: h / 2, bx: 0, by: 0, vx: 0, vy: 0, mine: 0, theirs: 0, move: 0, started: false };
    serve(s, w, h, 1);
    return s;
  },
  step(s, dt, w, h) {
    s.you = Math.max(PH / 2, Math.min(h - PH / 2, s.you + s.move * 320 * dt));
    s.move *= 0.85;
    s.orb += Math.sign(s.by - s.orb) * Math.min(Math.abs(s.by - s.orb), 210 * dt);
    s.bx += s.vx * dt;
    s.by += s.vy * dt;
    if (s.by < 6 || s.by > h - 6) s.vy *= -1;
    if (s.bx < 26 && Math.abs(s.by - s.you) < PH / 2 + 6 && s.vx < 0) {
      s.vx = Math.abs(s.vx) * 1.05;
      s.vy += (s.by - s.you) * 4;
    }
    if (s.bx > w - 26 && Math.abs(s.by - s.orb) < PH / 2 + 6 && s.vx > 0) s.vx = -Math.abs(s.vx) * 1.03;
    if (s.bx < 0) {
      s.theirs++;
      serve(s, w, h, 1);
    }
    if (s.bx > w) {
      s.mine++;
      serve(s, w, h, -1);
    }
    return s.theirs >= 5 || s.mine >= 5;
  },
  input(s, what) {
    if (what === "up") s.move = -1;
    if (what === "down") s.move = 1;
  },
  point(s, _x, y) {
    s.you = y;
  },
  draw(c, s, w, h) {
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(255,255,255,.08)";
    c.fillRect(w / 2 - 1, 0, 2, h);
    c.fillStyle = COLORS.pale;
    c.fillRect(12, s.you - PH / 2, 8, PH);
    c.fillStyle = COLORS.blue;
    c.fillRect(w - 20, s.orb - PH / 2, 8, PH);
    c.fillStyle = COLORS.white;
    c.beginPath();
    c.arc(s.bx, s.by, 6, 0, Math.PI * 2);
    c.fill();
    text(c, `${s.mine}  ·  ${s.theirs}`, w / 2, 28, 18, COLORS.dim);
  },
  score: (s) => s.mine,
};
export default pong;
