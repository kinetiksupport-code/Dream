// Koi: toca el agua y los peces vienen a comer. Sin final: para relajarse.
import { COLORS, type GameSpec } from "./engine";

interface Fish { x: number; y: number; a: number; v: number; hue: string }
interface S { fish: Fish[]; food: { x: number; y: number }[]; eaten: number; cx: number; cy: number }

const koi: GameSpec<S> = {
  init(w, h) {
    const hues = [COLORS.orange, COLORS.white, COLORS.sky, COLORS.orange, COLORS.pale];
    return {
      fish: hues.map((hue, i) => ({ x: (w / 6) * (i + 1), y: h / 2 + (i % 2 ? 40 : -40), a: i, v: 40, hue })),
      food: [],
      eaten: 0,
      cx: w / 2,
      cy: h / 2,
    };
  },
  step(s, dt, w, h) {
    for (const f of s.fish) {
      const target = s.food[0] ?? { x: w / 2 + Math.cos(f.a * 0.7) * w * 0.3, y: h / 2 + Math.sin(f.a) * h * 0.25 };
      const want = Math.atan2(target.y - f.y, target.x - f.x);
      let d = want - f.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      f.a += Math.max(-2 * dt, Math.min(2 * dt, d));
      const speed = s.food.length ? 90 : 40;
      f.x += Math.cos(f.a) * speed * dt;
      f.y += Math.sin(f.a) * speed * dt;
      if (s.food[0] && Math.hypot(s.food[0].x - f.x, s.food[0].y - f.y) < 12) {
        s.food.shift();
        s.eaten++;
      }
    }
    return false;
  },
  input(s, what) {
    const m = 30;
    if (what === "up") s.cy -= m;
    if (what === "down") s.cy += m;
    if (what === "left") s.cx -= m;
    if (what === "right") s.cx += m;
    if (what === "action") s.food.push({ x: s.cx, y: s.cy });
  },
  point(s, x, y) {
    s.cx = x;
    s.cy = y;
    if (s.food.length < 6) s.food.push({ x, y });
  },
  draw(c, s, w, h) {
    c.fillStyle = "#071433";
    c.fillRect(0, 0, w, h);
    c.fillStyle = COLORS.green;
    for (const p of s.food) {
      c.beginPath();
      c.arc(p.x, p.y, 4, 0, Math.PI * 2);
      c.fill();
    }
    for (const f of s.fish) {
      c.save();
      c.translate(f.x, f.y);
      c.rotate(f.a);
      c.fillStyle = f.hue;
      c.beginPath();
      c.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(-14, 0);
      c.lineTo(-24, -7);
      c.lineTo(-24, 7);
      c.fill();
      c.restore();
    }
    c.strokeStyle = "rgba(255,255,255,.35)";
    c.beginPath();
    c.arc(s.cx, s.cy, 10, 0, Math.PI * 2);
    c.stroke();
  },
  score: (s) => s.eaten,
};
export default koi;
