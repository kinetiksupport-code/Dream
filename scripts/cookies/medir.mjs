// Bloque 1 de Cookiebot (docs/cookies-inventario.md): qué guarda la web en un
// navegador limpio, sin tocar nada.  node scripts/cookies/medir.mjs [url-base]
import { chromium } from 'playwright';
const base = process.argv[2] || 'https://www.edudream.es';
(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const third = new Set();
  page.on('request', (r) => { const u = new URL(r.url()); if (!u.hostname.endsWith('edudream.es')) third.add(u.hostname); });
  const dump = async (label) => {
    const st = await page.evaluate(async () => ({
      local: Object.keys(localStorage), session: Object.keys(sessionStorage),
      caches: 'caches' in self ? await caches.keys() : [],
      sw: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) : [],
      idb: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : 'n/a',
    })).catch((e) => ({ error: String(e) }));
    const cookies = (await ctx.cookies()).map((c) => `${c.name}@${c.domain} exp=${c.expires === -1 ? 'session' : new Date(c.expires * 1000).toISOString().slice(0, 10)} httpOnly=${c.httpOnly}`);
    console.log(JSON.stringify({ label, url: page.url(), cookies, ...st, third: [...third] }));
  };
  for (const p of ['/', '/login', '/cookies', '/privacidad', '/subir']) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await dump(p);
  }
  // Start Google sign-in, stop before Google pages
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  const btn = page.getByRole('button', { name: /Google/i }).first();
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/auth/v1/authorize') || r.url().includes('accounts.google.com'), { timeout: 15000 }).catch(() => null),
    btn.click().catch(() => {}),
  ]);
  await page.waitForTimeout(3000);
  console.log('authorize-request', req ? new URL(req.url()).hostname : 'none');
  await dump('after-google-click');
  await browser.close();
})();
