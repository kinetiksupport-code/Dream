# Auditoría inicial — 8 octubre 2026

Base: f62d452, rama independiente de los PR abiertos #1 y #2. Auditoría de código, dependencias y metadatos reales; sin cambios en producción ni lectura de contenidos de estudiantes.

| Severidad | Hallazgo | Evidencia y alcance |
|---|---|---|
| Alta | Consumo sin presupuestos ni admisión compartida | Todas las llamadas Groq/Tavily; memoria de una instancia no controla costes globales. |
| Alta | Office puede descomprimir ZIP sin límite | attachments.mjs trunca únicamente después de extraer todo el XML. |
| Alta | Request body se materializa antes de acotarlo | req.text() antes de comprobar 12 MB. |
| Alta | Estado privado retenido entre cuentas | Workspace no se reiniciaba por UID; respuesta tardía podía conservar estado de la cuenta previa. |
| Alta | Dependencias con avisos de seguridad | npm audit inicial: 6 altos, 1 moderado, 4 bajos; distinguir herramientas de desarrollo y ejecución. |
| Media | Tavily usa clave heredada y no tiene timeout propio | tools.mjs; no admite las dos variables nuevas. |
| Media | 429 de proveedores pierde Retry-After | Groq no rota en 429 (correcto), pero no comparte su pausa entre instancias. |
| Media | Tests admiten entregas repetidas y memoria tiene read-modify-write | test_submit; concurrencia puede duplicar intentos y perder evidencia. |
| Media | Listados sin paginación completa | Exámenes ilimitados; mensajes devuelve los primeros 400; conversaciones 100. |
| Media | PWA activa inmediatamente y elimina cachés ajenas | skipWaiting en install y borrado sin prefijo. No cachea APIs privadas (correcto). |
| Media | Telemetría Edge incluye dominio y materia académica | dream_mode_resolved; innecesario para métricas técnicas. |
| Media | Recursos PDF no se liberan al vencer timeout | Promise.race sin destrucción/cancelación de documento. |
| Baja | CORS comodín | API exige Bearer JWT, no cookies; no demuestra acceso ajeno por sí mismo. Restringir orígenes para despliegue. |

No se ha demostrado una vulnerabilidad crítica. Supabase advisory security devuelve cero avisos. RLS restringe conversaciones, mensajes y exámenes al propietario; claves de respuestas no se entregan en test_get. resolveDreamMode fuerza experiencia personal; endpoints antiguos de profesor no conceden privilegios en esta versión. Se comprobaron grants de columnas: authenticated podía actualizar campos internos de su propio perfil; se propone restringirlos a campos editables. No se demostró escalada porque el backend actual fuerza experiencia personal.

Vercel confirma por **nombres y destinos**, nunca valores: GROQ_API_KEY_1/2/3 y TAVILY_API_KEY_1/2 presentes únicamente en Production. NEXT_PUBLIC_DREAM_API_URL, PostHog y Sentry no aparecen en sus metadatos. Preview/Development carecen de esas variables en la consulta realizada. La presencia de claves en Supabase NO se deduce de Vercel: falta acceso a metadatos de secretos de Edge. El valor de NEXT_PUBLIC_DREAM_API_URL tampoco se leyó; el destino real configurado localmente se contrastó con el endpoint esperado sin llamar a proveedores. No se copiarán ni rotarán credenciales automáticamente.

Sentry carece de DSN y token de lectura en este entorno; SDK instalado con filtros de privacidad, recepción real y alertas pendientes. PostHog existente exige consentimiento, sin replay/autocaptura; no duplicar SDK. OAuth requiere validación con cuenta de prueba autorizada, no se simulará su éxito.
