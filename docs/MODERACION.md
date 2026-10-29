# Moderación y antiabuso (bloques B1 y B2)

Sistema interno. El alumno solo ve avisos y bloqueos claros. **Las normas son las de la tabla G de los términos** (`content/legal/terminos.ts`, §6.G). Cada regla del código apunta a una fila de esa tabla y un test lo comprueba. No hay normas inventadas.

## Qué hace hoy (B1 + B2)

- **Datos** (`supabase/migrations/20261022090000_moderation_data.sql`): `mod_sanctions` y `mod_appeals` (el alumno solo lee lo suyo) y `mod_events`, `mod_ip_signals`, `mod_ip_blocks`, `mod_ip_hits` (internas, sin acceso desde el navegador). Todo con RLS y en cascada al borrar la cuenta.
- **IP solo como huella.** HMAC-SHA256 de la IP con `MOD_IP_PEPPER`. La IP en claro no se guarda, no se registra y la base de datos rechaza cualquier valor que no sea una huella de 64 caracteres. En IPv6 se usa el prefijo /64 y una IPv4 mapeada cuenta como IPv4.
- **Retención.** Las filas de IP se borran a los 30 días (`mod_purge`). Se ejecuta sola de forma oportunista y, si Carlos activa `pg_cron`, cada hora.
- **Antiabuso por tasa** (`supabase/functions/dream-api/moderation.mjs`), solo en las acciones que gastan IA (`consumingActions`). No afecta al inicio de sesión, las páginas legales ni a «Reclamar».

## Reglas (de la tabla G)

| Regla | Fila de la tabla G | Qué hace el sistema solo | Qué solo propone |
|---|---|---|---|
| `G-BOT` | Bots, scripts, scraping o sobrecargar | Bloqueo de la IP **24 h** | Baneo de 7 días (queda «revisión pendiente») |
| `G-SPAM` | Spam, mensajes repetidos o saturar el chat | Limitación de la cuenta: 1 h; si se repite en 7 días, 24 h | Baneo de 7 días a la 3.ª vez (queda «revisión pendiente») |

Lo automático por tasa es **solo** un bloqueo temporal de 24 h (decisión de Carlos, 20/10/2026). Los baneos de 7 días o más los confirma una persona.

**Redes compartidas (colegios, bibliotecas, datos móviles).** Si en la última hora hay 5 cuentas distintas o más desde la misma IP, **nunca se bloquea la IP entera**: solo se limita a la cuenta concreta que insiste. Menores de 18: umbrales un 25 % más estrictos, pero la consecuencia nunca es más dura.

Los umbrales están en `THRESHOLDS` (`moderation.mjs`). Con el límite normal (6 por minuto y 50 al día por cuenta) un alumno no los alcanza.

## B3 · Cuentas nuevas desde la IP de una cuenta baneada

Regla de Carlos: no se banea en el primer momento, **se espera 2 días y se observa**. Fila de la tabla G: «Varias cuentas para saltarse límites, cola o un baneo» (cierre de las cuentas extra y baneo de 7 días, `G-MULTI`).

1. Si una cuenta tiene un baneo **activo** y aparece una cuenta **creada después del baneo** con la misma huella de IP (ventana de 30 días), la cuenta nueva queda «en observación» 2 días. Sigue usando Dream con los límites normales y **sin ningún aviso de sospecha**. Cada entrada se anota con su huella de IP, nunca con la IP.
2. Una «entrada» es una visita separada de la anterior por al menos 30 minutos.
3. **Salvaguarda contra baneos injustos:** la regla solo es automática en una IP «de tamaño de hogar». Si en 30 días esa huella la han usado **más de 4 cuentas distintas**, es una red compartida (colegio, biblioteca, datos móviles): **no se banea a nadie solo**, el caso va al panel como «revisión pendiente».
4. Pasados los 2 días: con **4 entradas o más** (configurable entre 4 y 7), en una IP de hogar **y con el interruptor encendido**, se aplica la fila de la tabla G (baneo de 7 días, sesiones cerradas, motivo en `mod_events`). Con menos entradas se descarta. Con el interruptor apagado, o en una red compartida, solo queda como propuesta.
5. **`MOD_AUTO_BAN_ENABLED` está apagado por defecto.** Es una decisión automatizada con efecto significativo (RGPD art. 22): conviene que la revise un abogado o gestor antes de encenderla. Mientras tanto el sistema solo propone en el panel.
6. Riesgo conocido: una IP repetida demuestra la misma red, no la misma persona (un hermano, un compañero de piso). Por eso existen la apelación y el botón de levantar el baneo.
7. No se relaciona a nadie por nada más que la huella de IP y el comportamiento: sin huellas de dispositivo ni cookies de seguimiento.

