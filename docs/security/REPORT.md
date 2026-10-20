# Dream — informe de seguridad, fiabilidad y escalabilidad

8 octubre 2026. Base `f62d452`; rama `feature/security-reliability`, conservando los PR #1 (Exámenes) y #2 (observabilidad). **No se ha desplegado en producción, no se han modificado datos reales y Dream no se declara lista para producción.**

## 1. Hallazgos y correcciones

| Nivel | Hallazgo | Corrección en la rama | Estado de producción |
|---|---|---|---|
| Alta | IA y búsquedas sin cuotas distribuidas ni presupuesto | RPC atómica, contadores compartidos, leases, reserva antes de cada intento, corte global y rechazo inmediato de contención | Pendiente de revisión/aplicación coordinada |
| Alta | Descompresión Office sin límites | Directorio ZIP validado antes de inflar; límite real de bytes por entrada/archivo, sin ZIP64/encriptado/path traversal; extracción acotada | Pendiente de despliegue |
| Alta | Body leído entero antes de validar tamaño | Reader acotado por bytes y cancelación; Content-Length comprobado antes de lectura | Pendiente de despliegue |
| Alta | Estado privado podía sobrevivir a un cambio de cuenta | Árbol del workspace reiniciado por ID de sesión; guardas de perfil contra respuestas tardías | Cambio de cuenta y respuesta tardía probados en navegador; pendiente de despliegue |
| Alta contextual | Dependencias vulnerables de ejecución | Overrides compatibles PostCSS 8.5.29 y KaTeX 0.19.0, incluidas copias transitivas | Build de la rama auditado sin avisos de ejecución |
| Media | Entregas y evidencia parcialmente guardadas o duplicadas | `dream_test_commit`: transacción, bloqueo de test, rechazo de repetición e incrementos atómicos; validación completa de evaluaciones IA | Pendiente de migración/despliegue |
| Media | Perfil propio permite editar campos internos | UPDATE del perfil reducido a campos editables; rol/dominio no editables por authenticated | Pendiente de migración; modo actual ya fuerza experiencia personal |
| Media | Tavily no acepta claves numeradas/timeout propio | Gestor de dos slots, timeout/failover acotados, pausa compartida ante 429 | Pendiente de despliegue y configuración |
| Media | Retry-After perdido y cooldown 429 solo local | Pausa compartida para toda la cuenta/proveedor, sin rotar claves por 429 | Pendiente de migración/despliegue |
| Media | PDF conserva recursos/timer | Destrucción de loadingTask en todas las salidas, timeout y páginas/texto acotados; evaluación de código PDF desactivada | Extractor probado localmente; fuzzing/compatibilidad Edge pendientes |
| Media | Listados ilimitados o mensajes antiguos truncados | Exámenes por páginas de 20; mensajes recientes por páginas de 50 con botón de anteriores; últimas 50 sesiones por detalle | Backend nuevo pendiente; cliente compatible con respuesta anterior |
| Media | SW sustituye inmediatamente una sesión y elimina cachés ajenas | Activación al cerrar ventanas, borrado solo del prefijo propio, allowlist estática; aviso de conexión sin replay de solicitudes | SW real y aviso offline probados en navegador; pendiente de despliegue |
| Media | Dominio/materia en logs Edge | Eliminados de métricas técnicas; SDK Deno separado con filtros estrictos | Pendiente de despliegue |
| Baja | CORS comodín con Bearer JWT | Allowlist explícita de orígenes; UUID en JSON mantiene compatibilidad con CORS anterior | Configurar antes del despliegue |

No se ha demostrado un hallazgo crítico. Se conservaron modelo, prompts educativos, diseño y motor de Exámenes. Cada “corregido” describe código revisable, no una protección ya activada en producción.

## 2. Estado real de credenciales e infraestructura

Vercel: proyecto `dream`, framework Next.js, Node24. Metadatos confirman `GROQ_API_KEY_1/2/3`, `TAVILY_API_KEY_1/2` exclusivamente en Production. No se descifraron ni imprimieron valores. No aparecen `NEXT_PUBLIC_DREAM_API_URL`, PostHog o Sentry en esa consulta; Preview/Development no tienen esos destinos configurados. Hay variables sensibles de Supabase/Postgres en servidor, ninguna convertida a NEXT_PUBLIC.

