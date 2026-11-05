#!/usr/bin/env node
// Fotos de prueba de apuntes a mano para el banco de «Apuntes»
// (docs/APUNTES-LIMPIOS.md, Bloque 0). Sin datos personales: el texto está en
// evals/apuntes-limpios/fotos/*.txt y aquí se dibuja con letra manuscrita
// sobre una hoja con renglones, algo torcida y con sombra, como una foto de móvil.
//   node scripts/apuntes/fotos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'evals/apuntes-limpios/fotos');
const looks = [
  { font: 'Kalam', size: 25, ink: '#1d3a8a', tilt: -1.6 },
  { font: 'Caveat', size: 31, ink: '#222', tilt: 1.2 },
  { font: 'Patrick Hand', size: 26, ink: '#0b4f8a', tilt: -0.7 },
];
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
for (const [i, file] of files.entries()) {
  const look = looks[i % looks.length];
  const [title, ...lines] = fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n');
  const html = `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${look.font.replace(/ /g, '+')}&display=block">
<style>
body{margin:0;background:radial-gradient(circle at 30% 20%,#8a8178,#4b453f);height:1200px;display:grid;place-items:center;overflow:hidden}
.sheet{width:760px;min-height:1040px;padding:70px 50px 40px 90px;box-sizing:border-box;transform:rotate(${look.tilt}deg);
background:#fbfaf4 repeating-linear-gradient(transparent 0 37px,#9fb7d6 37px 38px);background-position:0 18px;box-shadow:0 18px 40px rgba(0,0,0,.45);
position:relative;font-family:'${look.font}';color:${look.ink};font-size:${look.size}px;line-height:38px}
.sheet:before{content:'';position:absolute;left:70px;top:0;bottom:0;border-left:2px solid #e3a3a3}
h1{font-size:1.35em;font-weight:400;margin:0 0 0 0;line-height:76px;text-decoration:underline}
p{margin:0;white-space:pre-wrap}
.glare{position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,0) 40%,rgba(255,255,255,.25) 55%,rgba(255,255,255,0) 70%);pointer-events:none}
</style></head><body><div class="sheet"><h1>${esc(title)}</h1>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<div class="glare"></div></div></body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(dir, file.replace(/\.txt$/, '.jpg'));
  await page.screenshot({ path: out, type: 'jpeg', quality: 72 });
  console.log(path.relative(root, out));
}
await browser.close();
