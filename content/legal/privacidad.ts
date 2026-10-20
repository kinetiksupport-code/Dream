export const privacidad = String.raw`# Política de privacidad

*Última actualización: 20 de octubre de 2026 (versión provisional).*

## 1. Quién es el responsable

El responsable del tratamiento de tus datos es **Carlos Sánchez**, a título particular, que ofrece Dream Education ("Dream"). Puedes escribirle a **hellodream@edudream.es** para cualquier duda, para ejercer tus derechos o para pedir que borremos tus datos.

## 2. Qué datos tratamos y para qué

| Datos | De dónde salen | Para qué | Base legal |
| --- | --- | --- | --- |
| Correo y nombre de tu cuenta de Google | Inicio de sesión con Google | Crear y proteger tu cuenta | Ejecución del servicio |
| Nombre, fecha de nacimiento y nivel educativo | Lo escribes al empezar | Adaptar la ayuda a tu curso y saber si eres menor de 14 años | Ejecución del servicio y obligación legal (menores) |
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
2. **Te presentas.** Nos dices tu nombre, tu fecha de nacimiento y tu nivel (por ejemplo 2.º de Bachillerato). La fecha de nacimiento solo sirve para calcular tu franja de edad (menor de 14, de 14 a 17 o adulto) y saber si hace falta tutor; no la usamos para nada más.
3. **Escribes un mensaje al tutor.** Tu navegador lo envía por una conexión cifrada a nuestro servidor en Supabase. El servidor comprueba que eres tú, mira que no te hayas pasado de los límites de uso y guarda tu mensaje en tu conversación.
4. **El servidor pide la respuesta a la IA.** Envía a Groq (o a Cloudflare Workers AI, si Groq no responde o si usas el modo «Pensar más») el texto de tu mensaje, la parte reciente de esa conversación, el texto de los archivos que hayas adjuntado y las instrucciones internas del tutor. No envía tu correo ni tu nombre. La respuesta vuelve a nuestro servidor, se guarda en tu historial y se te muestra poco a poco.
5. **Si hace falta buscar en internet,** el servidor envía a Tavily una consulta corta (máximo 300 caracteres) que escribe el propio tutor. Como esa consulta puede reflejar lo que preguntaste, evita poner nombres, teléfonos o datos privados en tus preguntas. Las webs consultadas aparecen en «Buscado en la web»; para mostrar su logo, tu navegador pide a Google el icono de cada web con solo su dirección (por ejemplo, «wikipedia.org»), nunca tu pregunta.
6. **Subes un archivo.** El servidor lo abre, extrae el texto (las imágenes se leen con un modelo de IA de Groq) y guarda solo ese texto. El archivo original no se guarda. Ese texto se usa para responderte y para crear tus tests y simulacros.
7. **Preparas un examen.** Guardamos el título, la asignatura, la fecha, los temas, tus dificultades y objetivo, el plan que genera la IA, y tus respuestas y resultados de cada test o simulacro.
8. **Controlamos el uso.** Para que el servicio gratuito aguante, apuntamos cuántas peticiones, búsquedas y "tokens" (unidades de texto) gastas por minuto y día, y su coste aproximado. También apuntamos cuántos tokens gastas en cada modo de IA (Rápido, Normal o Pensar más) dentro de tu ventana de 5 horas, y aparte los que gasta el proveedor de respaldo (Cloudflare) cuando responde en lugar de Groq. Con ello se forma la cola de espera y se bloquea, de forma automática y temporal, a quien abusa del sistema. Estos registros no contienen el texto de tus mensajes.
9. **Estadísticas y errores (solo si lo aceptas).** Se envía un identificador aleatorio y eventos genéricos (por ejemplo "se abrió un examen"), nunca el contenido de tus mensajes ni de tus archivos, sin grabar la pantalla y sin localizarte por IP. Puedes apagarlo en Ajustes y se deja de enviar.
10. **Borrado.** Si borras el historial en Ajustes, se eliminan tus conversaciones y sus mensajes. Si pides eliminar la cuenta, se borran tu perfil, tus exámenes, planes, tests, archivos extraídos y conversaciones.

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
- **Groq** (proveedor de inteligencia artificial de los modos «Rápido» y «Normal»). Recibe el texto de tus mensajes, el contenido extraído de tus archivos y el contexto necesario para responder. Tus mensajes **no incluyen tu correo ni tu nombre**.
- **Cloudflare** (Cloudflare Workers AI, proveedor de inteligencia artificial). Se usa para el modo «Pensar más» y como respaldo cuando Groq no responde. Recibe lo mismo que Groq: el texto de tu mensaje, una parte más corta de la conversación, el contenido extraído de tus archivos y las instrucciones del tutor, **sin tu correo ni tu nombre**. No conocemos la región en la que ejecuta el modelo, así que puede tratar tus mensajes fuera de la Unión Europea. Según Cloudflare, no usa este contenido para entrenar modelos de IA y no lo guarda cuando ya no lo necesita para responder.
- **Tavily** (búsqueda web). Solo recibe la consulta de búsqueda que el tutor genera cuando necesita verificar un dato actual.
- **Google** (iconos de webs). Cuando abres una respuesta con búsqueda, tu navegador pide a Google el logo de cada web consultada. Google recibe la dirección de esa web y la de tu conexión (IP), igual que al visitar cualquier página; no recibe tu pregunta, tu nombre ni tu correo.
- **PostHog** y **Sentry** (estadísticas y errores), solo si tú lo activas en Ajustes. Funcionan de forma anónima: sin grabación de pantalla, sin contenido de tus mensajes y sin geolocalización por IP.

No cedemos tus datos a nadie más salvo obligación legal.

## 5. Transferencias internacionales

Algunos de estos proveedores (por ejemplo Groq, Cloudflare, Vercel, Tavily, Google, PostHog o Sentry) pueden tratar datos fuera de la Unión Europea, principalmente en Estados Unidos. En ese caso la protección se apoya en el Marco de Privacidad de Datos UE-EEUU o en cláusulas contractuales tipo. En el caso de Cloudflare Workers AI no sabemos en qué región se ejecuta el modelo de IA, así que tus mensajes pueden tratarse fuera de la Unión Europea (transferencia internacional).

## 6. Inteligencia artificial

Para responderte, Dream envía tus mensajes y el texto de tus archivos a proveedores de IA y de búsqueda (Groq, Cloudflare y Tavily). Por eso, al registrarte te pedimos una casilla propia, sin marcar de antemano: "Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme". Guardamos la fecha y hora. Puedes retirar este permiso cuando quieras escribiendo a hellodream@edudream.es; sin él no podrás usar el tutor de IA.

Las respuestas las genera un modelo de IA. **Puede equivocarse o inventar datos**: contrasta lo importante con tus apuntes, tu libro o tu profesor. No se toman decisiones automáticas con efectos legales sobre ti. Los tests y simulacros se corrigen automáticamente solo como ayuda para estudiar; la nota que ves no es una nota oficial.

## 7. Menores de edad

En España, un menor puede dar su consentimiento para tratar sus datos a partir de los **14 años**. Si tienes **menos de 14**, necesitas la autorización de tu padre, madre o tutor legal. Dream te pregunta tu fecha de nacimiento para saberlo y, para usar Dream, tienes que marcar una casilla que dice: "Mi padre, madre o tutor legal me ha dado permiso para usar Dream y acepta la Política de privacidad y los Términos y condiciones". Guardamos la fecha y hora en que la marcas. Esa casilla es una declaración tuya; no verificamos la identidad del tutor. Los padres o tutores pueden escribirnos a hellodream@edudream.es para pedir el acceso o la eliminación de los datos de su hijo o hija.

## 8. Cuánto tiempo guardamos los datos

- Tu cuenta, conversaciones, textos de archivos y exámenes se guardan **mientras tengas cuenta**.
- Puedes **borrar todo tu historial de conversaciones** desde Ajustes cuando quieras.
- Para eliminar tu cuenta y todos tus datos, escríbenos a **hellodream@edudream.es** y lo haremos en un máximo de **30 días**.
- Los registros técnicos de uso y abuso se conservan solo el tiempo necesario para su finalidad.
- Las copias de seguridad del proveedor pueden conservar datos un tiempo limitado después de borrarlos.

## 9. Tus derechos

Puedes pedirnos **acceso, rectificación, supresión, oposición, limitación y portabilidad** de tus datos, y retirar tu consentimiento en cualquier momento (por ejemplo las estadísticas desde Ajustes). Escríbenos a **hellodream@edudream.es** y te responderemos en un máximo de un mes. Si no estás conforme, puedes reclamar ante la **Agencia Española de Protección de Datos** (www.aepd.es).

## 10. Seguridad

La conexión va cifrada (HTTPS). Cada usuario solo puede leer sus propios datos (reglas de seguridad por fila en la base de datos), las escrituras pasan por un servidor con comprobación de identidad, y las claves de los proveedores de IA no están en tu navegador. Ningún sistema es infalible: avisaremos de cualquier brecha según exige la ley.

## 11. Cambios

Si cambiamos esta política de forma importante (por ejemplo al añadir pagos o nuevas funciones), te lo avisaremos en la app antes de que se aplique.
`;