Supabase: proyecto activo `cxaujyagtpsxvkwkdxbc`, Frankfurt eu-central-2, PostgreSQL17.11. El CLI no tiene autorización para listar secretos; los MCP disponibles no exponen esa operación. **Presencia/validez de Groq y Tavily en Edge no verificadas.** Tenerlas en Vercel no demuestra sincronización. No se obtuvo service_role ni se cambiaron credenciales.

No se pudo leer el plan contratado, cuotas/consumo/concurrencia real de Vercel/Supabase ni las cuotas del proveedor. No se prometen esos límites. El identificador de modelo configurado no se cambió; su disponibilidad y tarifa real requieren validación autorizada con el proveedor.

## 3. Groq y Tavily

Pruebas con fetch sintético verifican Groq 401/403/408/425/500/503, timeout, no failover ante 429, espera compartida, no retry tras contenido emitido, reader cancelado y respuesta sobredimensionada rechazada. Las claves duplicadas se deduplican. No se efectuaron generaciones de IA reales para estas pruebas.

Tavily admite los dos nombres nuevos y fallback heredado condicionado, máximo dos intentos, 10 segundos/intento y 25 total. Un 429 no prueba el segundo slot. Resultados limitados, URLs seguras y error explícito ante indisponibilidad; ninguna fuente sintética se incorpora a la app. Los cooldowns de autenticación/errores transitorios son locales y optimizan latencia; la **cuota, presupuesto, concurrencia y pausa 429** son compartidas en PostgreSQL. No se presenta el mapa local como circuito distribuido completo.

## 4. Límites y coste controlado

Defaults revisables: 6 operaciones de consumo/minuto/usuario, 50/día, 5 generaciones/día, 15 búsquedas/día, 1 operación concurrente/usuario y 8 globales. Presupuestos: 500k unidades conservadoras de tokens/usuario/día, 2M globales, US$1/usuario/día y US$10 globales/día. Reservas conservadoras por bytes UTF8 más salida máxima y techo de visión configurable; **no equivalen a tokens facturados medidos**. Cada intento reserva presupuesto, sin devolver costes inciertos. Lecturas guardadas quedan fuera del presupuesto.

`enabled=false`, precios iniciales cero: IA cerrada hasta configuración explícita. Verificar precio máximo por token, búsqueda y límite de visión antes de habilitar. HTTP429/Retry-After diferencia límites Dream del proveedor; un error una vez abierto NDJSON comunica código/espera dentro del stream. No hay una cola ilimitada. La lease vence en 3 minutos y operación en 150 segundos. Retención corta y función de limpieza requieren programación operativa antes de activar.

Idempotencia evita retransmisiones con el mismo UUID, no mensajes semánticamente iguales con UUID diferentes. Exámenes conservan su CAS e IDs persistentes. Adjuntos se suben en una cola local de hasta cuatro, serial, compatible con una operación por usuario. No se cachean ni reenvían automáticamente solicitudes privadas al reconectar.

## 5. PostHog y Sentry

PostHog mediante plugin: Dream identificado, taxonomy y query agregada confirman **1 `analytics_verification` el 8/10/2026**. No se consultaron contenidos ni identidades. Se mantiene consentimiento, sin Replay/autocaptura; nuevo evento `rate_limit_reached`. Entornos production/preview/development diferenciados sin etiquetas privadas.

Sentry Next preservado. SDK Deno11.5.0 añadido exclusivamente a Edge, con integraciones automáticas/tracing desactivados y envelope reducido a texto constante y etiquetas técnicas. Transporte real del SDK hacia collector local probado. **No hay DSN/organización/proyecto/token disponibles para confirmar ingestión remota, source maps o alertas de la cuenta.** SDK Deno es beta: validar su compatibilidad con el runtime exacto de Supabase en staging. Alertas propuestas en OPERATIONS; no se declaran instaladas.

## 6. Optimización y auditoría Supabase/Vercel

Perfil creado de forma idempotente ante una carrera. Operaciones internas de Exámenes reutilizan usuario/admin/perfil verificados y la misma lease, evitando repetir autenticación y cargar el perfil otra vez. Un fallo transitorio de Auth devuelve 503, no fuerza logout como un JWT caducado. Cambiar preferencias no vuelve a cargar conversaciones por identidad del objeto perfil. SDKs frontend continúan con carga diferida y consentimiento.

Supabase advisory de seguridad: cero avisos estructurales. RLS de conversaciones, mensajes, adjuntos y Exámenes restringe propietario; campos de claves de test sin SELECT authenticated. RPC existentes Dream limitadas a service_role, con propiedad comprobada. No se cambiaron roles técnicos o funcionalidad histórica.

