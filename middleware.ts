import type { NextRequest } from "next/server";
import { isMaintenanceEnabled } from "@/lib/maintenance";

const MAINTENANCE_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#030409">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Dream · Estamos haciendo mejoras</title>
  <style>
    :root{color-scheme:dark;background:#030409;color:#f7f8fb;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
    *{box-sizing:border-box}body{margin:0;min-height:100svh;min-height:100dvh;display:grid;place-items:center;overflow-x:hidden;padding:max(28px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));background:#030409;color:#f7f8fb}
    main{width:min(100%,1100px);margin:auto}.layout{display:grid;grid-template-columns:minmax(220px,.85fr) minmax(0,1.15fr);align-items:center;gap:clamp(34px,8vw,108px);padding:24px}.art{width:min(100%,420px);aspect-ratio:1;margin:auto}.art img{display:block;width:100%;height:100%;object-fit:contain;mix-blend-mode:lighten}.content{max-width:600px}.brand{display:flex;align-items:center;gap:18px;margin-bottom:clamp(30px,5vw,56px)}.brand img{display:block;width:88px;height:88px;object-fit:contain}.brand span{font-size:clamp(34px,4.5vw,50px);font-weight:650;letter-spacing:-.055em;line-height:1;color:#fff}h1{max-width:560px;margin:0;font-size:clamp(36px,5.8vw,66px);font-weight:650;line-height:1.02;letter-spacing:-.06em;color:#fff}p{max-width:520px;margin:24px 0 0;color:#b9bfd0;font-size:clamp(15px,2vw,18px);line-height:1.7}
    @media(max-width:700px){body{padding:max(24px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))}.layout{grid-template-columns:1fr;gap:0;padding:10px 0;text-align:center}.art{width:min(56vw,270px);margin:0 auto 18px}.content{margin:auto}.brand{justify-content:center;gap:14px;margin-bottom:26px}.brand img{width:66px;height:66px}.brand span{font-size:36px}h1{margin:auto;font-size:clamp(34px,9vw,48px)}p{margin:18px auto 0;font-size:15px}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
  </style>
</head>
<body><main><div class="layout">
  <div class="art"><img src="/brand/maintenance-repair-3d.png" alt="" width="560" height="560"></div>
  <section class="content" aria-labelledby="maintenance-title">
    <div class="brand"><img src="/brand/dream-logo.png" alt="" width="96" height="96"><span>Dream</span></div>
    <h1 id="maintenance-title">Estamos haciendo mejoras.</h1>
    <p>Volveremos cuando hayamos comprobado que todo funciona con estabilidad.</p>
  </section>
</div></main></body></html>`;

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/maintenance-status") return;
  if (!isMaintenanceEnabled()) return;
  return new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Dream-Maintenance": "1",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|brand/).*)"],
};
