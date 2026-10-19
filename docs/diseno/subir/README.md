# Subida desde el móvil (`/subir#<token>`)

Pantalla nueva (PR 5): no hay «antes». Capturas con la API simulada (`CAPTURAS_DIR=docs/diseno/subir npx playwright test tests/browser/subir.spec.ts`), a 390 y 1280 px, claro y oscuro.

| Estado | Archivos | Por qué |
|---|---|---|
| Conectado | `conectado-*` | Un solo foco: el titular «Conectado con tu ordenador» y dos botones grandes. Sin menú ni enlaces a la cuenta. |
| Subiendo | `subiendo-*` | Cada archivo dice lo que pasa: «Procesando archivo…» con el orbe pulsando. |
| Subidos | `subidos-*`, `subidos-movil-claro-reducido.webp` | Tick dibujado (sin dibujo con movimiento reducido), contador y «Subir otro». |
| Código no válido | `no-vale-*` | Una sola página amable, sin decir por qué. |

`qr-ejemplo.svg`: QR de un enlace de prueba generado con `lib/qr.ts` (abre la página «Este código ya no vale»). Grabación: `docs/diseno/grabaciones/subir.webm`.
