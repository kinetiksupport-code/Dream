# Capacidad de la IA gratis (Parte A)

Fecha: 15/10/2026. Modelo: `qwen/qwen3.8-27b` en Groq.

## 1. Límites de Groq (plan gratis)

Fuente: https://console.groq.com/docs/rate-limits (comprobado el 15/10/2026). Confírmalo en `console.groq.com/settings/limits`.

| Límite | Plan gratis | Plan Developer |
|---|---|---|
| Peticiones por minuto (RPM) | 30 | 1.000 |
| Peticiones por día (RPD) | 1.000 | 500.000 |
| Tokens por minuto (TPM) | 8.000 | 250.000 |
| Tokens por día (TPD) | 200.000 | sin límite |

- **Los límites son por organización, no por clave.** Si las cuatro claves `GROQ_API_KEY_1..4` fueran de la misma cuenta, no sumarían nada.
- **Decisión de Carlos (20-oct-2026):** las cuatro claves son de cuatro organizaciones y se reparten la carga. Cada petición empieza por una clave distinta (rotación). Si una clave responde 429, se enfría solo esa durante su `retry-after` (entre 1 s y 1 h) y la misma petición prueba la siguiente. Solo cuando las cuatro dan 429 se lanza el límite con la espera más corta y se guarda la pausa en `dream_private.provider_state`. Carlos asume el riesgo con las condiciones de uso de Groq y Tavily.
- Al arrancar, `dream-api` deja una línea `{"provider":"groq","event":"groq_keys","groq_key_slots":N,"discarded":[…]}` con los huecos descartados y el motivo (`empty`, `invalid_format` o `duplicate` con `duplicate_of`), sin valores. Si `groq_key_slots` no es 4, revisa el secreto del hueco que aparece ahí.
- No puedo leer los secretos, así que no sé a qué organización pertenece cada clave. Para comprobarlo: entra en console.groq.com con cada cuenta → API Keys. Si todas están en la misma organización, el reparto no suma capacidad.
- Los tokens en caché no cuentan para el límite.
- Groq solo envía cabeceras del límite diario de peticiones (`x-ratelimit-*-requests`) y del límite por minuto de tokens (`x-ratelimit-*-tokens`). Del TPM y del TPD no hay cabecera de «cuánto queda hoy», así que Dream tiene que llevar su propia cuenta.
- Qwen 3.8 27B está marcado como **Preview** en Groq («no para producción»).

## 2. Cuántos tokens gasta un mensaje

No hay datos reales todavía: hasta hoy el servidor desplegado era un stub. Medido con el código (≈ 3,6 caracteres por token en español):

| Parte | Tokens aprox. | ¿Fija? |
|---|---|---|
| Instrucciones del tutor (`DREAM_SYSTEM_PROMPT`) | 4.080 | Sí (cacheable) |
| Política de conversación + herramienta de búsqueda | 450 | Sí (cacheable) |
| Memoria académica + habilidades educativas | 450–780 | No |
| Historial (antes: hasta 20 mensajes × 4.000 caracteres ≈ 22.000) | ahora ≈ 1.000 típico, 3.600 máx. | No |
| Mensaje del alumno | 30 | No |
| Respuesta (antes: hasta 2.048) | ahora ≈ 500 típico, 1.200 máx. (2.048 para apuntes o resúmenes) | — |

**Media estimada: unos 6.500 tokens por mensaje**, de los que unos 4.500 son el prefijo fijo. Si Groq lo cachea, cuentan unos 2.000. Si el tutor busca en internet, la petición se repite con el resultado y el mensaje cuesta casi el doble.

Qué significa con el plan gratis, para **todos los alumnos juntos**:
- Sin caché: unos 30 mensajes al día y algo más de 1 por minuto.
- Con caché: unos 100 mensajes al día y 3-4 por minuto.

Con el plan Developer cada mensaje cuesta unos 0,7 céntimos de dólar (6.000 de entrada × 0,80 $/M + 600 de salida × 4 $/M). Mil mensajes salen por unos 7 $.

## 3. Qué hace ya este PR

1. **Espera por minuto en la interfaz.** Si el servidor responde con un límite corto (`dream_rpm`, `dream_concurrency`, `dream_admission_busy`, `provider_rate_limit`, `all_keys_cooling_down` o el futuro `dream_queue`):
   - El chat muestra «Hay mucha gente usando Dream. Lo intento de nuevo en unos 40 s» o, si el servidor manda la posición, «Eres el 12º en la cola, unos 40 s».
   - Hay un botón Cancelar, y al cancelar el texto vuelve a la caja.
   - Reenvía el mismo mensaje cuando toca. Como máximo 6 veces y 5 minutos en total, sin bucles infinitos.
   - Solo reenvía si no se guardó nada: un 429 antes de empezar, o el servidor avisa con `reverted`. Así el mensaje nunca se duplica.
2. **Tope diario.** `dream_daily`, `dream_budget`, `provider_daily_limit` (o una espera de más de 15 minutos) no hacen cola.
   - Si el cupo agotado es el de todos, el chat dice «La IA gratis de hoy se ha agotado. Vuelve mañana a las HH:MM». Si es el del alumno, dice «Has usado toda tu IA gratis de hoy…».
   - Enlaza a apuntes, progreso e historial, que funcionan sin IA.
3. **Servidor** (código listo, **sin desplegar**):
   - Un 429 de Groq que agota el día se convierte en `provider_daily_limit`, con la hora real de reinicio.
   - Si un límite corta el chat antes de responder, se deshace el mensaje guardado y se responde con `reverted: true`.
   - Historial resumido sin llamar a la IA: los 4 últimos mensajes enteros y los anteriores recortados a 400 caracteres, con un tope de unos 9.000 caracteres.
   - Respuestas de 1.200 tokens por defecto.
   - Registro `dream_limit` con código y espera, sin contenido.
