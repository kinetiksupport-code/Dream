# Auditoría de seguridad de Dream (21/10/2026)

Auditoría completa «de esquina a esquina» del código publicado el 20/10/2026 (commit `5b889ef`, rama `preview/2026-10-20`), hecha con el método de la skill `security-audit`.

**Cómo se hizo.** Se leyó el código y se probó solo en local, con datos inventados y sin red. No se atacó `edudream.es` ni el proyecto de Supabase de producción. De producción solo se leyó configuración (permisos, políticas, buckets, avisos y recuentos), sin leer datos de alumnos ni claves. Los detalles técnicos y las pruebas están en los artefactos de la ejecución (`dream-run-1`) y en las PRs enlazadas.

**Resultado en una línea.** 8 hallazgos (27 zonas revisadas, todos los hallazgos verificados por una segunda revisión independiente): 1 alto, 1 medio, 3 bajos y 3 pendientes de que Carlos compruebe un dato que el código no muestra. Hay una PR con arreglo para cada uno. **Ninguno está desplegado ni aplicado**: hace falta el «sí» de Carlos.

## 1. Hallazgos

Gravedad: **alta** = se salta un control importante con consecuencias reales; **media** = fallo real con alcance limitado; **baja** = poco daño. «A comprobar» = hay una hipótesis fundada, pero falta un dato que solo se ve fuera del código.

