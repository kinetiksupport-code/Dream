export const privacidad = String.raw`# Política de privacidad

*Última actualización: 29 de octubre de 2026 (versión provisional).*

## 1. Quién es el responsable

El responsable del tratamiento de tus datos es **Carlos Sánchez**, a título particular, que ofrece Dream Education ("Dream"). Puedes escribirle a **hellodream@edudream.es** para cualquier duda, para ejercer tus derechos o para pedir que borremos tus datos.

## 2. Qué datos tratamos y para qué

| Datos | De dónde salen | Para qué | Base legal |
| --- | --- | --- | --- |
| Correo y nombre de tu cuenta de Google | Inicio de sesión con Google | Crear y proteger tu cuenta | Ejecución del servicio |
| Nombre, fecha de nacimiento y nivel educativo | Lo escribes al empezar | Adaptar la ayuda a tu curso y comprobar que tienes al menos 14 años | Ejecución del servicio y obligación legal (edad mínima) |
| Apodo y aficiones | Los eliges en la bienvenida (puedes saltarlo) | Personalizar las explicaciones: el apodo para dirigirse a ti y las aficiones para poner ejemplos que te suenen. El apodo **no** se envía a la IA; las aficiones sí | Ejecución del servicio |
| Cómo estudias (opcional) | Lo eliges en Ajustes › Perfil, de listas cerradas: curso, asignaturas que te cuestan, comunidad autónoma, objetivo, cómo prefieres que te expliquen y tiempo de estudio | Adaptar las explicaciones a tu curso, a tu currículo y a lo que te cuesta. Se envía a la IA sin nada que te identifique | Ejecución del servicio |
| Lo que Dream recuerda de ti entre chats (solo si lo activas): hechos de estudio, como qué te cuesta, qué dominas, cómo te gusta que te expliquen, tus objetivos y fechas de examen y en qué te quedaste, y un resumen corto de cada conversación | Lo saca la IA de tus conversaciones, o de lo que importes de otra IA tras revisarlo tú | Personalizar la ayuda sin empezar de cero en cada chat | Tu consentimiento (lo pides en la bienvenida o en Ajustes y lo retiras cuando quieras) |
| Conversaciones con el tutor y tus mensajes | Lo que escribes o dictas | Responderte y guardar tu historial | Ejecución del servicio |
| Archivos que subes (fotos, PDF, Word, PowerPoint, Excel, texto) | Los subes tú, desde el dispositivo o escaneando el QR con el móvil | Leer su contenido para ayudarte a estudiar | Ejecución del servicio |
| Exámenes, temas, fechas, planes de estudio, tests, respuestas y notas | Lo creas tú o lo genera Dream | Preparar tus exámenes y simulacros | Ejecución del servicio |
| Datos técnicos de uso: número de mensajes, tokens y coste por usuario, tokens gastados en cada modo de IA (Rápido, Normal, Pensar más) por ventana de 5 horas, bloqueos por abuso. Sin el texto de los mensajes | Se generan al usar la IA | Evitar abusos y mantener el servicio gratuito dentro de un uso razonable | Interés legítimo |
| Estadísticas anónimas y errores | Solo si lo activas en Ajustes | Mejorar Dream | Tu consentimiento |
| Audio del micrófono (dictado por voz) | Solo cuando pulsas el botón de voz | Convertir tu voz en texto | Tu consentimiento (el navegador te lo pide) |

No pedimos teléfono, dirección, DNI ni datos de pago. Hoy Dream no cobra nada.

**Lo que no hacemos:** no vendemos tus datos, no hay publicidad, no hacemos perfiles comerciales, no usamos tus conversaciones ni tus archivos para entrenar modelos de IA ni para mejorar Dream (solo se usan para ayudarte a ti) y no guardamos grabaciones de tu voz.

### Qué pasa con tus datos, paso a paso

1. **Entras con Google.** Google confirma quién eres y nos da tu correo (y tu nombre si lo comparte). Nunca vemos tu contraseña de Google. Con eso se crea tu perfil en nuestra base de datos.
2. **Te presentas.** Nos dices tu nombre, tu fecha de nacimiento y tu nivel (por ejemplo 2.º de Bachillerato). La fecha de nacimiento solo sirve para comprobar que tienes al menos 14 años y calcular tu franja de edad (de 14 a 17 o adulto); no la usamos para nada más.
3. **Escribes un mensaje al tutor.** Tu navegador lo envía por una conexión cifrada a nuestro servidor en Supabase. El servidor comprueba que eres tú, mira que no te hayas pasado de los límites de uso y guarda tu mensaje en tu conversación.
4. **El servidor pide la respuesta a la IA.** Envía a Groq (o a Cloudflare Workers AI, si Groq no responde o si usas el modo «Pensar más») el texto de tu mensaje, la parte reciente de esa conversación, el texto de los archivos que hayas adjuntado y las instrucciones internas del tutor. No envía tu correo ni tu nombre. Tampoco tu apodo: la IA escribe una marca y Dream pone tu apodo al mostrarte la respuesta. Sí envía, cuando sirven para un ejemplo, las aficiones que elegiste y, si lo rellenaste, cómo estudias (curso, asignaturas que te cuestan, comunidad, objetivo, cómo prefieres que te expliquen y tiempo de estudio), sin nada que te identifique. La respuesta vuelve a nuestro servidor, se guarda en tu historial y se te muestra poco a poco.
5. **Si hace falta buscar en internet** (lo pides tú o Dream necesita comprobar un dato, una fecha o un método), el servidor envía a Tavily una consulta corta que escribe el tutor y que el servidor limpia antes: le quita tu apodo, tu nombre, tus aficiones, correos, teléfonos y enlaces. Aun así puede reflejar lo que preguntaste, así que evita poner datos privados en tus preguntas. Las webs consultadas aparecen en «Buscado en la web»; para mostrar su logo, tu navegador pide a Google el icono de cada web con solo su dirección (por ejemplo, «wikipedia.org»), nunca tu pregunta.
6. **Subes un archivo.** El servidor lo abre, extrae el texto (las imágenes se leen con un modelo de IA de Groq) y guarda solo ese texto. El archivo original no se guarda. Ese texto se usa para responderte y para crear tus tests y simulacros.
7. **Preparas un examen.** Guardamos el título, la asignatura, la fecha, los temas, tus dificultades y objetivo, el plan que genera la IA, y tus respuestas y resultados de cada test o simulacro.
8. **Controlamos el uso.** Para que el servicio gratuito aguante, apuntamos cuántas peticiones, búsquedas y "tokens" (unidades de texto) gastas por minuto y día, y su coste aproximado. También apuntamos cuántos tokens gastas en cada modo de IA (Rápido, Normal o Pensar más) dentro de tu ventana de 5 horas, y aparte los que gasta el proveedor de respaldo (Cloudflare) cuando responde en lugar de Groq. Con ello se forma la cola de espera y se bloquea, de forma automática y temporal, a quien abusa del sistema. Estos registros no contienen el texto de tus mensajes.
9. **Estadísticas y errores (solo si lo aceptas).** Se envía un identificador aleatorio y eventos genéricos (por ejemplo "se abrió un examen"), nunca el contenido de tus mensajes ni de tus archivos, sin grabar la pantalla y sin localizarte por IP. Puedes apagarlo en Ajustes y se deja de enviar.
10. **Memoria entre chats (solo si la activas).** Al pasar a otra conversación, el servidor envía a Groq la conversación anterior (sin tu correo, tu nombre ni tu apodo) para sacar hasta unos pocos recuerdos de estudio y un resumen corto. El servidor descarta todo lo que parezca de salud, emociones, religión, ideología, familia u otras personas, datos de contacto, tu centro educativo o contraseñas, y lo que pidas no recordar («no te acuerdes de esto»). Al empezar una conversación, hasta 10 recuerdos y el último resumen se envían al proveedor de IA dentro de las instrucciones, para que la ayuda sea personal. Guardamos 40 recuerdos como mucho.
11. **Importar de otra IA (solo si quieres).** Si pegas en Dream el perfil de estudio que te da otra IA, el servidor lo envía a Groq para sacar recuerdos, apodo y aficiones, y te enseña la lista para que la revises: solo se guarda lo que confirmes. El texto pegado no se guarda. No pegues datos de otras personas.
12. **Borrado.** Si borras el historial en Ajustes, se eliminan tus conversaciones y sus mensajes. Si pides eliminar la cuenta, se borran tu perfil, tus exámenes, planes, tests, archivos extraídos, conversaciones, recuerdos y resúmenes.

### Quién puede ver tus datos

- **Tú**, y nadie más a través de la app: la base de datos solo deja leer a cada usuario lo suyo.
- **El responsable (Carlos Sánchez)** tiene acceso técnico a la base de datos por ser quien la administra. Solo mirará contenido de conversaciones si es imprescindible para resolver un fallo que tú nos pidas arreglar, para investigar un abuso grave o por obligación legal.
- **Los proveedores** de la sección 4, solo para lo que hacen (alojar, procesar la respuesta de IA, buscar). No pueden usar tus datos para fines propios según sus contratos de tratamiento.
- **Autoridades**, solo si una ley o un juez lo exige.

### Qué no es de la IA

La IA no decide por sí sola nada con efectos legales sobre ti. La única decisión automática es el límite o bloqueo temporal por uso excesivo, y puedes pedir que lo revisemos escribiendo a hellodream@edudream.es.

## 3. Archivos que subes

Cuando subes un archivo, Dream extrae su texto (si es una imagen, un modelo de IA la describe y lee) y **guarda ese texto extraído** asociado a tu conversación. **No guardamos el archivo original.** Los archivos pueden contener datos de terceros (por ejemplo apuntes con nombres): sube solo lo que sea tuyo o que tengas derecho a usar.

## 4. Con quién compartimos los datos (encargados del tratamiento)

Usamos proveedores que tratan datos por nuestra cuenta, con contrato de encargado cuando es aplicable:

- **Supabase** (base de datos, autenticación y servidor de la aplicación). Región del proyecto: Zúrich (Suiza), en Europa.
- **Vercel** (alojamiento de la web). Puede registrar datos técnicos de conexión como la dirección IP.
- **Google** (inicio de sesión con tu cuenta de Google).
- **Groq** (proveedor de inteligencia artificial de los modos «Rápido» y «Normal»). Recibe el texto de tus mensajes, el contenido extraído de tus archivos y el contexto necesario para responder (incluidas, si ayudan para un ejemplo, tus aficiones, cómo estudias si lo rellenaste, y, si activas la memoria, lo que Dream recuerda de ti). También hace, en segundo plano, la extracción de la memoria y la importación de otra IA. Tus mensajes **no incluyen tu correo, tu nombre ni tu apodo**.
- **Cloudflare** (Cloudflare Workers AI, proveedor de inteligencia artificial). Se usa para el modo «Pensar más» y como respaldo cuando Groq no responde. Recibe lo mismo que Groq: el texto de tu mensaje, una parte más corta de la conversación, el contenido extraído de tus archivos y las instrucciones del tutor, **sin tu correo ni tu nombre**. No conocemos la región en la que ejecuta el modelo, así que puede tratar tus mensajes fuera de la Unión Europea. Según Cloudflare, no usa este contenido para entrenar modelos de IA y no lo guarda cuando ya no lo necesita para responder.
- **Cloudflare** (Cloudflare Workers AI, ilustraciones de los esquemas). Para dibujar las imágenes de un esquema solo recibe una **descripción corta en inglés del tema** (por ejemplo, «un palacio andalusí al atardecer») que escribe la IA de Dream; **no recibe tus apuntes, tus mensajes, tu nombre ni tu correo**. Las imágenes no llevan datos personales, se guardan en Supabase y se reutilizan para otros esquemas del mismo tema. No conocemos la región en la que se generan las imágenes, así que esa descripción puede tratarse fuera de la Unión Europea.
- **Tavily** (búsqueda web). Solo recibe la consulta de búsqueda que el tutor genera cuando necesita verificar un dato actual.
- **Google** (iconos de webs). Cuando abres una respuesta con búsqueda, tu navegador pide a Google el logo de cada web consultada. Google recibe la dirección de esa web y la de tu conexión (IP), igual que al visitar cualquier página; no recibe tu pregunta, tu nombre ni tu correo.
- **Usercentrics** (Cookiebot, gestor de cookies). Muestra el aviso de cookies y guarda tu elección como prueba del consentimiento: un identificador aleatorio, la fecha y hora, tu elección, tu dirección IP recortada, el navegador que usas y la página desde la que decidiste. No recibe tu nombre, tu correo ni nada de lo que estudias. Con el plan actual el registro se guarda 12 meses. El país en el que se tratan estos datos está pendiente de confirmar en el contrato de encargado de Usercentrics. Más detalle en la [Política de cookies](/cookies).
- **Crisp** (chat de ayuda), solo si lo abres desde Ajustes > Ayuda o desde la pantalla de apelación, y solo con tu permiso para sus cookies. Recibe los mensajes que escribas en ese chat y datos técnicos de conexión (como la IP). Dream no le pasa tu correo, tu nombre ni tu cuenta.
- **PostHog** y **Sentry** (estadísticas y errores), solo si tú lo activas en Ajustes. Funcionan de forma anónima: sin grabación de pantalla, sin contenido de tus mensajes y sin geolocalización por IP.

No cedemos tus datos a nadie más salvo obligación legal. Qué guarda cada servicio en tu navegador lo explicamos en la [Política de cookies](/cookies).

## 5. Transferencias internacionales

Algunos de estos proveedores (por ejemplo Groq, Cloudflare, Vercel, Tavily, Google, PostHog o Sentry) pueden tratar datos fuera de la Unión Europea, principalmente en Estados Unidos. En ese caso la protección se apoya en el Marco de Privacidad de Datos UE-EEUU o en cláusulas contractuales tipo. En el caso de Cloudflare Workers AI no sabemos en qué región se ejecuta el modelo de IA, así que tus mensajes pueden tratarse fuera de la Unión Europea (transferencia internacional).

## 6. Inteligencia artificial

Para responderte, Dream envía tus mensajes y el texto de tus archivos a proveedores de IA y de búsqueda (Groq, Cloudflare y Tavily). Por eso, al registrarte te pedimos una casilla propia, sin marcar de antemano: "Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme". Guardamos la fecha y hora. Puedes retirar este permiso cuando quieras en Ajustes › Privacidad o escribiendo a hellodream@edudream.es; sin él no podrás usar el tutor de IA.

Los **esquemas («Dreams»)** se hacen con tus apuntes: la IA de texto escribe el contenido a partir de ellos y Dream lo maqueta; las ilustraciones las genera un modelo de imágenes y llevan la etiqueta «Imagen generada con IA». Todo el esquema lleva el aviso «Contenido generado por IA, revísalo» (artículo 50 del Reglamento europeo de IA). Los **juegos de práctica («Dreams» interactivos)** también salen de tus apuntes: la IA solo escribe las preguntas y las respuestas, y el juego lo pone Dream, aislado del resto de la web (no puede leer tu cuenta ni conectarse a internet). Llevan el aviso «Generado por IA a partir de tus apuntes. Revísalo» y guardamos solo tu mejor resultado y el último, para tu progreso.

Las respuestas las genera un modelo de IA. **Puede equivocarse o inventar datos**: contrasta lo importante con tus apuntes, tu libro o tu profesor. Con carácter general no se toman decisiones automáticas con efectos legales sobre ti; la única excepción posible es la de la sección 11 (cuentas nuevas para saltarse un baneo), que solo se aplica si está activada. Los tests y simulacros se corrigen automáticamente solo como ayuda para estudiar; la nota que ves no es una nota oficial.

## 7. Menores de edad

En España, un menor puede dar su consentimiento para tratar sus datos a partir de los **14 años**. Por eso **Dream es solo para mayores de 14 años**. Al empezar te preguntamos tu fecha de nacimiento: si tienes menos de 14, no puedes crear la cuenta, borramos lo que hubieras escrito en la bienvenida (nombre, apodo y aficiones), no guardamos tu fecha de nacimiento y cerramos la sesión. No verificamos tu identidad: la fecha es una declaración tuya. Si un padre, madre o tutor legal cree que un menor de 14 años está usando Dream, puede escribirnos a hellodream@edudream.es y borraremos su cuenta y sus datos.

## 8. Cuánto tiempo guardamos los datos

- Tu cuenta, conversaciones, textos de archivos, exámenes, esquemas y juegos se guardan **mientras tengas cuenta**. Los esquemas y los juegos guardan solo su contenido (no tus apuntes) y se borran con la cuenta.
- Puedes **borrar todo tu historial de conversaciones** desde Ajustes cuando quieras.
- Puedes **cambiar o borrar tu apodo, tus aficiones y cómo estudias** en Ajustes › Perfil. Si eliminas tu cuenta, se borran con ella.
- **Lo que Dream recuerda** (recuerdos y resúmenes de conversación) se guarda hasta que lo borres o, si no se usa, **12 meses desde su último uso**; después se elimina solo. En Ajustes › Lo que Dream recuerda puedes verlo, fijarlo, borrarlo uno a uno o todo, y apagar la memoria. Si la apagas, deja de guardarse y de usarse.
- Para eliminar tu cuenta y todos tus datos, escríbenos a **hellodream@edudream.es** y lo haremos en un máximo de **30 días**.
- Los registros técnicos de uso y abuso se conservan solo el tiempo necesario para su finalidad. Las huellas de conexión de la sección 11 se borran a los **30 días**.
- Las copias de seguridad del proveedor pueden conservar datos un tiempo limitado después de borrarlos.

## 9. Tus derechos

Puedes **descargar una copia de todo lo que Dream guarda de ti** en Ajustes › Privacidad › «Descargar mis datos» (un archivo JSON). También puedes pedirnos **acceso, rectificación, supresión, oposición, limitación y portabilidad** de tus datos, y retirar tu consentimiento en cualquier momento (por ejemplo las estadísticas desde Ajustes). Escríbenos a **hellodream@edudream.es** y te responderemos en un máximo de un mes. Si no estás conforme, puedes reclamar ante la **Agencia Española de Protección de Datos** (www.aepd.es).

## 10. Seguridad

La conexión va cifrada (HTTPS). Cada usuario solo puede leer sus propios datos (reglas de seguridad por fila en la base de datos), las escrituras pasan por un servidor con comprobación de identidad, y las claves de los proveedores de IA no están en tu navegador. Ningún sistema es infalible: avisaremos de cualquier brecha según exige la ley.

## 11. Seguridad contra abusos y moderación

Dream tiene medidas para que el servicio siga siendo gratis, justo y seguro, y para aplicar las normas de uso de los Términos (apartado 6). Esto es lo que hacen, y qué datos usan.

**Huella de tu conexión (no tu IP).** Para detectar abusos, como usos anormales desde una misma conexión o varias cuentas para saltarse un baneo, calculamos de tu dirección IP una *huella*: un código que se obtiene con un secreto que solo conoce el servidor y del que no se puede recuperar la IP. **Nunca guardamos ni registramos tu IP en claro.** Finalidad: seguridad y prevención de abuso. Base legal: interés legítimo. La huella se guarda **30 días** y se borra sola; también se borra con tu cuenta. (Si tu cuenta pasa por la observación de la que hablamos más abajo, las huellas anotadas en ese caso se conservan mientras dure el caso y, como mucho, hasta que se borre tu cuenta.) Una misma huella solo indica la misma red, no la misma persona (un colegio, una biblioteca o una casa comparten conexión), por eso nunca sirve por sí sola para castigar a alguien en una red compartida.

**Moderación automática y revisión humana.** Algunos límites son automáticos, como bloquear 24 horas el uso de la IA desde una conexión con un uso anormal o limitar unas horas una cuenta que satura el chat. Cualquier sanción de 7 días o más (baneos) **la decide una persona**: el sistema solo la propone. La única excepción posible es el baneo de 7 días a una cuenta nueva que entra repetidamente desde la conexión de una cuenta baneada tras 2 días de observación; **solo se aplica si Carlos lo activa**, solo en conexiones de tamaño de hogar (nunca en redes compartidas) y siempre con aviso y apelación atendida por una persona.

**Revisión de mensajes con IA.** Cuando está activada, un filtro previo busca en tus mensajes señales de incumplir las normas (insultos, intentos de saltarse las reglas de la IA, datos de otras personas…). **Solo si el filtro marca un mensaje**, ese mensaje se envía a Groq (nuestro proveedor de IA) para clasificarlo; el resto no se envía por este motivo. El resultado nunca decide solo una sanción dura. **No guardamos el texto de tus mensajes en los registros de moderación**, solo el código de la norma y el identificador de la conversación. Si un mensaje habla de que te sientes mal o en peligro, no es una infracción: Dream te responde con apoyo (024 y 112) y no te sanciona.

**Qué ves y cómo reclamar.** Verás qué norma se ha incumplido, hasta cuándo dura y cómo reclamar. Puedes reclamar escribiendo a **hellodream@edudream.es** (y, cuando esté disponible, desde el formulario «Reclamar» de la app): lo revisa una persona y te respondemos en un máximo de **30 días**. Si nos equivocamos, quitamos la sanción.

**Quién puede ver esto.** Solo la persona administradora de Dream, con doble factor de seguridad. Ve el mínimo de datos (un identificador corto y tu correo parcialmente tapado, nunca tu IP) y **cada acción queda anotada en un registro que no se puede modificar ni borrar**.

Las partes de esta sección que dependen de funciones apagadas hasta que Carlos las active (la moderación automática, la revisión de mensajes con IA y el baneo por evasión) solo se aplican **cuando están activadas**.

## 12. Cambios

Si cambiamos esta política de forma importante (por ejemplo al añadir pagos o nuevas funciones), te lo avisaremos en la app antes de que se aplique.
`;
