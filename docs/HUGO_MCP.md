# Hugo (Crisp) conectado a Dream por MCP

Hugo es la IA de soporte de Dream en Crisp. Solo se integra con sistemas externos por un servidor MCP: `supabase/functions/hugo-mcp`. **Solo lectura.**

## Regla de oro (Carlos, 6-nov)
Si el alumno abre el chat **con su sesión de Dream iniciada**, Hugo puede consultar **solo esa cuenta**. Sin sesión (p. ej. un padre desde otro móvil), Hugo no ve nada de nadie. A Crisp **no** se le manda correo, nombre ni id (`lib/crisp.ts`).

## Cómo funciona
1. El alumno abre el chat (Ajustes › Ayuda o pantalla de baneo). El navegador lee `$crisp.get("session:identifier")` (solo tras cargar Crisp) y llama a `crisp_link` de `dream-api` con su JWT. Funciona también si está baneado (`BAN_ALLOWED_ACTIONS`).
2. `hugo_link` (SQL) guarda (sesión de Crisp → `user_id`) en `dream_private.crisp_links`: caduca a las 24 h, una sesión se ata **una sola vez** y a una sola cuenta (si llega otra, se ignora y se registra), máximo 5 sesiones por alumno, se borra con la cuenta. Al cerrar sesión, `crisp_unlink` borra los enlaces.
3. Hugo llama al MCP. La cuenta se encuentra **solo** por `X-Crisp-Session-Id`. Las herramientas no aceptan correo, id ni nombre; los argumentos que mande el modelo se ignoran.
4. **Aviso:** `X-Crisp-Session-Id` no entra en la firma de Crisp. Basta porque sin Bearer y firma válidos no se acepta nada.
5. **Pendiente de verificar con una cuenta real:** que el identificador de `$crisp.get("session:identifier")` sea el mismo que Crisp manda en `X-Crisp-Session-Id` (la documentación de Crisp llama a ambos «session id», pero no lo dice expresamente). Si no coincidiera, Hugo siempre vería «No veo ninguna cuenta»: falla cerrado, nunca abre otra cuenta.

## Herramientas
| Herramienta | Devuelve |
|---|---|
| `consultar_bloqueo()` | `estado` (sin_bloqueo, limitada, baneada_temporal, baneada_permanente), `norma` (tabla G en palabras sencillas), `desde`, `hasta`, `apelacion`, `fecha_apelacion` |
| `consultar_cuenta()` | `nombre` (solo nombre de pila, ≤20), `bloqueo`, `estado`, `cuenta_especial`, `mensajes_hoy`, `limite_hoy` («sin límite» en cuentas especiales), `se_reinicia`, `en_cola`, `avisos_recientes` (≤5), `apelaciones` |
| `estado_de_dream()` | `ia` (normal, lenta, sin_servicio), `cola_global`, `aviso` (lo escribe Carlos en el Panel) |

Nunca devuelve correo, apellidos, apodo, id, edad, IP, huella, textos de mensajes/apuntes/apelaciones, confianza del clasificador, `mod_events`, notas del admin ni datos de otros. `shape()` vuelve a filtrar los campos aunque la base devolviera más (test `supabase/tests/hugo_mcp_deno.mjs`).

## Seguridad
- Bearer `HUGO_MCP_TOKEN` **y** firma `X-Crisp-Signature` = `sha256=` + HMAC-SHA256(`HUGO_MCP_SIGNING_SECRET`, `{timestamp}.{website_id}.{cuerpo crudo}`), `X-Crisp-Website-Id` = `68c785ab-…`, timestamp ≤ 300 s, comparación en tiempo constante, firma verificada **antes** de leer el JSON. Si falta algo: 401 sin datos.
- Base de datos: la función usa la clave de servicio (decidido por Carlos) pero **solo** puede llamar a la rpc `hugo_call` (lista cerrada `ALLOWED_RPC`, test). `hugo_call` es `SECURITY DEFINER`, solo `service_role`, y devuelve solo los campos de arriba.
- Sin cuenta, enlace caducado o sesión desconocida: misma respuesta. Límite: 20 llamadas por sesión y 300 en total cada 10 min.
- Registro (`dream_private.hugo_calls`): hora, herramienta, resultado y id de sesión de Crisp; sin IP, correo ni textos; se borra a los 30 días; visible en el Panel › Soporte.
- **No se activa** la verificación por OTP de Crisp (necesita el correo).

## Panel (lo que hace Carlos, no Hugo)
- «Soporte (Hugo)»: llamadas recientes, resumen de 24 h (avisa si hay muchas sin cuenta atada) y el aviso que ve Hugo.
- «Privacidad»: *Eliminar cuenta por petición de privacidad* (correo solo para buscar; motivo obligatorio `tutor_menor_14`, `tutor_14_17`, `titular`, `otro`; código TOTP reciente + confirmación en dos pasos; auditoría sin el correo) y *Bloqueo preventivo* (limitación sin norma G, reversible desde la ficha).
- Hugo no tiene ninguna acción que escriba.

## Conectarlo en Crisp
1. Supabase › Edge Functions › secretos: `HUGO_MCP_TOKEN` y `HUGO_MCP_SIGNING_SECRET` (el segundo es el `mcp_sec_…` de Crisp).
2. Crisp › Hugo AI Agent › Integrations & MCP › External MCP servers › **Add MCP server**: URL `https://cxaujyagtpsxvkwkdxbc.supabase.co/functions/v1/hugo-mcp`, autenticación **Bearer Token** con `HUGO_MCP_TOKEN`, **Request Signing** activado.
3. **Refresh tools** y prueba en el **Playground**.
4. Rotar: genera otro token y cámbialo en Crisp y en Supabase a la vez; el secreto de firma se regenera en Crisp (Request Signing › Regenerate, invalida el anterior) y se copia al secreto de Supabase.

## Qué no se ha verificado
- Que el id de sesión del navegador coincida con `X-Crisp-Session-Id` (ver arriba).
- Dónde guarda Crisp los datos y sus subencargados (marcado en la política y la EIPD).
- La prueba real con una cuenta de prueba (chat con y sin sesión) y las capturas.
