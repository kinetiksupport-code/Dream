# Propuesta de cambios en los Términos (§6.G) · PARA REVISIÓN DE CARLOS

**No he editado `content/legal/terminos.ts`.** Aquí van los cambios que propongo, en texto listo para pegar. Cambiar los Términos cambia `TERMS_VERSION` en `lib/consent.ts` y vuelve a pedir la aceptación a **todos** los alumnos en la bienvenida: decide tú cuándo. Conviene que un profesional revise el texto.

La Política de privacidad (sección 11, ya redactada en este PR) no depende de esto: dice lo mismo que se propone aquí con otras palabras.

## 1. Bloqueo de 24 h por uso anormal desde una conexión

En «**Detección**» (los bloqueos «por ejemplo por uso excesivo»), añadir al final:

> Si detectamos un uso anormal desde una conexión (muchas peticiones en muy poco tiempo), podemos bloquear el uso de la IA desde esa conexión durante 24 horas. Si compartes la conexión con más gente (un colegio, una biblioteca), no bloqueamos la conexión entera: solo limitamos a la cuenta que lo causa.

## 2. Baneo automático por evasión (solo si Carlos activa `MOD_AUTO_BAN_ENABLED`)

En la fila «Varias cuentas para saltarse límites, cola o un baneo», o en «**Saltarse un baneo**», sustituir la frase actual por:

> **Saltarse un baneo** (por ejemplo con otra cuenta) alarga la sanción y puede hacerla permanente. Si detectamos que una cuenta nueva entra repetidamente desde la misma conexión que una cuenta baneada, la observamos 2 días y, si se confirma, aplicamos la fila anterior sin más aviso previo. Solo lo hacemos en conexiones de uso doméstico, nunca en redes compartidas, y puedes reclamar siempre: lo revisa una persona.

**Aviso:** esto es una decisión automatizada con efecto significativo (RGPD art. 22). No pegues esta frase hasta decidir activar el interruptor, y consúltalo antes con un abogado o gestor (ver `docs/EIPD-moderacion.md`).

## 3. Clasificación automática de mensajes

En «**Detección**», añadir:

> Para aplicar estas normas usamos un filtro automático que revisa tus mensajes y, solo si marca alguno, lo envía a nuestro proveedor de IA para clasificarlo. Un resultado automático nunca decide solo un baneo: lo decide una persona. No guardamos el texto de tus mensajes en los registros de moderación.

## 4. Autolesiones = apoyo, no sanción

En el apartado 6.D, donde dice «Si te sientes mal o en peligro, Dream no es un servicio de emergencias…», añadir:

> Si le cuentas a Dream que te sientes mal o en peligro, no es una infracción y nunca te sancionaremos por ello: te responderemos con apoyo y con los teléfonos de ayuda.

## 5. Aclarar la fila «o que incite a hacerse daño»

La fila «Contenido ilegal, violento, sexual, discriminatorio o que incite a hacerse daño» se podría leer como que hablar de las propias ganas de hacerse daño es una infracción. Propongo:

> Contenido ilegal, violento, sexual, discriminatorio o que incite a otras personas a hacerse daño (hablar de cómo te sientes tú no es una infracción)

## Resumen para decidir

| Cambio | ¿Necesario ya? | Nota |
|---|---|---|
| 1 Bloqueo 24 h | Sí, si se activa `MOD_MODE=enforce` | Solo afecta a la IA |
| 2 Baneo por evasión | Solo si se enciende `MOD_AUTO_BAN_ENABLED` | RGPD art. 22: profesional antes |
| 3 Clasificación de mensajes | Sí, si se activa `MOD_AI_ENABLED` | |
| 4 Autolesiones = apoyo | Recomendado | Ya es lo que hace el sistema |
| 5 Aclarar fila de daño | Recomendado | Es una decisión tuya |