| Id | Qué pasa | Gravedad | Estado | Arreglo |
|---|---|---|---|---|
| SEC-01 | Cualquiera, sin iniciar sesión, podía pausar la IA de todos los alumnos | Alta | Confirmado en local y en la lectura de producción | [#63](https://github.com/kinetiksupport-code/Dream/pull/63) |
| SEC-05 | Con 4 cuentas se agotaba el cupo diario de IA de todos | Media | Confirmado en local | [#67](https://github.com/kinetiksupport-code/Dream/pull/67) y [#69](https://github.com/kinetiksupport-code/Dream/pull/69) |
| SEC-02 | Las subidas por QR seguían llegando a la IA tras retirar el permiso | Baja | Confirmado en local | [#64](https://github.com/kinetiksupport-code/Dream/pull/64) |
| SEC-03 | Cualquier alumno con sesión podía leer las instrucciones internas de las skills | Baja | Confirmado (lectura de producción y local) | [#65](https://github.com/kinetiksupport-code/Dream/pull/65) |
| SEC-06 | El modo mantenimiento no llegaba a `dream-api` | Baja | Confirmado en local | [#68](https://github.com/kinetiksupport-code/Dream/pull/68) |
| SEC-04 | Las imágenes que escribe la IA se cargaban solas | A comprobar | La parte del navegador está confirmada | [#66](https://github.com/kinetiksupport-code/Dream/pull/66) |
| SEC-07 | Sin tope de conversaciones y exámenes por alumno | A comprobar | Hipótesis | [#68](https://github.com/kinetiksupport-code/Dream/pull/68) |
| SEC-09 | Las direcciones de vuelta del login en Supabase podrían aceptar webs ajenas | A comprobar | **Falta que Carlos mire un ajuste** | Quitar un ajuste (§3) |

### SEC-01 · Pausar la IA de todos sin iniciar sesión (alta)
Tres funciones internas de la base de datos (`dream_provider_pause`, `dream_release`, `dream_admission_cleanup`) las podía ejecutar cualquiera con la clave pública de la web. La migración del repositorio ya les quitaba el permiso, pero en producción no se aplicó igual. Con una llamada por proveedor se paraba Groq, Cloudflare y Tavily durante unos 68 años. No daba acceso a datos. No se ha explotado: lo comprobé en solo lectura y la IA no estaba pausada.
**Arreglo:** retirar el permiso y cambiar los permisos por defecto para que las funciones nuevas no nazcan abiertas. Prueba que impide que vuelva a pasar: `tests/security-rpc.test.ts`.

### SEC-05 · Cupo diario de IA agotable (media)
El cupo global es de 2 millones de tokens, solo 4 veces el de un alumno. Una respuesta de test gigante reservaba hasta 400 000 tokens, el proveedor la rechazaba y la reserva no se devolvía. Además, al terminar bien una petición, los contadores de tokens se quedaban con la estimación, unas 3,8 veces el uso real: unas 98 conversaciones normales ya llenaban el cupo sin ataque.
**Arreglo:** tope de 4000 caracteres por respuesta (#67) y contadores corregidos con el uso real (#69).
**Sigue abierto (§4):** no hay reparto justo del cupo entre alumnos y un intento rechazado sigue cobrando la estimación completa.

### SEC-02 · QR y permiso de IA (baja)
El móvil del QR despacha las acciones por un camino interno que no comprobaba el permiso de IA. Con una sesión QR abierta, retirar el permiso no bastaba: las fotos seguían yendo a Groq y se guardaban.
**Arreglo:** el QR comprueba el permiso del dueño, renovar exige permiso y retirar el permiso cierra las sesiones de subida.

### SEC-03 · Instrucciones internas de las skills legibles (baja)
La migración intentaba ocultar la columna `prompt` con un permiso por columna, pero en Postgres eso no sirve si la tabla entera sigue legible. En producción lo estaba (14 skills activas). No expone datos de alumnos; sí propiedad intelectual de Dream. No he leído el contenido.
**Arreglo:** quitar el acceso a la tabla y devolver solo las columnas sin el prompt.

### SEC-06 · Mantenimiento solo en la web (baja)
El navegador llama a `dream-api` directamente, así que el modo mantenimiento (que vive en el middleware de Vercel) no la protegía. Un usuario fuera de la lista podía seguir usando todo con su sesión.
**Arreglo:** `dream-api` aplica la misma lista por su cuenta (nuevos secretos `DREAM_MAINTENANCE_MODE` y `DREAM_MAINTENANCE_ALLOWED_EMAILS`) y un acceso denegado revoca la sesión en el servidor.

### SEC-04 · Imágenes de la IA que se cargan solas (a comprobar)
Una respuesta con `![](https://servidor/…)` se mostraba como imagen y el navegador la pedía sin clic, enviando a ese servidor lo que llevara la URL (por ejemplo el apodo). La IA podría escribirla si una web de la búsqueda o un documento subido se lo pide. La parte del navegador está probada. Falta saber si los modelos reales obedecen esa orden, que no se puede ver en local.
**Arreglo:** el renderizador ya no crea imágenes, solo muestra el texto alternativo. Cubre chat, tests y exámenes.

### SEC-07 · Filas sin tope (a comprobar)
`conversation_create` y `exam_create` no tenían tope por alumno. Que sea un problema depende del disco de Supabase y de límites de red que el código no muestra.
**Arreglo:** tope de 1000 conversaciones y 200 exámenes por alumno.

### SEC-09 · Direcciones de vuelta del login (a comprobar, potencialmente crítico)
`docs/LOGIN_GOOGLE.md` pide permitir en Supabase `https://*-kinetik1.vercel.app/**` para las previews. Ese comodín podría aceptar cualquier `algo-kinetik1.vercel.app` que registre otra persona. Si el ajuste existe y alguien puede registrar un nombre así, podría enviar a un alumno un enlace de login que entregue su sesión a una web ajena. **El código no muestra este ajuste: solo Carlos puede mirarlo** (§3).

## 2. Cosas pequeñas añadidas (endurecimiento)

- Una pausa de proveedor no pasa nunca de 24 horas (#68).
- `take_budget_lock` fija su `search_path`; cierra un aviso del asesor de Supabase (#68).

## 3. Lo que tiene que hacer Carlos

1. **Cuanto antes: mirar** en Supabase → Authentication → URL Configuration si hay alguna dirección con `*` en `vercel.app` (por ejemplo `https://*-kinetik1.vercel.app/**` o `https://*.vercel.app/**`) o con `localhost`. Si la hay, quitarla y dejar solo las direcciones exactas que se usen. Dime qué ves.
2. **Dar el «sí»** para aplicar las migraciones, de más a menos urgente: #63 (SEC-01), #65 (SEC-03), #69 (SEC-05), la migración de #68.
3. **Dar el «sí»** para desplegar `dream-api` con #64, #67 y #68.
4. Después de aplicar #63 y #65, comprobar en solo lectura (lo puedo hacer yo) que `anon` ya no tiene permiso en las tres funciones y que `authenticated` no lee `prompt`.
5. Si algún día se activa el mantenimiento: crear a la vez los secretos de la función (#68).

## 4. Propuestas grandes (no hechas, esperan decisión)

| Propuesta | Por qué |
|---|---|
| Política de seguridad de contenido (CSP) con `img-src` limitado | Segunda barrera contra imágenes ajenas y scripts. No hay ninguna hoy. Puede romper fuentes, imágenes o scripts si se ajusta mal, por eso conviene probarla primero en modo informe en una preview. |
| Reparto justo del cupo global entre alumnos | Hoy un grupo pequeño puede agotarlo. Cambia el diseño del cupo. |
| Devolver lo reservado cuando el proveedor rechaza la petición | Hoy se cobra la estimación completa. |
| Quitar el bucket `dream-attachments` de Storage | No lo usa ningún código, pero cada alumno puede subir ahí hasta 10 MB sin pasar por las comprobaciones de archivos y sin borrarse al eliminar la cuenta. |
| Restricciones (CHECK) en `display_name`, `avatar_url` y `academic_level` | El alumno las modifica directamente y se saltan la validación. Solo afecta a su propia IA. |
| Poner en servidor la lista de correos de mantenimiento y no en el repositorio | Hoy hay un correo personal escrito en `lib/maintenance.ts`. |
| Cierre de la edad: `MINOR_RESET` conserva el consentimiento | Una cuenta que declara menos de 14 años conserva su permiso y puede reenviar otra fecha. Es información que da el propio alumno; conviene decidirlo con la parte legal. |
| Fijar los programas del despliegue (`supabase`, `deno`) con lockfile | Se resuelven al desplegar con el token puesto. |
| Pequeños fallos de corrección de tests (una pregunta de emparejar sin pares da por buena cualquier respuesta; `test_submit` da error 500 con una lista que contiene `null`) | Solo afectan a la nota del propio alumno, no son un riesgo de seguridad. Conviene arreglarlos junto a la próxima tarea de tests. |
| Eliminar del servidor los marcadores `<!--DREAM_…-->` que escriba la IA | Hoy solo causa tarjetas engañosas, sin acceso a datos ajenos. |

## 5. Inventario de superficies y estado

| Superficie | Estado |
|---|---|
| `dream-api` con sesión (~45 acciones) | Cada acción filtra por dueño (`owner_id`). Hallazgos SEC-05, SEC-06, SEC-07. |
| `dream-api` por QR sin sesión | Token de 256 bits guardado como hash, dispositivo atado, límites por sesión e IP. Hallazgo SEC-02. |
| Base de datos expuesta (PostgREST) | RLS en todas las tablas. Hallazgos SEC-01 y SEC-03. Las columnas de respuestas correctas de los tests **no** son legibles (comprobado). Las otras 17 funciones de `public` solo las ejecuta `service_role` (comprobado en producción). |
| Next.js: middleware, callback, mantenimiento | Cookie firmada con HMAC y a prueba de falsificación; PKCE correcto. Hallazgos SEC-06 y SEC-09. |
| Navegador: Markdown, fuentes web, widgets | Sin ejecución de código (`skipHtml`, KaTeX sin confianza). Hallazgo SEC-04. |
| Service worker y almacenamiento del navegador | No guarda respuestas personalizadas. Sin contenido privado en `localStorage`. |
| Subida de apuntes (PDF, Office, imágenes) | Comprobación de firma real, límites tras descomprimir, solo en memoria. Sin fallos. |
| Corrección de tests y exámenes | Las respuestas correctas no se devuelven antes de entregar, el modo examen no se puede saltar y la nota se guarda una sola vez. Un alumno puede influir en su propia nota con su texto, pero no en la de nadie más. Sin fallos. |
| Subida de archivos en el navegador (nombres, vistas previas, QR) | Los nombres se muestran como texto, las vistas previas son del propio alumno y se liberan, el token del QR va en el fragmento de la URL y se borra de la barra. Sin fallos. |
| Telemetría (Sentry, PostHog) | Solo con permiso, sin contenido académico. Sin fallos. |
| CI/CD (`.github/workflows`) | Acciones fijadas por hash, sin secretos en PRs, token solo en el paso de despliegue. Mejoras en §4. |
| Dependencias | 5 avisos altos solo en herramientas de desarrollo (no llegan a producción). |
| Secretos | Ninguna clave en el árbol ni en 250 commits de historia. |
| Producción | Solo Google (10 usuarios), sin contraseñas, 0 factores MFA, cabeceras con HSTS y `X-Frame-Options: DENY`, sin CSP. |

## 6. Lo que NO se pudo comprobar

- El ajuste de direcciones de vuelta de Supabase Auth (SEC-09): no está en el código.
- Si los modelos reales de Groq o Cloudflare escriben imágenes Markdown con datos al recibir texto malicioso de una página o documento (SEC-04).
- Si hay límites de peticiones por usuario o por IP delante de `dream-api`, el tamaño y el aviso del disco de Supabase (SEC-07).
- Si Supabase sobrescribe las cabeceras `x-forwarded-for` y similares: de ahí salen las IP de los límites del QR.
- El contenido de los prompts de las skills (no se leyeron, solo los permisos).
- El comportamiento exacto de la versión desplegada del servicio de login frente al comodín (se emuló).
- Que producción ejecute exactamente las funciones del repositorio (se comprobaron permisos y cuerpos, no todo el catálogo).
- Pruebas de carga: no se hicieron, por la regla de no atacar producción.

## 7. Estado de los arreglos

Todas las PRs están **en borrador**, contra `preview/2026-10-20`, con pruebas que fallan sin el arreglo. Nada se ha desplegado ni aplicado en Supabase.
