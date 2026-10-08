# Exámenes persistentes de Dream

La rama `feature/exams-persistent` parte de `feature/landing-login-examenes` (`161781a`), revisada antes de integrar. Conserva su landing y login. El índice de exámenes local que contenía esa rama no tenía una UI conectada: se sustituye por operaciones autenticadas de `dream-api`, sin memoria académica en localStorage.

## Rutas y componentes

| Referencias Figma | Ruta | Implementación |
| --- | --- | --- |
| Mis exámenes | `/exams` | `exam-index.tsx` |
| Datos, Materiales, Revisar, Preparación | `/exams/new?id=…` | `exam-wizard.tsx` |
| Detalle del examen | `/exams/[id]` | `exam-detail.tsx` |
| Plan de estudio | `/exams/[id]/plan` | `exam-detail.tsx` |
| Estudiar | `/exams/[id]/study/[unitId]` | `exam-study.tsx`, chat existente extraído a `chat-experience.tsx` |
| Simulacro, entrega, resultados, repaso | `/exams/[id]/sessions/[sessionId]` | `exam-session.tsx`, controles de respuesta existentes |
| Patrones, TopBar | Navegación y controles comunes | `shell.tsx`, `exam-ui.tsx`, `exams.module.css` |

Se estudiaron las 30 exportaciones adjuntas, incluidas sus variantes móvil y desktop. Los ejemplos de ecuaciones, notas, porcentajes, materiales y fechas no se convierten en datos de producción. El Orb existente sigue siendo el asset gráfico original; ninguna captura se usa como interfaz.

## Persistencia y backend

Se añadieron `dream_exams`, `dream_exam_materials`, `dream_exam_units` y `dream_exam_sessions`. Todas tienen RLS de lectura del propietario. Los clientes no pueden escribir directamente ni modificar resultados: `dream-api` verifica el JWT, la identidad y las asociaciones antes de mutar. Las unidades y sus conversaciones se conservan para retomar el estudio. Los materiales usan los adjuntos ya procesados por el backend, sin OCR ni extracción de documentos en el navegador.

Las migraciones aplicadas se registran en `supabase/migrations` con las versiones reales del historial remoto:

- `20261008161950_persistent_exams`: tablas, políticas, índices, almacenamiento atómico de planes.
- `20261008163525_exam_generation_recovery`: generación de simulacros recuperable y asociación de materiales con límite atómico de cuatro.

El código de la función v3 original se recuperó del proyecto real. Se conserva en `supabase/functions/dream-api`; el módulo nuevo `exams.ts` añade operaciones y `validation.ts` validación acotada. Los módulos de modelo/proveedor, prompts educativos, skills, búsqueda y extracción permanecen iguales. `index.ts` conecta las nuevas operaciones, añade el contexto de estudio verificado en servidor, reutiliza generación y corrección existentes y bloquea la entrega de simulacros por el endpoint genérico para que no se pierda su sesión.

`dream-api` v5 está desplegada con `verify_jwt: true`. No se creó otro proyecto, proveedor, modelo, memoria educativa ni canal directo desde el navegador a Groq.

### Seguridad de las preguntas

La revisión encontró que RLS anterior permitía a un propietario leer las columnas privadas de `dream_test_questions` por REST. Se revocó la lectura general y se concedió solo la de `id`, `test_id`, `position`, `type`, `prompt`, `options` y `metadata`. Las claves, rúbricas y explicaciones permanecen accesibles únicamente en servidor hasta la corrección. Las opciones de emparejamiento dejan de tener un orden inverso determinista. Una respuesta numérica vacía no equivale a cero.

### Operaciones

`exams`, `exam_create`, `exam_get`, `exam_update`, `exam_rhythm`, `exam_upload_start`, `exam_material_add`, `exam_material_remove`, `exam_prepare`, `exam_unit_start`, `exam_unit_complete`, `exam_complete`, `exam_session_create`, `exam_session_get`, `exam_session_save`, `exam_session_submit`.

Todas pasan por `lib/dream-api.ts`. No hay un segundo cliente de datos privilegiado en el frontend.

- Crear un borrador usa un UUID estable para recuperar una petición interrumpida.
- La preparación usa temas, dificultades, objetivos y texto real de materiales para pedir un plan al proveedor existente. No se fabrica porcentaje de análisis.
- El avance del plan cuenta unidades que el usuario marca como completadas. No representa dominio ni capacidad.
- Las estimaciones de minutos se identifican como estimaciones de Dream.
- Una sesión reclama su generación antes de llamar a IA; las solicitudes concurrentes no generan otros simulacros con el mismo ID. La generación fallida puede retomarse; una operación interrumpida puede reintentarse después de cinco minutos.
- Las respuestas y el cursor se guardan en servidor con revisión optimista. El autosave usa una cola y un debounce de 650 ms; indica cambios sin guardar si falla. Antes de avanzar o entregar se espera la confirmación del servidor.
- El límite opcional se calcula desde `started_at` del servidor; no admite cambios de respuestas después del vencimiento. Las preguntas sin contestar se entregan como vacías, con aviso explícito.
- El modo práctica usa `test_check_answer`. El modo examen conserva las claves ocultas hasta entregar.
- La entrega reclama una corrección, usa las respuestas guardadas y almacena el resultado. Un reintento devuelve el resultado persistido; si la corrección acabó pero se interrumpió el guardado de sesión, recupera el intento existente sin generar otro.
- Un intento con respuestas de corrección incompletas se presenta como un error recuperable por soporte, sin inventar nota ni duplicar la entrega.

## Límites reales

La función de adjuntos existente conserva texto extraído y metadatos, pero no proporciona un enlace para descargar el archivo original. Esta UI no inventa un botón de descarga. Eliminar su conversación asociada también puede eliminar adjuntos por las cascadas existentes.

Google está habilitado según la configuración pública comprobada del servicio. No hay una sesión Google de usuario disponible para probar IA autenticada en vivo desde este entorno. Las pruebas de navegador son contratos aislados: no certifican respuestas reales de Qwen, análisis de archivos ni corrección de respuestas abiertas en producción. No se afirma una verificación física de iOS/Android o instalación standalone.

La prueba SQL de aislamiento sí se ejecuta contra Supabase real con dos cuentas temporales y `ROLLBACK`: valida lectura por propietario, exclusión de otra cuenta, persistencia de respuestas, denegación de escrituras directas, claves ocultas y guardado atómico del plan. Se comprobó que quedaron cero cuentas y cero exámenes de prueba. El asesor de seguridad de Supabase no reporta avisos.

## Validación

`npm install`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:browser`; comprobación Deno adicional de `supabase/functions/dream-api/index.ts`; prueba SQL `supabase/tests/exams_rls.sql` y rechazo HTTP 401 de la función sin JWT.

Las capturas de navegador se generan en `/tmp/dream-exam-qa` con fixtures exclusivamente de pruebas. Se revisan móvil, tablet, desktop y dark mode. Los tamaños cubiertos son 375, 390, 393, 430, 768, 834, 1280, 1440 y 1728 px.