Como `mod_ip_signals` solo se rellena con `MOD_MODE` distinto de `off`, **las cuentas baneadas antes de activarlo no se relacionan con nada**: la observación empieza a funcionar desde el momento en que se activa.

## B4 · Moderación de contenido con IA

Se ejecuta dentro de la acción `chat`, **antes** de llamar al modelo normal. Solo con `MOD_MODE` distinto de `off` **y** `MOD_AI_ENABLED=true`. Falla hacia permitir.

**Tres pasos, de menos a más caro** (`supabase/functions/dream-api/content-moderation.mjs`):
1. **Filtro barato** (patrones): insultos evidentes, trucos conocidos de «jailbreak», enlaces o repeticiones, datos personales (teléfono, correo, DNI), contenido ilegal o violento, intentos de hackeo, uso en un examen en curso y frases de riesgo en primera persona. **El filtro nunca sanciona**: solo decide qué mensajes miran el clasificador. Un mensaje que no marca, no llega al clasificador.
2. **Clasificador**: una llamada corta a Groq con el modelo ya usado, por el mismo camino de admisión que el resto (reserva de tokens, claves y pausas). El mensaje entra como **dato**: un JSON `{"texto": ...}` en el turno del usuario, recortado a 1.500 caracteres y sin caracteres invisibles; el sistema no contiene nunca texto del alumno. La salida debe ser exactamente `{"categoria": <lista cerrada>, "confianza": 0..1}`; cualquier otra cosa (texto, claves de más como un usuario o una acción, categorías fuera de la lista) cuenta como «sin veredicto» y se permite. **El clasificador solo puede elegir entre las categorías que el filtro ya había marcado**, así que un mensaje marcado como insulto no puede subirse a «ilegal». Como mucho puede aplicarse a la cuenta que escribió.
3. **Resultado, nunca una sanción dura automática:**

| Categoría (fila de la tabla G) | Qué ve el alumno | Qué se registra |
|---|---|---|
| Insultos, acoso (`G-INSULT`), trucos de IA (`G-JAILBREAK`), datos de otras personas (`G-DATOS`), examen oficial (`G-EXAMEN`) | Aviso amable que dice qué norma, sin acusar. El mensaje sigue su camino | 1.ª vez: aviso. Si reincide en 7 días: limitación de 24 h. A la 3.ª: **propuesta** de baneo de 7 días (`revision_pendiente`) |
| Spam (`G-SPAM`) | Aviso y limitación de 1 h (24 h si reincide) | Limitación automática de minutos u horas, como dice la tabla |
| Contenido ilegal, violento, sexual, discriminatorio (`G-ILEGAL`) o hackeo (`G-HACK`) | Aviso fijo; **el mensaje no se manda al modelo** | Aviso y **propuesta** de baneo permanente. Lo confirma una persona |
| Derechos de autor (`G-COPYRIGHT`) | Nada | Solo un evento marcado para revisión (no se puede automatizar) |
| **Autolesiones o riesgo para el alumno** | Respuesta fija de apoyo (024, 112, hablar con una persona adulta). **El mensaje no se manda al modelo** | **Nada**: ni sanción, ni evento. No es una infracción |

- La respuesta de apoyo se activa con confianza ≥ 0,7; el resto de categorías, con ≥ 0,8.
- Hablar de literatura o historia («el suicidio en la obra de Larra») no es una frase de riesgo: el clasificador lo distingue y, si no responde, no pasa nada. Si el clasificador falla pero el alumno escribió una frase explícita en primera persona, se añade una **línea de apoyo** al final de la respuesta normal, sin sanción.
- La fila «Contenido ilegal… o que incite a hacerse daño» de la tabla G trata de incitar a otros; expresar riesgo propio se trata como apoyo. Conviene que Carlos lo confirme.
- **Qué se guarda.** En `mod_events` solo un código de regla, la confianza y el id de la conversación (`conv:<id>`); **nunca el texto del mensaje, ni un fragmento**. Decisión consciente: la privacidad pesa más que tener la prueba. Para los mensajes que se corta (apoyo, bloqueo) el historial guarda «Mensaje no enviado a la IA.» en lugar del texto, y así no vuelve a entrar en el contexto del modelo.
- **Si el clasificador falla o no responde**, o la base de datos da un error, no se sanciona y el chat sigue. El límite de tasa (B2) es la red de seguridad.
- **Coste.** Una llamada solo para mensajes marcados. Estimación de la admisión (conservadora, ≈ 1 token por byte): ≈ 1.360 tokens de entrada para un mensaje corto y ≈ 2.800 para uno de 1.500 caracteres, más 120 de salida como tope. El uso real será bastante menor (≈ 400 tokens de entrada) y `dream_reconcile` corrige los contadores con el uso real. En la evaluación solo 1 de 21 mensajes legítimos llega al clasificador.

