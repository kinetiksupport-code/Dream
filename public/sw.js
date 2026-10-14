const CACHE = "dream-static-v3";
const STATIC = [
  "/offline.html",
  "/icon-192.png",
  "/icon-512.png",
  "/brand/dream-logo.png",
  "/brand/maintenance-repair-3d.png",
];
const STATUS_PATH = "/api/maintenance-status";
const STATUS_TTL_MS = 3000;
let statusCheckedAt = 0;
let lastMaintenanceStatus = null;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

async function notifyClients(type) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type });
}

async function isMaintenanceActive() {
  if (Date.now() - statusCheckedAt < STATUS_TTL_MS && lastMaintenanceStatus !== null)
    return lastMaintenanceStatus;
  const response = await fetch(STATUS_PATH, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (response.headers.get("x-dream-maintenance") === "1") {
    statusCheckedAt = Date.now();
    lastMaintenanceStatus = true;
    await notifyClients("DREAM_MAINTENANCE");
    return true;
  }
  if (!response.ok) throw new Error("No se pudo verificar el mantenimiento.");
  const payload = await response.json();
  if (!payload || typeof payload.maintenance !== "boolean")
    throw new Error("Respuesta de estado no válida.");
  statusCheckedAt = Date.now();
  lastMaintenanceStatus = payload.maintenance;
  if (payload.maintenance) await notifyClients("DREAM_MAINTENANCE");
  return payload.maintenance;
}

function blockedResponse(unavailable = false) {
  if (unavailable) void notifyClients("DREAM_MAINTENANCE_UNAVAILABLE");
  return new Response(
    JSON.stringify({ error: unavailable
      ? "No se pudo comprobar la disponibilidad de Dream."
      : "Dream está temporalmente en mantenimiento." }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Dream-Maintenance": "1",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      },
    },
  );
}

function isDreamSupabaseRequest(url) {
  const supabaseHost = url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co");
  return (
    url.origin !== self.location.origin &&
    supabaseHost &&
    url.pathname.startsWith("/functions/v1/")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname === STATUS_PATH) {
    event.respondWith(
      fetch(request).then(async (response) => {
        if (response.headers.get("x-dream-maintenance") === "1") {
          statusCheckedAt = Date.now();
          lastMaintenanceStatus = true;
          await notifyClients("DREAM_MAINTENANCE");
        } else if (response.ok) {
          try {
            const payload = await response.clone().json();
            if (typeof payload.maintenance === "boolean") {
              statusCheckedAt = Date.now();
              lastMaintenanceStatus = payload.maintenance;
            }
          } catch {}
        }
        return response;
      }),
    );
    return;
  }

  // Guard Edge Function calls made by pages controlled by this worker.
  if (isDreamSupabaseRequest(url)) {
    event.respondWith(
      (async () => {
        try {
          if (await isMaintenanceActive()) return blockedResponse(false);
        } catch {
          return blockedResponse(true);
        }
        return fetch(request);
      })(),
    );
    return;
  }

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(async (response) => {
        if (response.headers.get("x-dream-maintenance") === "1") {
          statusCheckedAt = Date.now();
          lastMaintenanceStatus = true;
          await notifyClients("DREAM_MAINTENANCE");
        }
        return response;
      }).catch(() => caches.match("/offline.html")),
    );
    return;
  }
  if (STATIC.includes(url.pathname))
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
