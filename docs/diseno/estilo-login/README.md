# Login y registro con el estilo nuevo (PR 9 del encargo de estilo)

Encargo: `PROMPT_EXAMEN_ESTILO.md`, apartados 2, 6 y 10, más las decisiones de Carlos del 17/10:
- Titulares en la cursiva pesada de Inter 800, solo con `.hero-title`.
- Amarillo `#FFC21A` siempre con texto oscuro.
- Fondos saturados solo en las pantallas clave.
- Legible en todas partes.

Base: `design/asistente-examen` (PR #35).

## Decisión: el login es pantalla clave; el registro, no

- **Login (`/login`).** Es lo primero que ve un estudiante, así que lleva el **azul saturado** (`--pop-blue`, con cuadrícula):
  - **en escritorio**, en el panel de marca;
  - **en móvil**, en toda la pantalla.

  La mascota es el Orb sobre una pegatina redonda amarilla. **El botón de Google no cambia:** mismo aspecto, mismos estados (reposo, hover, pulsado, foco, cargando y desactivado) y mismo comportamiento.
- **Registro (la bienvenida con la fecha de nacimiento y el consentimiento).** Tiene texto legal que hay que leer bien, así que **sigue sobrio, sobre `--bg`**. Lleva la mascota, el titular y el botón 3D. **Los textos de consentimiento, las casillas y los enlaces no cambian.**

**No cambia ningún texto ni comportamiento.**

## Antes | Después | Por qué

| Antes | Después | Por qué |
|---|---|---|
| Panel de marca en `--surface`, gris claro | `.pop.tone-blue.pop-grid`: azul `#1E40D8` con cuadrícula fina y texto blanco (7,55:1). En oscuro, `#1A37B8` (9,20:1) | §2 «color muy saturado de fondo por pantalla» en una pantalla clave |
| «Entiende lo que estudias.» con `.display` | `.hero-title` (Inter 800 cursiva) con «estudias» subrayada a mano en amarillo; el trazo se dibuja una vez | Decisión de Carlos y §2 «palabra clave subrayada». El texto es el mismo |
| Sin mascota en escritorio; Orb de 56 px en móvil | El Orb, que respira (`breathing`), sobre una pegatina redonda amarilla con borde blanco, girada −6°. Entra con `.pop-in`, desde 0,9 y nunca desde 0 | §2 «el orbe es la mascota» y foto 2 de referencia, «mascota en una pegatina redonda». La forma y los colores del Orb no cambian. Es decorativa (`aria-hidden`) |
| Móvil: fondo blanco | Móvil: toda la pantalla en azul `--pop-blue`. Los textos, los enlaces legales y «Volver al inicio» van en `--on-pop-blue`, con subrayado. El anillo de foco usa el color del texto | Pantalla clave también en el móvil, que es donde más se usa. Los enlaces se distinguen por el subrayado, no solo por el color (`accessibility.md › Convey information with more than color alone`) |
| «Entrar en Dream» de 32 px | `.hero-title` a un tamaño menor (36–44 px) | El titular grande es el del panel azul: un solo foco (apple-design › *Is the boldness spent in one place?*) |
| Todo aparece de golpe | La mascota, el titular, el texto legal y «Volver al inicio» suben 8 px, 40 ms entre cada uno. El botón de Google y los mensajes no se animan | emil-design-eng › *Stagger*, que nunca bloquea. Animo con `backwards` para que `.press` siga escalando el botón a 0,97 |
| Registro: Orb de 48 px y «Antes de empezar» de 32 px | Mascota en pegatina amarilla de 88 px y `.hero-title` (36–44 px) | Mismo lenguaje visual que el login, sin cambiar el formulario |
| Registro: «Empezar» con `.primary` | `.button-3d` (cara azul que baja 3 px al pulsar, `--dur-fast`). El hover con puntero fino aclara la cara | §2 «botones 3D» y emil-design-eng › *Buttons must feel responsive*. Mantiene `type="submit"`, `aria-busy`, «Guardando…» y 52 px de alto |
| Registro: el formulario aparece de golpe | La mascota, el titular y los campos entran escalonados (40 ms) | ídem |
| Movimiento reducido | Todo funde (120 ms) y nada se desplaza. El Orb no respira. El anillo de carga de Google ya «respiraba» en vez de girar | `motion.md › Make motion optional` |

## Archivos

- `app/login/page.tsx`: las clases `.pop` del panel, la mascota, el subrayado y `.hero-title`. La función `login()`, el botón de Google y los mensajes no cambian.
- `app/login/login.module.css`: el panel azul, el azul en móvil y la entrada escalonada.
- `components/welcome-consent.tsx` y `components/welcome-consent.module.css`: la mascota, el titular, `.button-3d` y la entrada. **Los textos de `lib/consent.ts` no se tocan.**
- **No se toca `app/globals.css` ni se añaden tokens.**
- `tests/browser/login-estilo.spec.ts` (nuevo): comprueba
  - el panel azul con texto blanco;
  - la mascota decorativa;
  - la cursiva;
  - el móvil entero en azul con los enlaces en blanco;
  - que el botón de Google no se anima;
  - el botón 3D;
  - que con movimiento reducido nada se mueve.
- `tests/browser/login-capturas.spec.ts` y `tests/browser/full-shot.ts`: capturas y grabaciones (solo con `CAPTURAS_DIR` o `GRABAR`).

## Evidencia

- **Antes y después** (`antes/` y `despues/`), en móvil (390 px) y escritorio (1280 px), claro y oscuro:
  - `login`;
  - `login-error`;
  - `login-registro`;
  - `login-registro-mayor`;
  - `login-registro-menor`;
  - `login-registro-error`.
- **Movimiento reducido:** `despues/login-reducido-60ms-movil-claro.webp` es una captura a los 60 ms de cargar, con todo ya en su sitio.
- **Grabaciones** en `../grabaciones/`:
  - `estilo-login-escritorio.webm` y `estilo-login-movil.webm`: la entrada, el hover y la pulsación del botón de Google;
  - `estilo-login-escritorio-registro.webm` y `estilo-login-movil-registro.webm`: el registro.

## Comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | sin errores |
| lint (`--max-warnings 0`) | 0 errores, 0 avisos |
| `npm test` | 215 de 215 |
| `npm run design:check` | 13 de 13 y 66 pares de contraste AA |
| `npx next build` | correcto |
| Playwright: `login-registro`, `login-google`, `login-estilo`, `design`, `security`, `navegacion` | 80 de 80 |
| Playwright: `dream.spec.ts -g login` (redirección al login) | 1 de 1 |

**Tamaño:**
- `/login` pasa de 3,28 kB a 4,01 kB (primera carga de 173 kB a 174 kB) por `<Sticker>`.
- El registro va dentro del Shell. Por eso algunas rutas con Shell suben 1 kB en primera carga: `/exams/[id]/sessions/[sessionId]` (194 → 195 kB), `/exams/[id]/study/[unitId]` (217 → 218 kB) y `/tests/[id]` (186 → 187 kB).
- El JS compartido no cambia (108 kB).

**No comprobado:** un móvil real, un lector de pantalla real y el inicio de sesión real con Google. Las pruebas cortan la llamada a Supabase.
