## Qué cambia

<!-- Frases cortas, en español. Una pantalla por PR. -->

## Checklist de diseño (CLAUDE.md)

- [ ] He leído las skills `emil-design-eng`, `apple-design` y `libraries-dev` antes de tocar la interfaz.
- [ ] `DISENO_AUDITORIA.md` está actualizada: problemas resueltos y nuevos.
- [ ] Capturas antes y después (móvil y escritorio, claro y oscuro) en `docs/diseno/` y en `DISENO_EVIDENCIA.md`.
- [ ] Grabación corta de las microinteracciones (o explicación de por qué no se pudo).
- [ ] `prefers-reduced-motion`: el movimiento se quita y quedan solo fundidos (`npm run design:check:browser`).
- [ ] Contraste AA en claro y oscuro (`node scripts/design/contrast.mjs`).
- [ ] Móvil: 360, 390 y 430 px y en horizontal, sin desplazamiento lateral y con áreas táctiles de 44 px.
- [ ] Textos en español revisados (tildes y signos).

## Comprobaciones

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test` (incluye `design:check`)
- [ ] `npm run build`
- [ ] Playwright (`npm run test:browser`)

## Preguntas para Carlos
