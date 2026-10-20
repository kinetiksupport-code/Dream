# Landing de Dream: storyboard de movimiento

Encargo «landing, login y bienvenida» del 20/10/2026, apartado 2. Skill `cinematic-scroll`: primero el guion, después el código.

## Dirección

- **Quién la ve:** alumnos de ESO y Bachillerato (y sus familias) que llegan desde un enlace. **Acción:** «Probar Dream» (entrar con Google).
- **Marca:** el estilo de la app, no uno nuevo. Fondos saturados y planos por sección (tokens `--pop-*`), titulares enormes en cursiva con una palabra subrayada a mano (`.hero-title`, `.marker`), pegatinas (`Sticker`), objetos 3D brillantes (Fluent Emoji 3D de `public/subjects/`) y el orbe como mascota.
- **Momento firma:** **la foto de tus apuntes se convierte en un examen**. Es lo que explica Dream mejor que cualquier frase: subes una foto desde el móvil y sale una ruta de estudio. En escritorio, la escena se fija mientras la hoja sale del móvil y se convierte en una tarjeta de examen. En móvil se ve el resultado, sin fijar nada.
- **Arco:** orientación (héroe) → descubrimiento (apuntes y chat) → prueba (tests y progreso) → acción (gratis).
- **Herramienta:** CSS scroll-driven animations (`animation-timeline: view()`), con `@supports`. No hay librerías instaladas para esto y no hace falta ninguna: el reloj del scroll lo pone el navegador, sin JavaScript. Sin soporte (Safari y Firefox antiguos), todo se ve en su sitio y quieto. No se secuestra el scroll.

## Escenas

Cada escena: **inicio → transformación → pausa legible → salida**, con su versión en móvil y la de movimiento reducido.

| # | Escena | Fondo | Qué entra y cuándo (scroll) | Se fija | Móvil | Reducido |
|---|---|---|---|---|---|---|
| 1 | **Héroe**: «Saca tu mejor *nota*.», el orbe en su pegatina amarilla respirando, «Probar Dream» (`button-3d`), «Gratis. Entra con Google.» | Azul eléctrico con cuadrícula | Al cargar: pegatina, titular, texto y botón suben en escalera (40 ms). Al salir (0–100 % de la salida), la pegatina encoge a 0,85 y el titular sube 40 px y se funde un poco. El orbe es el mismo que viaja al login (`dream-orb`). | No | Igual, más compacto | Sin escalera ni salida, todo visible |
| 2 | **Sube tus apuntes** (momento firma): un móvil con la foto de unos apuntes; la hoja sale del móvil y se convierte en una tarjeta «Examen de Biología · 4 temas · ruta lista». Pegatina «Desde el móvil con QR». | Morado | Escritorio: la sección mide 180 vh y el escenario es `sticky`. Del 0 al 35 % la hoja sale del móvil; del 35 al 65 % gira y se convierte en la tarjeta; del 65 al 100 % se queda quieta (pausa legible). | Escritorio, 180 vh (unos 0,8 pantallas de recorrido) | Sin fijar: el móvil y la tarjeta apilados, cada uno se revela al entrar | Sin fijar, apilados, quietos |
| 3 | **Entiende, no copies**: el chat que da pistas. Alumno: «¿Me haces el ejercicio 4?». Dream: «No te lo resuelvo, pero te doy una pista…». Alumno: «¡Ah! x = 3». Dream: «Eso es. ¿Probamos otro?». Pegatina «Sin atajos». | Fondo de la app (`--bg`) | Cada burbuja entra al llegar a la vista (`entry 10 %–45 %`), desde su lado, con fundido | No | Igual | Burbujas visibles, sin desplazamiento |
| 4 | **Tests y simulacros**: tres tarjetas de pregunta que se barajan con el scroll y la ruedecita de la nota girando hasta un 8,5. | Naranja | Mientras la sección cruza la pantalla (`cover`), las tarjetas pasan de apiladas a abanico, y la rueda gira 0 → 300° y se para en 8,5 | No | Abanico más corto | Tarjetas en abanico fijo, rueda quieta |
| 5 | **Tu progreso**: número animado (0 → 82 %) y barra de avance, con el objeto 3D del birrete. Rótulo «Ejemplo» para no prometer datos reales. | Verde | Al entrar (`entry`–`contain 30 %`), el número cuenta con `@property` y la barra crece (`scaleX`) | No | Igual | Número final y barra llena, sin animar |
| 6 | **Gratis**: «Dream es *gratis*.» y el botón final. | Amarillo | La pegatina del orbe cae a su sitio al entrar | No | Igual | Visible |
| 7 | **Pie**: enlaces legales actuales (Privacidad, Términos, Cookies, Aviso legal). | Fondo de la app | — | — | — | — |

## Reglas técnicas

- **Solo `transform` y `opacity`**, y la cuenta del número, que es texto generado con `counter()` sobre una propiedad registrada: no mueve nada de sitio.
- **Componente de servidor:** la landing no envía JavaScript propio salvo `OrbLink` (la transición al login, entrega 3).
- **Imágenes:** iconos 3D WebP de tamaño fijo, con carga diferida por debajo del héroe. No hay 3D en tiempo real: el momento firma no lo necesita (cinematic-scroll: «earn the renderer tier»). Así el móvil y el escritorio enseñan lo mismo.
- **Accesibilidad:** un solo `h1`; `h2` por escena; textos reales (las burbujas y la tarjeta son texto, no imagen); contraste AA (`contrast.mjs`); todo usable con teclado; las decoraciones con `aria-hidden`.
- **Sin analítica ni cookies nuevas.**