Advisory de rendimiento: tres FK compuestas sin índice cubriente y 32 índices sin uso registrado. [Detalle FK](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [índices sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). No se añadieron ni eliminaron índices de esas tablas basándose solo en el advisory. Se conserva un EXPLAIN local de leases; hace falta medir con volumen representativo y consultas reales en staging. No se hicieron EXPLAIN ANALYZE costosos sobre registros de estudiantes.

Build final Next.js: JS compartido 107KB; chat 315KB, exámenes 176KB, sesión 317KB (First Load JS). No son métricas LCP/INP de usuarios reales. No hay resultados de consumo real o facturación de Vercel/Supabase.

## 7. Carga medida — entorno aislado

k6 2.3.0, Node24, PostgreSQL17, 2 CPU asignadas y 8GiB al workspace. Mismo equipo aloja generador, servidor y DB: no representa un cluster de producción. 10.000 identidades sintéticas, 50.000 conversaciones sintéticas, auth sintética firmada; proveedores sintéticos con 40ms de demora, usando gestor Groq y RPC de admisión reales. No se contactó Groq/Tavily/producción para esta carga.

Objetivos de lectura: p95 <500ms, p99 <1000ms; errores inesperados <1%. 429 se miden aparte, no se esconden como capacidad de IA. Duraciones 10–20 segundos: pruebas cortas, no soak de horas.

| Escenario | VUs | RPS total | Lectura media/p50 ms | p95/p99 ms | IA 429 | Resultado |
|---|---:|---:|---:|---:|---:|---|
| Mixto | 10 | 110 | 10 / 5 | 41 / 82 | 0% | Objetivo de lectura cumple |
| Mixto | 50 | 422 | 24 / 14 | 71 / 170 | 55,7% | Lecturas cumplen; IA rechazada con control |
| Mixto tras backpressure | 100 | 595 | 91 / 71 | 188 / 497 | 96,1% | Lecturas cumplen; no demuestra 100 IA simultáneas |
| Mixto | 250 | 772 | 254 / 202 | 598 / 736 | 99,5% | **Falla p95: detenido** |
| Solo lecturas | 10 | 95 | 16 / 4 | 14 / 257 | — | Cumple |
| Solo lecturas | 50 | 483 | 11 / 3 | 33 / 140 | — | Cumple |
| Solo lecturas | 100 | 993 | 14 / 7 | 45 / 122 | — | Cumple |
| Solo lecturas | 250 | 1064 | 137 / 115 | 242 / 923 | — | Cumple en harness |
| Solo lecturas | 500 | 769 | 530 / 418 | 1368 / 1699 | — | **Falla: detenido** |

Errores inesperados y checks fallidos: 0 en estos escenarios; HTTP5xx=0 en el harness. TTFT **sintético** mixto100: media290ms, p50~208ms, p95~1089ms, p99~1597ms; no es TTFT de Qwen. Memoria PostgreSQL observada puntualmente ~100MiB, CPU~121% durante una muestra: no son máximos ni métricas del servicio remoto. No hay medida de memoria máxima de todas las funciones ni saturación del proveedor real.

Se conservan también los dos fallos de 100 VUs anteriores al backpressure: uno coincidió con el build y otro volvió a fallar sin él. No se borraron para presentar únicamente éxitos. La adquisición inmediata de admisión eliminó espera por el bloqueo global y mejoró lecturas, con alto rechazo de IA. JSON completos en `load-*.json`.

## 8. Capacidad verificada y límites pendientes

- Registrados: la fixture tiene 10.000 IDs; **no son 10.000 registros reales en Supabase Auth**.
- Conectados: no se midieron sockets/realtime ni sesiones OAuth persistentes masivas.
- Navegando: QA de rutas reales en navegador con datos sintéticos; no equivale a 1.000 navegadores reales.
- Consultando: hasta250 VUs del harness local dentro de objetivos; 500 falla.
- IA: admisión exacta de8 leases verificada y novena rechazada; no se verifica capacidad de8 Qwen reales. En carga mixta100 se rechaza el96,1% de intentos IA.
- 1.000/2.000/5.000/10.000 concurrentes: **no ejecutados**, no superados. Se detuvo la progresión ante fallos, como se pidió.

Para crecer: obtener cuotas/planes reales; staging equivalente; medir largos contextos, archivos y coste observado; ajustar concurrencia al contrato del proveedor; reservar capacidad para lecturas; evaluar un contador/limitador dedicado si PostgreSQL se convierte en cuello de admisión. La fila diaria global y las transacciones de cuota son un límite deliberado y medible, no una promesa de escala ilimitada. Limitar reservas y rechazar IA preserva datos, pero no garantiza buena aceptación bajo picos.

## 9. Estimación de costes — NO precios verificados

Hipótesis explícitas de ejemplo, USD/mes, 30 días: cada usuario activo diario hace10 chats/día, 3.000 tokens de entrada y1.000 salida por chat;20% con búsqueda;8 tests/mes (8k entrada/2,5k salida),4 planes (6k/1,8k),8 correcciones (4k/1k). Tarifas **hipotéticas**, no atribuidas al modelo real: US$0,50/M entrada, US$1/M salida yUS$0,008/búsqueda. Reserva de contingencia10% para errores/reintentos. No incluye visión ni historial más largo.

| Activos diarios | Chat IA | Web | Tests/planes/corrección | Total APIs +10% |
|---:|---:|---:|---:|---:|
| 100 | US$75 | US$48 | US$9,52 | **US$145,77/mes** |
| 500 | US$375 | US$240 | US$47,60 | **US$728,86/mes** |
| 1.000 | US$750 | US$480 | US$95,20 | **US$1.457,72/mes** |

Hosting, DB/Auth/almacenamiento/egress, PostHog y Sentry se deben sumar según planes reales, todavía desconocidos; no hay un total comercial verificado. Las reservas por bytes pueden cortar antes que esta previsión de tokens facturados. El default US$10/día global impediría alcanzar los dos escenarios mayores: habría rechazo de consumo, no gasto ilimitado. No habilitar basándose en estas tarifas de ejemplo.

## 10. Pruebas y riesgos operativos

36 tests unitarios aprobados: protocolo, LaTeX/widgets, privacidad real de SDK, proveedores/resiliencia, ZIP/body y evaluación de corrección. PostgreSQL aislado verifica concurrencia, RPM/día/generaciones/búsqueda/presupuesto monetario, tombstones, pausa compartida, RPC privadas/perfil y kill switch;10 commits concurrentes guardan1 intento completo. Migración completa aplicada y probada en una DB local nueva, sin modificar producción. Deno: extractores Office/PDF reales con documentos sintéticos y transporte Sentry a collector local,3 tests aprobados. TypeScript, ESLint, build de producción y 18/18 pruebas Playwright pasan con fixtures locales; incluyen las rutas principales, seis tamaños visuales hasta 1728px, temas, tests/exámenes, streaming, privacidad PostHog, cambio de cuenta, cola de adjuntos y PWA. Los 3 tests Deno y las 10 comprobaciones PostgreSQL también pasan. Runtime npm audit: 0; 5 avisos altos restantes corresponden a dependencias de desarrollo ESLint/braces.

Fallos intermedios corregidos: nombre SQL reservado, variable de corrección ambigua, bootstrap de roles repetidos y API de destrucción de PDF; las pruebas detectaron y corrigieron esos problemas. Fallos de carga250/500 quedan pendientes de capacidad, no maquillados.

Pendientes para producción: autorización de metadatos de secretos Supabase; cuotas/tarifas/modelo efectivos; presupuestos y origen permitido; limpieza programada; DSNs/source maps/alertas Sentry; OAuth y persistencia con cuenta de prueba real; ensayo del SW entre dos builds; PDFs/imágenes hostiles y consumo CPU/memoria en Edge; carga autorizada sobre staging y luego validación acotada de infraestructura real. Cinco avisos npm de desarrollo (`braces`/cadena ESLint) sin parche upstream: no se ocultan ni se fuerza un downgrade inseguro. Código de ejecución y árbol equivalente de dependencias Edge auditados sin avisos conocidos a esta fecha.

## 11. Archivos y revisión

Ver `FILES.txt` para listado completo. Principales: admisión/ZIP/Tavily/corrección/monitoring Edge, índice dream-api, migración privada, estado de sesión/composer/paginación, Service Worker, políticas de telemetría/entornos, overrides y lockfiles, scripts PostgreSQL/k6, CI sin deploy y tests. Arquitectura y operación en OPERATIONS.md; auditoría inicial en AUDIT.md. Base del PR: rama de observabilidad para conservar trabajos sin integrar. Pull request draft: https://github.com/kinetiksupport-code/Dream/pull/3
