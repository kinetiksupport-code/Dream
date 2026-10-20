# Landing con scroll cinematográfico (entrega 4)

Encargo «landing, login y bienvenida» del 20/10/2026, apartado 2. Guion: [`docs/diseno/landing-storyboard.md`](../landing-storyboard.md).

## Auditoría previa

| Archivo | Qué había | Qué faltaba | Qué cambia |
|---|---|---|---|
| `app/page.tsx` | Fondo blanco, orbe pequeño, «No es magia. Es tu mente amplificada.», cuatro tarjetas grises y «Dream es gratis.» | El estilo de Dream (fondos saturados, titulares enormes, pegatinas, objetos 3D, orbe mascota) y una historia | Seis escenas con fondo propio, un solo `h1` y un `h2` por escena |
| `app/landing.module.css` | Estilos sobrios, sin movimiento salvo `.rise` | Movimiento ligado al scroll, versión estática | Reescrito: escenas, movimiento con `animation-timeline` dentro de `@supports`, móvil apilado, movimiento reducido |

## Herramienta elegida

**CSS scroll-driven animations** (`animation-timeline: view()` y `view-timeline-name`), dentro de `@supports (animation-timeline: view())` y `@media (prefers-reduced-motion: no-preference)`.
- **Sin paquetes:** no hay nada instalado para esto y no hace falta instalar nada.
- **Sin JavaScript ni secuestro del scroll:** el reloj es el propio scroll del navegador.
- **Sin soporte** (Safari y Firefox que no lo tengan): la página se ve completa y quieta.
- **La página sigue siendo componente de servidor:** la única isla cliente es `OrbLink`, el enlace al login de la entrega 3.

## Evidencia

- **`antes/`:** la landing de hoy, a 390 y 1280 px, en claro y oscuro, y con movimiento reducido.
- **`despues/`:** las mismas variantes.
  - Ojo: en una captura de página completa, las escenas que dependen del scroll salen en su estado inicial. El estado real está en la tira y los vídeos.
  - La captura con movimiento reducido es la versión estática completa.
- **`tira-escritorio.webp` y `tira-movil.webp`:** 16 fotogramas bajando la página, incluido el momento firma fijado en escritorio.
- **`landing-scroll-*.webm`:** el scroll completo en vídeo.
- **Rendimiento:** Lighthouse **no** está instalado en el proyecto, y para instalarlo hace falta el OK de Carlos. En su lugar he medido con Chromium (Playwright), con red «Slow 4G» (150 ms y 1,6 Mbps), CPU ×4, sin caché y a 390 px (`PerformanceObserver`). Tres pasadas:

  | | LCP | FCP | CLS | Bytes |
  |---|---|---|---|---|
  | Antes | 780–788 ms | 780–788 ms | 0 | 344 KB |
  | Después | 1.076–1.112 ms | 852–900 ms | 0 | 384 KB |

  La medida es en local, no desde Vercel.

## Qué no se ha podido comprobar

- **Lighthouse:** pendiente del OK para instalarlo. El comando sería `npx lighthouse@12 <url> --preset=perf --form-factor=mobile` (unos 40 MB, y no se añade al proyecto).
- **Safari y Firefox reales:** solo Chromium. Sin la API se ve la versión estática.
- **Un iPhone físico y la batería.**
- **El verificador de la skill** (`verify-build.mjs`): no viene en esta instalación de `cinematic-scroll`, que solo trae `SKILL.md`. Las mismas comprobaciones están en `tests/browser/landing.spec.ts`:
  - escritorio, móvil y movimiento reducido;
  - sin desplazamiento lateral;
  - teclado;
  - momento firma fijado solo en escritorio;
  - número final.
- **Las fotos de referencia** (`/mnt/project-files/dream/referencias-estilo/`): no están en este entorno.