**Evaluación** (`evals/moderacion.json`, 61 casos: claros, límite y que no deben marcarse; `node scripts/eval-moderacion.mjs`):
- Filtro barato, medido sin red: **34 de 34 casos claros marcados (100 %)**; **1 de 21 mensajes legítimos (4,8 %)** llega al clasificador («el suicidio en la obra de Larra») y ninguno se sanciona por el filtro. Ojo: los casos los escribí viendo los patrones, así que el 100 % es optimista; hay que ampliar el conjunto con mensajes reales anonimizados.
- **Clasificador: no medido.** Aquí no hay `GROQ_API_KEY` ni red. El script lo evalúa cuando se le da la clave. No he podido comprobar si Groq ofrece un modelo de moderación dedicado; se usa el mismo modelo del chat con un prompt muy corto y salida JSON validada.

## Cómo se activa (todo apagado por defecto)

Secretos de la función `dream-api` (Supabase):

| Secreto | Para qué |
|---|---|
| `MOD_MODE` | `off` (por defecto, no hace nada), `observe` (apunta pero no bloquea) o `enforce` |
| `MOD_IP_PEPPER` | Secreto de al menos 32 caracteres. Lo crea Carlos; yo no lo imprimo ni lo guardo |
| `MOD_IP_HEADER` | Cabecera de la que se lee la IP (por defecto `cf-connecting-ip`) |
| `MOD_IP_XFF_HOPS` | Solo si la cabecera es `x-forwarded-for`: qué salto desde la derecha |
| `MOD_AUTO_BAN_ENABLED` | `true` para el baneo automático por evasión (B3). Apagado por defecto |
| `MOD_OBS_MIN_ENTRIES` | Entradas mínimas para confirmar, entre 4 y 7 (por defecto 4) |
| `MOD_AI_ENABLED` | `true` para la moderación de contenido con IA (B4). Apagado por defecto |

Orden recomendado: aplicar la migración → crear `MOD_IP_PEPPER` → **verificar la cabecera de IP (ver abajo)** → `MOD_MODE=observe` unos días → revisar los eventos → `enforce`.

## Lo que NO está verificado (importante)

- **Qué cabecera trae la IP real.** Las peticiones del navegador van directamente a Supabase. No he podido comprobar en producción cuál es la cabecera de confianza, porque eso exige desplegar una función de prueba que devuelva las cabeceras que recibe. Hasta entonces el sistema solo lee `cf-connecting-ip` (o la que se configure) y, **si no existe, no hace nada** (falla abierto). Hay que comprobarlo antes de pasar a `enforce`.
- Si el cliente puede falsificar la cabecera elegida: depende de la plataforma. El código ignora todas las demás (`X-Forwarded-For` escrito por el cliente, `X-Real-IP`, `Forwarded`…) y lo prueba un test.
- La subida por QR usa ya la misma lectura (`getClientIp`). Comprobación real de la cabecera en los registros de Supabase: `docs/ip-real.md` (2026-10-29).
- No se han hecho pruebas de carga.

## Texto de los términos que propongo a Carlos (no lo he editado)

Los términos dicen que algunos bloqueos son automáticos «por ejemplo por uso excesivo». Para el bloqueo de 24 h por uso anormal de una conexión, propongo añadir en §6.G, «Detección»: *«Si detectamos un uso anormal desde una conexión, podemos bloquear el uso de la IA desde ella durante 24 horas.»* El baneo automático por evasión (B3) necesitará otra frase y la propondré en su bloque.

## Pendiente de los siguientes bloques

- El botón **«Reclamar»** y la pantalla del alumno baneado (B6). Hoy el mensaje de bloqueo dice «escríbenos».
- Baneo manual y comprobación de baneos en cada petición (B5b).
