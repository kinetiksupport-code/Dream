# Actividad de sintagmas

Encargo «sintagmas» del 20/10/2026. Solo ordenador (decisión de Carlos). Servidor simulado en las pruebas; `dream-api` y la migración no se despliegan sin su permiso.

## Auditoría previa

| Archivo | Qué había | Qué falta | Qué cambia |
|---|---|---|---|
| `lib/widgets.ts` | Señal `<!--DREAM_ACTION:TEST-->` | Señal para la actividad | `requestSyntax` y se quita `<!--DREAM_ACTION:SINTAGMAS-->` del texto |
| `components/message.tsx` | Tarjeta del test con «Empezar» | Tarjeta de la actividad | `components/sintagmas/syntax-card.tsx`, mismo estilo (`quiz-widget`); en móvil, el aviso de solo ordenador |
| `supabase/functions/dream-api/prompts.mjs` | Sección 15 «Test solicitado» | Cuándo mandar a la actividad | Sección 15b y una línea en el contexto dinámico. La guía de sintagmas (`SYNTAX_GUIDE`, ~600 tokens) va solo en las llamadas de la actividad |
| `lib/navigation.ts` | Pantalla completa para tests y asistente | La actividad | `/sintagmas` es ruta de foco: sin menú |
| `app/(dream)/more/page.tsx` | Apuntes, Exámenes, Historial | Acceso directo | Fila «Sintagmas» |
| `app/(dream)/settings/page.tsx` | — | Reactivar el tutorial | Sección «Sintagmas › Tutorial al empezar» (solo si `dream-api` tiene la actividad) |
| Pantalla de Tests/Repaso | No existe: los tests se abren desde el chat o desde un examen | — | El acceso directo va en «Más». Ver «Qué no se ha podido hacer» |

## Flujo

1. **Chat**: «quiero repasar sintagmas» → la IA responde una frase y la señal; sale la tarjeta «Repasa los sintagmas · Empezar».
2. **Tutorial** (cada vez, salvo «No volverme a mostrar este tutorial»): demo en bucle con «El perro de mi vecino ladra», 3 pasos y el de anidar, ejemplo resuelto, «Entendido». Se guarda en la cuenta (`dream_syntax_settings.tutorial_hidden`) con respaldo en `localStorage`. «?» arriba a la derecha y Ajustes lo vuelven a mostrar.
3. **Apuntes** (si aún no hay convenciones del profesor): «¿Tienes apuntes o deberes antiguos de sintagmas?», «Cuantos más haya mejor», subir y «Saltar».
4. **Frase**: arrastrar sobre las palabras (o doble clic) dibuja la raya; al soltar salen las etiquetas junto a ella. Deshacer, Rehacer, Pista y Comprobar abajo.
5. **Comprobar**: cada raya con ✓ o ✗, lo que faltaba con línea discontinua, una explicación corta y «Siguiente frase».
6. **Fase avanzada** (80 % en las últimas 5): campo de texto ya enfocado, autocompletado y «Ver opciones».
7. **Resumen** tras 8 frases: qué dominas, qué repasar, «Repetir» y «Volver al chat».

## Capturas

- `antes/`: el chat con la señal (hoy no sale nada), «Más» y Ajustes, a 390 y 1280 px, en claro y oscuro. Sacadas de la versión publicada (5b889ef).
- `despues/`: los mismos encuadres más el flujo completo de la actividad (tutorial, apuntes, arrastrar, etiquetas, cruce, pista, perfecto, corrección, escribir, cambio de fase, resumen y aviso en móvil). La actividad es nueva y solo de ordenador; en móvil se ve el aviso.
- Movimiento reducido: `sintagmas-tutorial-escritorio-oscuro-reducido.webp` (la demo, quieta y resuelta).
- Grabación de las microinteracciones: `sintagmas-microinteracciones.webm`.

## Qué no se ha podido comprobar

- **El porcentaje del conjunto de pruebas** (`evals/sintagmas.json`): aquí no hay clave de Groq. Se mide con `GROQ_API_KEY=… node scripts/eval-sintagmas.mjs`.
- **Las acciones `syntax_*` contra Supabase real**: la migración se ha probado en un Postgres 16 local (tablas, RLS, revocaciones y borrado en cascada), no en el proyecto.
- **Lectores de pantalla reales** (VoiceOver, NVDA): solo el árbol de accesibilidad de Chromium y el teclado en Playwright.
- **La prueba con alguien que no conozca la actividad** que pide el encargo: la tiene que hacer el equipo.
- **El QR** para subir apuntes desde el móvil: el de hoy está atado a un examen (`dream_upload_sessions.exam_id`). Aquí solo se sube desde el ordenador.
