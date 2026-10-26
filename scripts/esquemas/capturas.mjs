#!/usr/bin/env node
// Capturas del banco de esquemas: dibuja cada JSON de una carpeta de
// resultados en /esquema-muestra (servidor con DREAM_STYLE_LAB=1), guarda la
// captura de escritorio y de móvil y anota los desbordes en resumen.json.
//
//   DREAM_STYLE_LAB=1 npx next start -p 3111 &
//   BASE_URL=http://localhost:3111 node scripts/esquemas/capturas.mjs evals/esquemas/resultados/<fecha>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) { console.error('Uso: node scripts/esquemas/capturas.mjs <carpeta de resultados>'); process.exit(2); }
const base = process.env.BASE_URL ?? 'http://localhost:3111';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !['resumen.json', 'render.json'].includes(f));
const shots = path.join(dir, 'capturas');
fs.mkdirSync(shots, { recursive: true });

// Elementos cuyo texto se sale de su caja (sin contar los ocultos para lector de pantalla).
const overflowCheck = () => [...document.querySelectorAll('article *')]
  .filter((e) => e.clientWidth > 1 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible')
  .map((e) => `${e.tagName.toLowerCase()}: ${(e.textContent ?? '').trim().slice(0, 40)}`);

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
const report = {};
for (const file of files) {
  const scheme = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const name = file.replace(/\.json$/, '');
  report[name] = {};
  for (const [label, width, height] of [['escritorio', 1280, 900], ['movil', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.addInitScript((s) => { window.__ESQUEMA__ = s; }, scheme);
    await page.goto(`${base}/esquema-muestra`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const overflow = (await page.evaluate(overflowCheck)).filter((t) => !/^(span|caption):/.test(t) || t.length > 12);
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await page.screenshot({ path: path.join(shots, `${name}-${label}.png`), fullPage: true });
    report[name][label] = { overflow, pageOverflow };
    await page.close();
  }
  const bad = Object.values(report[name]).some((r) => r.pageOverflow);
  console.log(`${bad ? 'DESBORDA' : 'ok      '} ${name}`);
}
await browser.close();
const resumen = path.join(dir, 'resumen.json');
if (fs.existsSync(resumen)) {
  const data = JSON.parse(fs.readFileSync(resumen, 'utf8'));
  data.render = report;
  fs.writeFileSync(resumen, JSON.stringify(data, null, 2));
} else fs.writeFileSync(path.join(dir, 'render.json'), JSON.stringify(report, null, 2));
console.log(`Capturas en ${shots}`);
