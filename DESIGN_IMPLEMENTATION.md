# Implementación de las exportaciones Dream

Fuente visual: `DREAM DESIGN.zip`, 45 PNG exportados. Se revisaron pantallas completas, foundations, galería, variantes y componentes antes de editar. No hay enlace de documento Figma ni SVG del Orb: se usa el PNG original de 64×64, sin redibujarlo. Las capturas de pantallas no se utilizan como UI.

## Mapa sobre el proyecto existente

| Referencia | Implementación existente |
| --- | --- |
| Foundations | `app/globals.css` (tokens); Inter en `app/layout.tsx` |
| DreamOrb / DreamStatus | `components/dream-mark.tsx` |
| Home vacía, 375, 430, tablet, desktop, dark | Home del `/chat` existente; `components/chat-home.tsx` |
| QuickAction | Acciones de Home conectadas al composer existente |
| Composer / Attachment / FileCard | `components/composer.tsx`, adjuntos reutilizables y CTA de análisis con el envío existente |
| TopBar / Sidebar / BottomSheet / NavigationItem | `components/shell.tsx`; bottom sheet móvil sobre la navegación existente |
| Historial/recientes | Vista por query de `/chat`, conversaciones de la API existente, sin ruta nueva |
| MessageUser / MessageDream y conversación normal/dark | `components/message.tsx`, extraído de la vista de mensaje existente |
| Respuestas educativa/matemática / MathBlock | Renderer seguro existente y KaTeX, fórmulas azules/lima; el contenido sigue viniendo de IA |
| Test / TestCard / AnswerOption / feedback / resultado | `components/test-experience.tsx`, mismo motor y API |
| Ajustes | Ruta existente; preferencias reales y cuenta, sin copiar rol/nivel de ejemplo |
| Progreso | Ruta existente; estado vacío honesto sin cifras de ejemplo |
| Toast / error | Componente accesible compartido para estados reales |

## Adaptaciones necesarias

- Los exports móviles incluyen barra de estado iOS y home indicator. Pertenecen al sistema operativo; no se dibujan como contenido web. Se preservan safe areas y standalone.
- La fuente del Foundations es Inter; se cambia la familia visual, no los datos ni APIs.
- No existe endpoint personal de métricas o listado de tests. Se conserva el estado vacío de progreso y se accede a tests por conversaciones/widgets reales.
- No se añaden likes persistidos ni acciones de guardar ficticias: copiar y continuar por pasos usan la lógica disponible.
- Reintentar tras streaming interrumpido recupera el historial sin duplicar el prompt. No se inventa regeneración idempotente.
- No hay funciones docentes/onboarding en este checkout. No se crean ni eliminan funciones ausentes.
- Los ejemplos de preguntas, documentos, tiempos y notas solo se usan en tests aislados de interfaz, nunca como datos de producción.

## Segundo pase visual y verificación

Se compararon capturas reales del navegador contra las exportaciones. Se corrigieron el tracking del hero, la altura de las acciones móviles, la alineación de la composición desktop, la distribución tablet, el tamaño de fórmulas, los estados de AnswerOption y la cabecera de resultados. La Home ya no se desplaza automáticamente al fondo cuando falta altura: solo las conversaciones siguen el streaming.

El Orb original adjunto tiene 64×64 píxeles. Se conserva ese asset exacto; al presentarlo a 152 px en desktop su definición queda limitada por el archivo suministrado. Un futuro SVG podrá sustituirlo sin cambiar componentes.

Las pantallas de práctica conservan comprobar respuesta y entregar al servidor; sus controles se adaptan al contrato real aunque el frame estático muestre únicamente Siguiente. Los resultados incluyen porcentaje real en lugar del tiempo ficticio del ejemplo. Progreso y la zona personal de Home no muestran horas, niveles o estadísticas inexistentes.

El botón Analizar archivo reutiliza el envío existente y los IDs reales de adjuntos. El bottom sheet contiene foco, cierra con Escape/tap exterior y devuelve el foco al control de apertura. Markdown mantiene KaTeX real, HTML desactivado y fuentes enlazadas; los pasos numerados reciben el tratamiento editorial azul/lima sin generar una lección artificial.

Verificación en Chromium sobre build de producción: nueve tamaños, claro/oscuro, Home, ajustes y conversación larga, además de tests, resultado, adjuntos, errores recuperables, actividad de búsqueda/escritura, fórmulas y navegación. Las fixtures solo viven en tests. No se afirma equivalencia de píxel para contenido dinámico de IA ni para barras del sistema operativo.
