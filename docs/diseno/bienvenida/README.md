# Bienvenida para usuarios nuevos (entrega 1)

Encargo «landing, login y bienvenida» del 20/10/2026, apartados 4.2 y 4.3. Solo interfaz, con el servidor simulado en las pruebas.

## Auditoría previa

| Archivo | Qué había | Qué falta | Qué cambia |
|---|---|---|---|
| `components/welcome-consent.tsx` | «Antes de empezar»: fecha de nacimiento, casilla del tutor (menores de 14) y casilla de IA, en una sola pantalla sobre `--bg` | Nombre, aficiones, apodo, rueda de fecha, pantalla de IA propia, casilla de Términos, pantalla de menores y recompensa | Se borra. La sustituye `components/welcome/welcome-flow.tsx` |
| `lib/consent.ts` | `needsConsent`, casilla del tutor, `GUARDIAN_AGE = 14` | Edad mínima sin tutor, versión de los Términos, casilla de Términos | `consentGate` («off», «welcome», «consent»), `MIN_AGE`, `TERMS_VERSION`, `CONSENT_TEXT.terms`. El texto de la casilla de IA no cambia |
| `components/shell.tsx` | La puerta tapaba todo menos Ajustes | Que la bienvenida tape también Ajustes | Usuario nuevo: solo la bienvenida, con «Salir». Permiso retirado: solo el paso de IA, y Ajustes sigue abierto |
| `lib/dream-api.ts` | `saveConsent` con tutor | Acciones de la bienvenida | `saveOnboarding`, `checkAge`, `saveConsent` y `withdrawConsent` (servidor diseñado en la entrega 2) |
| `app/(dream)/settings/page.tsx` | Perfil de solo lectura | Cambiar nombre, apodo y aficiones; retirar el permiso | `components/welcome/profile-settings.tsx`, visible solo cuando el servidor manda los campos |

## Flujo

1. **Hola**: el orbe en su pegatina saluda. «Empezar».
2. **¿Cómo te llamas?**: el nombre de Google, editable, de 1 a 40 letras.
3. **¿Qué te gusta?**: 14 chips con icono y «Añadir otra» (30 letras). Hasta 8. Sin elegir, el botón dice «Saltar».
4. **¿Cómo quieres que te llame la IA?**: sugerencias (nombre, primer nombre, diminutivo conocido) y campo libre de 20 letras. Vacío = primer nombre.
5. **¿Cuántos años tienes?**: ruedas de día, mes y año. Hay que moverlas (si no, «Mueve las ruedas hasta tu fecha de nacimiento»). «Escribir la fecha» abre un campo de fecha nativo.
6. **Vas a hablar con una IA**: aviso y dos casillas sin marcar. Sin las dos no se sigue; el foco va a la primera que falta.
7. **¡Listo, {apodo}!**: la pegatina cae y salen chispas. «Ir a Dream».

Menores de 14: «Dream es para mayores de 14 años. ¡Te esperamos!» y «Salir». El servidor borra nombre, aficiones y apodo, y no guarda la fecha.

El avance se guarda en el servidor después de cada paso, nunca en el navegador (la regla de CLAUDE.md lo prohíbe). La fecha no se guarda hasta el consentimiento, así que al recargar en el paso 5 se vuelve a preguntar.

Mientras `dream-api` no mande los campos nuevos, la bienvenida no aparece y nadie se queda bloqueado.

## Capturas

`docs/diseno/bienvenida/antes/` (pantalla «Antes de empezar» de hoy) y `docs/diseno/bienvenida/despues/`, a 390 y 1280 px, en claro y en oscuro, y una pasada con movimiento reducido. Grabación del flujo completo en `docs/diseno/bienvenida/bienvenida-movil.webm`.

## Qué no se ha podido comprobar

- VoiceOver y TalkBack reales: solo el árbol de accesibilidad de Chromium y el teclado en las pruebas de Playwright.
- La vibración de 8 ms de las ruedas, en un móvil Android real.
- El flujo con el servidor real: las acciones se diseñan en la entrega 2 y no están desplegadas.
- Las fotos de `/mnt/project-files/dream/referencias-estilo/` no están en este entorno. El estilo sale de los tokens y componentes que ya hay (`Orb`, `Sticker`, `button-3d`, `hero-title`, `marker`).