4. **Prefijo estable para la caché:** las instrucciones fijas ya van primero y no cambian entre mensajes. Lo que cambia (memoria, habilidades, examen, adjuntos) va detrás.
5. **Razonamiento solo en tareas difíciles:** no lo he tocado. La documentación de Groq que he consultado no aclara qué parámetro de razonamiento acepta Qwen 3.8, y uno equivocado haría fallar todas las peticiones. Propuesta: probar `reasoning_effort` con una clave de prueba antes de activarlo.

## 4. Lo que necesita tu OK (no está hecho)

### 4.1 Ajustar los límites de Dream a los de Groq (solo configuración, una sentencia SQL)

Hoy `dream_private.limits` permite 2.000.000 tokens al día en total, diez veces más que Groq. Propuesta para el plan gratis:

```sql
update dream_private.limits set
  global_tokens = 190000,   -- por debajo de los 200.000 de Groq
  user_tokens   = 40000,    -- ~6 mensajes largos por alumno
  daily         = 15,       -- mensajes de IA por alumno y día (pedido: 15)
  rpm           = 4;        -- por alumno y minuto
```

Sobre el límite por alumno: con el plan gratis, 15 mensajes por alumno agotan el cupo de todos con solo 2-6 alumnos activos. Propongo:
- 15 mensajes al día si pasas al plan Developer.
- 8 mensajes al día con el plan gratis, hasta tener datos reales de uso.

### 4.2 Cola global por orden de llegada (tabla nueva y cambio en `dream_admit`)

Hoy los límites por minuto son por alumno. Falta uno global, y una cola justa.

- **Tabla** `dream_private.queue(ticket bigserial primary key, owner_id uuid, request_id uuid, created_at, expires_at)`.
  - Sin RLS para el cliente: solo la usan funciones `security definer` con `service_role`, como el resto de `dream_private`.
  - FK a `auth.users` con `on delete cascade`.
- **Límites nuevos** en `dream_private.limits`:
  - `global_rpm = 28` y `global_tpm = 7500`, un poco por debajo de Groq.
  - Contador global por minuto en `dream_private.counters`, con scope `global:minute`.
- **`dream_admit`:**
  1. Si el minuto global está lleno, o hay tickets de otros alumnos por delante, crea o renueva el ticket del `request_id`.
  2. En ese caso responde `429 dream_queue`, con `position`, que es el número de tickets vivos por delante más uno, y `retry_after`, calculado como posición ÷ capacidad por minuto.
  3. Solo entra el primer ticket vivo cuando hay hueco. Al entrar, se borra.
  4. Los tickets caducan 20 s después de su hora prevista. Así, quien cancela o cierra la pestaña sale solo de la cola, sin acción nueva.
- **`dream_reserve`:** sumar los tokens reservados al contador global del minuto y rechazar con `dream_queue` si se pasa de `global_tpm`.
- **Coste en tokens:** ninguno, es solo base de datos.
- **Interfaz:** ya está lista. Muestra la posición en cuanto el servidor la mande.

### 4.3 Desplegar `dream-api` con los cambios de este PR

Sin desplegar, la interfaz nueva ya funciona con los códigos actuales, pero no recibe `provider_daily_limit` ni `reverted`.

## 5. Observabilidad sin datos personales

- Servidor: eventos `dream_limit` (código, segundos de espera, si se deshizo el mensaje) y, en `groq`, `provider_rate_limit` / `provider_daily_limit` con lo que queda de peticiones y tokens. Nunca texto de mensajes.
- Cliente: el evento existente `rate_limit_reached` (acción, estado HTTP), solo si el alumno activa las estadísticas.

## 6. «El servidor está en recuperación»

No sale de la admisión ni de la contrapresión. Lo devolvía el stub de `dream-api` (versión 22) que estuvo desplegado hasta hoy: respondía 503 con «El servicio está en recuperación. Inténtalo en unos minutos.» a todo salvo perfil, conversaciones y mensajes. Desde la versión 24 (código del repo) ese texto ya no existe. Los mensajes de límite actuales son los de la sección 3.

## 7. Otras cosas que he visto

- `DREAM_VISION_INPUT_TOKEN_CEILING`: si no está en los secretos de Supabase, subir una imagen da 503 `vision_budget_unconfigured`. Groq cuenta 2.048 tokens por imagen, así que 2048 es un buen valor.

## Turno con búsqueda web (20-oct-2026)

Antes, las dos llamadas de un turno con búsqueda reenviaban el prompt completo del modo. En Normal, el peor caso (historial largo) era ≈8.000 + ≈9.800 tokens estimados: más que los 8.000 tokens por minuto de una clave. Ahora:

- **Primera llamada** (el alumno pide buscar): solo decide la consulta. Bloque común + instrucción corta + 2 mensajes recientes, salida máx. 600. ≈1.650 tokens.
- **Segunda llamada** (con resultados): bloque común + estilo de búsqueda + política + contexto dinámico + 2 mensajes recientes + 3 resultados de 700 caracteres, salida máx. 1.000. ≈3.400 tokens.
- Total ≈5.100 (antes ≈17.800 en Normal y ≈7.250 en Rápido).
- Lo que más pesa es el prompt de Normal (`DREAM_SYSTEM_PROMPT`, ≈16.000 caracteres ≈ 4.500 tokens). Sigue entero en los mensajes sin búsqueda.
- Cada llamada deja una línea `dream_call_usage` con los tokens reales (`search_plan`, `search_answer` o `first`).

