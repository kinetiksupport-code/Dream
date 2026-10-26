# Login animado y transición desde la landing (entrega 3)

Encargo «landing, login y bienvenida» del 20/10/2026, apartado 3. El flujo de Google no cambia: `redirectTo`, `/auth/callback`, PKCE y la redirección al dominio canónico no se tocan.

## Auditoría previa

| Archivo | Qué había | Qué faltaba | Qué cambia |
|---|---|---|---|
| `app/login/page.tsx` | Botón de Google con pulsado (0,97), carga («Abriendo Google…» con anillo), error con «Volver a intentarlo» | Que el error no empuje de golpe lo de abajo | Lo de debajo del mensaje (texto legal y «Volver al inicio») se desliza a su sitio (FLIP, 200 ms) |
| `app/login/login.module.css` | Entrada: mascota, titular, legal y enlace; el botón de Google sin animar | Orden pegatina → titular → texto → botón | Escalonado de 40 ms en ese orden (0–160 ms), con `backwards` para no pisar `.press` |
| `app/page.tsx` | Enlaces normales a `/login` | La transición | `OrbLink` (isla cliente) y `view-transition-name: dream-orb` en el orbe del héroe |
| — | — | El orbe que «viaja» | `lib/orb-transition.ts` y la regla `dream-orb` de `globals.css` |

## Cómo funciona la transición

- El React estable de Next 15 no tiene `<ViewTransition>`. Por eso se usa `document.startViewTransition`, con detección. Lo mismo ya se comprobó en `docs/diseno/estilo/README.md`.
- El orbe de la landing y la pegatina del login comparten `view-transition-name: dream-orb`. En escritorio es la mascota del panel azul; en móvil, la pegatina de arriba. Nunca las dos a la vez.
- El navegador mueve la imagen del orbe durante 280 ms con `--ease` (ease-out fuerte). El resto de la página hace un fundido de 200 ms.
- Si el login tarda más de 600 ms, se salta la animación para no congelar la pantalla.
- Sin View Transitions, o con movimiento reducido, el enlace navega normal y el login hace su entrada (con movimiento reducido, solo un fundido).

## Evidencia

- `antes/`: login a 390 y 1280 px, claro y oscuro, y con movimiento reducido.
- `despues/`: lo mismo, más el estado de error.
- `landing-login-movil.webm` y `landing-login-escritorio.webm`: el recorrido completo (clic en «Probar Dream», el viaje, la entrada, el fallo de Google y el error).
- `*-lento.webm`: el mismo recorrido al 25 % de velocidad.
- `tira-transicion*.webp`: fotogramas del viaje del orbe.

## Qué no se ha podido comprobar

- Safari (la versión con View Transitions entre documentos de la misma página) y Firefox: solo Chromium. En los navegadores sin la API se navega sin transición, como antes.
- El inicio de sesión real con Google: se mantiene igual, sin tocar.
