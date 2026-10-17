# Dream: normas para sesiones de Claude Code

Dream es una web/PWA educativa en español para estudiantes (PAU/ESO). Next.js 15, React 19, Tailwind 4, Supabase (Edge Function `dream-api`).

## Antes de cualquier cambio de interfaz

1. Carga y lee enteras, con la herramienta Skill:
   - `anthropic-skills:emil-design-eng`: movimiento y detalles.
   - `anthropic-skills:apple-design`: accesibilidad, color, tipografía, navegación y estados. Lee las referencias que la propia skill indica.
   - `anthropic-skills:libraries-dev`: `thinking-orbs`, `border-beam` y `voice-glow`. Antes de instalar un paquete, enseña el comando y espera el OK de Carlos.
2. Lee `DISENO_AUDITORIA.md` y `DISENO_EVIDENCIA.md`. Las reglas concretas que se aplican están ahí.
3. Manda el diseño de Claude Design: el canvas «Dream – Sistema de diseño y pantallas». Si algo se aparta de él, se corrige o se anota en la auditoría con el motivo.

## Reglas que no se negocian

- **Nada está terminado sin evidencia.** Hacen falta capturas antes y después, en móvil y escritorio, claro y oscuro (`CAPTURAS_DIR=… npx playwright test tests/browser/capturas.spec.ts`), y una grabación de las microinteracciones. Si algo no se puede comprobar, se dice. No se inventa.
- **`npm run design:check` y `npm run test` en verde.** Las pruebas de navegador `tests/browser/design.spec.ts` deben pasar.
- **Movimiento:**
  - Solo se animan `transform` y `opacity`.
  - Las duraciones de la interfaz van entre 120 y 250 ms, y ninguna pasa de 400 ms, salvo los indicadores en bucle.
  - Entradas con `ease-out`. Nunca `ease-in` para algo que aparece, ni `scale(0)`.
  - Hover solo con `@media (hover: hover) and (pointer: fine)`.
  - `prefers-reduced-motion` quita el desplazamiento y deja solo fundidos.
- **Accesibilidad:**
  - Foco visible en todo lo interactivo.
  - Contraste AA: `node scripts/design/contrast.mjs`.
  - Áreas táctiles de 44 px.
  - Nunca información solo por color.
- **Interfaz en español**, con tildes y signos de apertura. Frases cortas.
- **Reglas de producto:**
  - Dream nunca da el ejercicio resuelto.
  - Sin modo foco.
  - Sin banco oficial de exámenes.
  - Sin duelos ni estado de ánimo.
- **Sin OK de Carlos no se hace:**
  - Desplegar `dream-api`.
  - Aplicar migraciones.
  - Cambiar la configuración de Supabase o Vercel.
- **Ninguna clave en el código.** No se guarda contenido personal en localStorage, CacheStorage ni el service worker.
- **Ramas y PRs:** PRs borrador pequeños, uno por pantalla, con la checklist de `.github/pull_request_template.md`. Nunca se empuja a `main` ni a `feature/dream-ui-pwa`.
