# Moderación y panel (Parte B): lo que NO se ha podido verificar, riesgos abiertos y decisiones

Lista final de toda la Parte B (B1 a B7). Coherente con `docs/MODERACION.md`, `docs/PANEL_ADMIN.md` y `docs/EIPD-moderacion.md`. Todo lo que está en las pruebas se ha ejecutado de verdad; lo de aquí abajo no.

## 1. No verificado (y por qué)

| # | Qué | Por qué no | Qué hace falta |
|---|---|---|---|
| 1 | **Qué cabecera trae la IP real** en peticiones navegador → Supabase (`cf-connecting-ip` por defecto) y que el cliente no pueda falsificarla | Exige desplegar una función de prueba que devuelva las cabeceras que recibe | Permiso de Carlos para desplegar esa función y una petición real desde un navegador. **Hasta entonces `MOD_MODE=enforce` no debe activarse**; sin cabecera de confianza el sistema no hace nada |
| 2 | **Clasificador de mensajes sin medir** | No hay `GROQ_API_KEY` ni red en el entorno de desarrollo. El filtro previo sí se midió (34 de 34 casos claros; 1 de 21 legítimos llega al clasificador), pero los casos los escribió quien conocía los patrones, así que el 100 % es optimista | Ejecutar `node scripts/eval-moderacion.mjs` con la clave y ampliar `evals/moderacion.json` con mensajes reales anonimizados |
| 3 | **Si Groq ofrece un modelo de moderación dedicado** | Sin red. Se usa el modelo del chat con un prompt corto y salida JSON validada | Consultarlo en la consola de Groq |
| 4 | **Crisp real** (chat de apelación del baneado) | No se probó contra Crisp; se prueba el cargador y el aviso de privacidad con datos falsos | Probarlo con una cuenta de prueba |
| 5 | **Segundo factor (TOTP) contra el proyecto real** | La inscripción y la verificación dependen de Supabase Auth con TOTP activado; se probó con un servidor falso | Que Carlos active TOTP en Authentication › Multi-factor y se inscriba |
| 6 | **Ajustes de Supabase Auth: otra vía a la cuenta de administrador** | La configuración de Auth no se ve desde el código | Comprobar en Authentication: registro por correo («Allow new users to sign up»), enlaces mágicos y vinculación automática de identidades. En la base de datos solo hay identidades de Google y ninguna contraseña (lectura de configuración). El código ya rechaza una cuenta con otra identidad. **Es el punto más débil del panel** |
| 7 | **Aviso por correo a Carlos** en cada entrada al panel y en las acciones graves | No hay infraestructura de correo; no se añade un servicio nuevo sin preguntar | Decidir el servicio (privacidad y contrato) |
| 8 | **Pruebas de carga** del antiabuso y del panel | Regla de no atacar producción | Probar en un proyecto de pruebas |
| 9 | **`pg_cron`** | No está instalada. La purga a 30 días corre sola de forma oportunista (1 de cada 200 peticiones que consumen IA) | Activar la extensión si se quiere purga garantizada cada hora |
| 10 | **Exportación de datos del alumno** | No existe en Dream (tampoco antes de esta parte); la pantalla del baneado solo promete borrar la cuenta | Decidir si se construye |
| 11 | **El estado 404 y la CSP con nonce del panel en Vercel** | Probados en una compilación real y un navegador local, no en Vercel | Comprobar en la preview de Vercel |
| 12 | **Producción nunca se ha usado con moderación activa** | Todo viene apagado | `observe` unos días y revisar los eventos |

## 2. Riesgos abiertos

1. **Falso positivo en una red compartida.** Mitigado (más de 4 cuentas = nunca automático; 5 o más en una hora = solo se limita la cuenta) pero no eliminado: una huella repetida no es la misma persona.
2. **Fallo conocido: purga incompleta.** `mod_purge` borra señales, bloqueos y contadores de IP, pero **no las entradas de una observación** (`mod_observation_entries`, que llevan una huella): duran mientras exista la cuenta. La política de privacidad lo dice con esa salvedad. Conviene corregirlo en el código antes de activar la observación.
3. **`mod_events`, sanciones, apelaciones y `admin_audit_log` no tienen borrado automático** (solo con la cuenta; el registro de auditoría sobrevive a ella a propósito). Plazos pendientes de decidir con un profesional.
4. **Sin texto de prueba.** No se guarda el mensaje (ni un fragmento) que originó una sanción. Es más privado, pero Carlos no verá la prueba al revisar. Ver decisiones.
5. **El baneo automático por evasión es una decisión automatizada con efecto significativo (RGPD art. 22).** Apagado por defecto. No encenderlo sin un abogado o gestor.
6. **La cuenta de administrador depende de Google.** Si alguien tomara su sesión de Google antes de inscribir el segundo factor, podría inscribir el suyo. Inscribirlo el primer día.
7. **Una ruta oculta no es seguridad.** La protección es la comprobación del servidor en cada petición.
8. **`clientIp` de la subida por QR** sigue siendo más permisivo que el del antiabuso hasta verificar la cabecera real (punto 1).
9. **Las mismas cuentas de prueba no sustituyen a alumnos reales**: ningún umbral se ha calibrado con tráfico real.

## 3. Decisiones que necesita Carlos

| Decisión | Mi propuesta |
|---|---|
| ¿Guardar un **fragmento corto** del mensaje (máx. 30 días, borrado al resolver) para poder revisar sanciones? | **No** (como está). Si quieres poder revisar, hay que cambiarlo y decirlo en la privacidad |
| **Autolesiones** frente a la fila «…o que incite a hacerse daño» de la tabla G | Apoyo y cero sanción, y aclarar la fila para que no se lea como infracción (ver `PROPUESTA_TERMINOS_MODERACION.md`) |
| ¿Subir la versión de los textos (`TERMS_VERSION`) por los cambios de privacidad? | No hace falta por los cambios de esta PR. La privacidad no tiene versión propia: subirla reabre el consentimiento de todos. Lo decides tú |
| Encender el **baneo automático por evasión** | No hasta tener revisión profesional |
| Orden de activación | Aplicar migraciones → verificar la cabecera de IP (punto 1) → `MOD_MODE=observe` → revisar eventos → `enforce`; `MOD_AI_ENABLED` después de medir el clasificador |
| Plazos de conservación de eventos, sanciones y auditoría | A decidir con el profesional |
| Servicio de correo para avisos del panel | Decidir cuál (privacidad y contrato) |
