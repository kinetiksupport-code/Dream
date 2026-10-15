// Texto legal de Carlos (Claude Doc «Dream: política de privacidad y términos y
// condiciones»), copiado tal cual. Solo se han quitado las notas internas para
// Carlos y los títulos pasan de ### a ## porque el título de la página es el h1.
// Los marcadores entre corchetes ([FECHA], [X meses]…) se dejan a propósito.

export const PRIVACY_MD = `*Última actualización: [FECHA]*

## 1. Quién es el responsable

El responsable del tratamiento de tus datos es **Carlos Sánchez**, a título particular, que ofrece Dream Education ("Dream"). Puedes escribirle a **hellodream@edudream.es** para cualquier duda, para ejercer tus derechos o para pedir que borremos tus datos.

## 2. Qué datos tratamos y para qué

| Datos | De dónde salen | Para qué | Base legal |
|---|---|---|---|
| Correo y nombre de tu cuenta de Google | Inicio de sesión con Google | Crear y proteger tu cuenta | Ejecución del servicio |
| Nombre, fecha de nacimiento y nivel educativo | Lo escribes al empezar | Adaptar la ayuda a tu curso y saber si eres menor de 14 años | Ejecución del servicio y obligación legal (menores) |
| Conversaciones con el tutor y tus mensajes | Lo que escribes o dictas | Responderte y guardar tu historial | Ejecución del servicio |
| Archivos que subes (fotos, PDF, Word, PowerPoint, Excel, texto) | Los subes tú, desde el dispositivo o escaneando el QR con el móvil | Leer su contenido para ayudarte a estudiar | Ejecución del servicio |
| Exámenes, temas, fechas, planes de estudio, tests, respuestas y notas | Lo creas o lo genera Dream | Preparar tus exámenes y simulacros | Ejecución del servicio |
| Datos técnicos de uso: cantidad de mensajes, tokens y coste por usuario, bloqueos por abuso | Se generan al usar la IA | Evitar abusos y mantener el servicio gratuito dentro de un uso razonable | Interés legítimo |
| Estadísticas anónimas y errores | Solo si lo activas en Ajustes | Mejorar Dream | Tu consentimiento |
| Audio de tu micrófono (dictado por voz) | Solo cuando pulsas el botón de voz | Convertir tu voz en texto | Tu consentimiento (el navegador te lo pide) |

No pedimos teléfono, dirección, DNI ni datos de pago. Hoy Dream no cobra nada.

**Lo que no hacemos:** no vendemos tus datos, no hay publicidad, no hacemos perfiles comerciales, no usamos tus conversaciones ni tus archivos para entrenar modelos de IA ni para mejorar Dream (solo se usan para ayudarte a ti) y no guardamos grabaciones de tu voz.

## Qué pasa con tus datos, paso a paso

1. **Entras con Google.** Google confirma quién eres y nos da tu correo (y tu nombre si lo comparte). Nunca vemos tu contraseña de Google. Con eso se crea tu perfil en nuestra base de datos.
1. **Te presentas.** Nos dices tu nombre, tu fecha de nacimiento y tu nivel (por ejemplo 2.º de Bachillerato). La fecha de nacimiento solo sirve para calcular tu franja de edad (menor de 14, de 14 a 17 o adulto) y saber si hace falta tutor; no la usamos para nada más.
1. **Escribes un mensaje al tutor.** Tu navegador lo envía por una conexión cifrada a nuestro servidor en Supabase. El servidor comprueba que eres tú, mira que no te hayas pasado de los límites de uso y guarda tu mensaje en tu conversación.
1. **El servidor pide la respuesta a la IA.** Envía a Groq el texto de tu mensaje, la parte reciente de esa conversación, el texto de los archivos que hayas adjuntado y las instrucciones internas del tutor. No envía tu correo ni tu nombre. La respuesta vuelve a nuestro servidor, se guarda en tu historial y se te muestra poco a poco.
1. **Si hace falta buscar en internet,** el servidor envía a Tavily una consulta corta (máximo 300 caracteres) que escribe el propio tutor. Como esa consulta puede reflejar lo que preguntaste, evita poner nombres, teléfonos o datos privados en tus preguntas.
1. **Subes un archivo.** El servidor lo abre, extrae el texto (las imágenes se leen con un modelo de IA de Groq) y guarda solo ese texto. El archivo original no se guarda. Ese texto se usa para responderte y para crear tus tests y simulacros.
1. **Preparas un examen.** Guardamos el título, la asignatura, la fecha, los temas, tus dificultades y objetivo, el plan que genera la IA, y tus respuestas y resultados de cada test o simulacro.
1. **Controlamos el uso.** Para que el servicio gratuito aguante, apuntamos cuántas peticiones, búsquedas y "tokens" (unidades de texto) gastas por minuto y día, y su coste aproximado. Con ello se forma la cola de espera y se bloquea, de forma automática y temporal, a quien abusa del sistema. Estos registros no contienen el texto de tus mensajes.
1. **Estadísticas y errores (solo si lo aceptas).** Se envía un identificador aleatorio y eventos genéricos (por ejemplo "se abrió un examen"), nunca el contenido de tus mensajes ni de tus archivos, sin grabar la pantalla y sin localizarte por IP. Puedes apagarlo en Ajustes y se deja de enviar.
1. **Borrado.** Si borras el historial en Ajustes, se eliminan tus conversaciones y sus mensajes. Si pides eliminar la cuenta, se borran tu perfil, tus exámenes, planes, tests, archivos extraídos y conversaciones.

## Quién puede ver tus datos

- **Tú**, y nadie más a través de la app: la base de datos solo deja leer a cada usuario lo suyo.
- **El responsable (Carlos Sánchez)** tiene acceso técnico a la base de datos por ser quien la administra. Solo mirará contenido de conversaciones si es imprescindible para resolver un fallo que tú nos pidas arreglar, para investigar un abuso grave o por obligación legal.
- **Los proveedores** de la sección 4, solo para lo que hacen (alojar, procesar la respuesta de IA, buscar). No pueden usar tus datos para fines propios según sus contratos de tratamiento.
- **Autoridades**, solo si una ley o un juez lo exige.

## Qué no es de la IA

La IA no decide por sí sola nada con efectos legales sobre ti. La única decisión automática es el límite o bloqueo temporal por uso excesivo, y puedes pedir que lo revisemos escribiendo a hellodream@edudream.es.

## 3. Archivos que subes

Cuando subes un archivo, Dream extrae su texto (si es una imagen, un modelo de IA la describe y lee) y **guarda ese texto extraído** asociado a tu conversación. **No guardamos el archivo original.** Los archivos pueden contener datos de terceros (por ejemplo apuntes con nombres): sube solo lo que sea tuyo o que tengas derecho a usar.

## 4. Con quién compartimos los datos (encargados del tratamiento)

Usamos proveedores que tratan datos por nuestra cuenta, con contrato de encargado cuando es aplicable:

- **Supabase** (base de datos, autenticación y servidor de la aplicación). Región del proyecto: **[REGIÓN, p. ej. UE]**.
- **Vercel** (alojamiento de la web). Puede registrar datos técnicos de conexión como la dirección IP.
- **Google** (inicio de sesión con tu cuenta de Google).
- **Groq** (proveedor de inteligencia artificial que ejecuta el modelo Qwen). Recibe el texto de tus mensajes, el contenido extraído de tus archivos y el contexto necesario para responder. Tus mensajes **no incluyen tu correo ni tu nombre**.
- **Tavily** (búsqueda web). Solo recibe la consulta de búsqueda que el tutor genera cuando necesita verificar un dato actual.
- **PostHog** y **Sentry** (estadísticas y errores), solo si tú lo activas en Ajustes. Funcionan de forma anónima: sin grabación de pantalla, sin contenido de tus mensajes y sin geolocalización por IP.

No cedemos tus datos a nadie más salvo obligación legal.

## 5. Transferencias internacionales

Algunos de estos proveedores (por ejemplo Groq, Vercel, Tavily, PostHog o Sentry) pueden tratar datos fuera de la Unión Europea, principalmente en Estados Unidos. En ese caso la protección se apoya en el Marco de Privacidad de Datos UE-EEUU o en cláusulas contractuales tipo.

## 6. Inteligencia artificial

Para responderte, Dream envía tus mensajes y el texto de tus archivos a proveedores de IA y de búsqueda (Groq y Tavily). Por eso, al registrarte te pedimos una casilla propia, sin marcar de antemano: "Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme". Guardamos la fecha y hora. Puedes retirar este permiso cuando quieras escribiendo a hellodream@edudream.es; sin él no podrás usar el tutor de IA. Las respuestas las genera un modelo de IA. Puede equivocarse o inventar datos: contrasta lo importante con tus apuntes, tu libro o tu profesor. No se toman decisiones automáticas con efectos legales sobre ti. Los tests y simulacros se corrigen automáticamente solo como ayuda para estudiar; la nota que ves no es una nota oficial.

## 7. Menores de edad

En España, un menor puede dar su consentimiento para tratar sus datos a partir de los **14 años**. Si tienes **menos de 14**, necesitas la autorización de tu padre, madre o tutor legal. Dream te pregunta tu fecha de nacimiento para saberlo y para usar Dream tienes que marcar una casilla que dice: "Mi padre, madre o tutor legal me ha dado permiso para usar Dream y acepta la Política de privacidad y los Términos y condiciones". Guardamos la fecha y hora en que la marcas. Esa casilla es una declaración tuya; no verificamos la identidad del tutor. Los padres o tutores pueden escribirnos a hellodream@edudream.es para pedir el acceso o la eliminación de los datos de su hijo o hija.

## 8. Cuánto tiempo guardamos los datos

- Tu cuenta, conversaciones, textos de archivos y exámenes se guardan **mientras tengas cuenta**.
- Puedes **borrar todo tu historial de conversaciones** desde Ajustes cuando quieras.
- Para eliminar tu cuenta y todos tus datos, escríbenos a **hellodream@edudream.es** y lo haremos en un máximo de **30 días**.
- Los registros técnicos de uso y abuso se conservan **[X meses]**.
- Las copias de seguridad del proveedor pueden conservar datos un tiempo limitado después de borrarlos.

## 9. Tus derechos

Puedes pedirnos **acceso, rectificación, supresión, oposición, limitación y portabilidad** de tus datos, y retirar tu consentimiento en cualquier momento (por ejemplo las estadísticas desde Ajustes). Escríbenos a **hellodream@edudream.es** y te responderemos en un máximo de un mes. Si no estás conforme, puedes reclamar ante la **Agencia Española de Protección de Datos** (www.aepd.es).

## 10. Seguridad

La conexión va cifrada (HTTPS). Cada usuario solo puede leer sus propios datos (reglas de seguridad por fila en la base de datos), las escrituras pasan por un servidor con comprobación de identidad, y las claves de los proveedores de IA no están en tu navegador. Ningún sistema es infalible: avisaremos de cualquier brecha según exige la ley.

## 11. Cambios

Si cambiamos esta política de forma importante (por ejemplo al añadir pagos o nuevas funciones), te lo avisaremos en la app antes de que se aplique.
`;

export const TERMS_MD = `*Última actualización: [FECHA]*

## 1. Quién ofrece Dream

Dream Education ("Dream") es un servicio ofrecido por **Carlos Sánchez**, a título particular, contacto **hellodream@edudream.es**. Al crear una cuenta o usar Dream aceptas estos términos y la Política de privacidad.

## 2. Qué es Dream

Dream es una web (instalable como app) con un tutor de inteligencia artificial que te ayuda a estudiar: explica, hace preguntas, da pistas, organiza tus exámenes y genera tests y simulacros a partir de tus apuntes. Es una **ayuda para estudiar**, no un centro educativo ni un sustituto de tus profesores. **El uso es personal:** de momento no está pensado para que un centro o un profesor lo use con su clase.

## 3. Tu cuenta

- Entras con tu cuenta de Google. Eres responsable de mantenerla segura.
- Debes dar datos verdaderos, sobre todo tu fecha de nacimiento. Para usar el tutor debes marcar también una casilla aparte: "Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme" (ver Política de privacidad). Sin ella no podemos responderte, así que no podrás usar el chat.
- Una cuenta es personal: no la compartas.
- **Si tienes menos de 14 años,** para crear la cuenta debes marcar la casilla: "Mi padre, madre o tutor legal me ha dado permiso para usar Dream y acepta la Política de privacidad y los Términos y condiciones".
- **Esa casilla es una declaración formal y vinculante.** Al marcarla confirmas que es verdad y que tu tutor ha leído y aceptado estos textos. Si no lo es, estarás incumpliendo estos términos: podremos cerrar la cuenta sin aviso y borrar sus datos, y la responsabilidad por el uso indebido será de quien haya dado la autorización falsa.
- **Si eres tutor legal** de un menor de 14 años que use Dream, aceptas estos términos en su nombre, eres responsable de supervisar su uso y puedes pedir en cualquier momento que cerremos su cuenta y borremos sus datos escribiendo a hellodream@edudream.es.
- **Menores de 14 años: normas más estrictas.** Su uso está pensado solo para estudiar, no pueden subir fotos de personas ni datos personales, y podemos aplicar límites o bloqueos con más rapidez si se incumple cualquier norma.
- Si tienes 14 o 15 años, puedes aceptar tú mismo; de todos modos te recomendamos hablarlo con tu familia.

## 4. Dream es gratis, con límites de uso

Dream es **gratuito** y hoy no se cobra nada. El plan gratuito no tiene un número fijo de mensajes, pero sí **límites de uso razonable** para que el servicio funcione para todos. Cuando hay mucha demanda puedes tener que esperar en una **cola** o volver más tarde, y la IA puede dejar de estar disponible unas horas o hasta el día siguiente. Podemos cambiar estos límites. Si en el futuro se añade un plan de pago, te lo comunicaremos antes y no se te cobrará nada sin que lo aceptes expresamente.

## 5. Cómo ayuda la IA (y sus límites)

- La IA **puede equivocarse, inventar datos o no estar actualizada.** Verifica siempre lo importante con tus apuntes, tu libro o tu profesor.
- Dream está pensado para que aprendas: **no te da los ejercicios resueltos**, te guía con pistas y preguntas.
- Las notas de los tests y simulacros son orientativas. **No son notas oficiales** ni garantizan resultados en ningún examen real. Dream no te asegura una nota concreta.
- Dream no ofrece asesoramiento médico, legal ni psicológico. Si te sientes mal, habla con un adulto de confianza o llama al 024 (atención a la conducta suicida) o al 112 en una emergencia.

## 6. Uso aceptable

Estas normas existen para que Dream siga siendo gratis, justo y seguro para todos. Al usarlo te comprometes a cumplirlas.

**A. Usa Dream para aprender**

- Puedes pedir explicaciones, pistas, ejemplos, resúmenes de tus apuntes, tests y simulacros.
- Dream no te dará el ejercicio resuelto: si intentas que lo haga con trucos (decir que eres el profesor, pedir "solo la solución", cambiar de idioma, pedirlo por partes), no estás usando el servicio como está pensado.
- **Está prohibido usar Dream durante un examen oficial, una prueba evaluable o un control**, y para entregar como propio un trabajo que te piden hacer sin ayuda. Cumplir las normas de tu centro es cosa tuya.

**B. Tu cuenta**

- Una persona, una cuenta. No compartas tu acceso ni uses la cuenta de otra persona.
- No crees varias cuentas para saltarte los límites de uso, la cola de espera o un bloqueo.
- Mantén tu cuenta de Google segura. Lo que ocurra desde tu cuenta lo asumes tú.
- Da una fecha de nacimiento real. Mentir sobre la edad para evitar la autorización de un tutor incumple estos términos.

**C. Lo que escribes y subes**

- Sube solo contenido tuyo o que tengas derecho a usar (tus apuntes, tus fotos, exámenes pasados que te hayan dado). No subas libros o materiales protegidos por derechos de autor que no tengas permiso para usar.
- No subas datos personales de otras personas (nombres, teléfonos, fotos de compañeros, listas de clase), ni información sensible tuya o ajena (salud, religión, ideología) que no sea necesaria para estudiar.
- No subas contenido ilegal, violento, sexual, discriminatorio, acosador o que incite al odio o a hacerse daño.
- Formatos y tamaños: imágenes, PDF (hasta 80 páginas), Word, PowerPoint, Excel, texto, Markdown, código, CSV y JSON; imágenes y documentos hasta 8 MB y texto hasta 500 KB. No subas archivos con virus o diseñados para dañar el sistema.

**D. Respeto y seguridad**

- Trata con respeto a todo el mundo, también al tutor de IA. Los insultos o el acoso no tienen cabida.
- No intentes que la IA ignore sus normas, revele sus instrucciones internas o genere contenido dañino ("jailbreak").
- No intentes acceder a datos de otros usuarios, buscar fallos para explotarlos ni saltarte la seguridad. Si encuentras un fallo de seguridad, avísanos en hellodream@edudream.es y no lo aproveches.
- Si te sientes mal o en peligro, Dream no es un servicio de emergencias: habla con un adulto de confianza, llama al 024 o al 112.

**E. Uso razonable del servicio**

- No envíes peticiones automatizadas (bots, scripts, scraping) ni sobrecargues el servicio a propósito.
- No uses Dream para fines comerciales: no lo revendas, no lo integres en otro producto ni lo uses para dar clases de pago sin permiso por escrito.
- Respeta la cola de espera y los límites diarios. No intentes esquivarlos.
- No uses Dream para generar spam, desinformación o contenido que se haga pasar por otra persona.

**F. Voz y micrófono**

- Usa el dictado solo cuando estés solo o sin que se oigan datos de otras personas. No grabes a nadie sin su permiso.

**G. Qué pasa si no se cumplen las normas**

Intentaremos ser proporcionados. Cuando el sistema (límites automáticos y filtros) o una revisión nuestra detecta una infracción, se aplica esta tabla. Las duraciones son orientativas y podemos subirlas o bajarlas según la gravedad.

| Infracción | 1.ª vez | Reincidencia |
|---|---|---|
| Insultos, acoso o lenguaje ofensivo | Aviso | Limitación 24 h → baneo 7 días → baneo permanente |
| Trucos para que la IA dé la solución o ignore sus normas ("jailbreak") | Aviso | Limitación 24 h → baneo 7 días → baneo 30 días |
| Spam, mensajes repetidos o saturar el chat | Limitación automática de minutos u horas | Baneo 24 h → baneo 7 días |
| Bots, scripts, scraping o sobrecargar el servicio | Baneo 7 días | Baneo permanente |
| Varias cuentas para saltarse límites, cola o un baneo | Cierre de las cuentas extra y baneo 7 días | Baneo permanente de todas |
| Compartir la cuenta o mentir sobre la edad | Suspensión hasta verificar | Baneo 30 días |
| Usar Dream en un examen oficial o prueba evaluable (cuando lo digas tú o sea evidente) | Aviso | Baneo 7 días → baneo 30 días |
| Subir material con derechos de autor sin permiso | Borrado del archivo y aviso | Baneo 7 días → baneo permanente |
| Subir datos personales de otras personas | Borrado del archivo y aviso | Baneo 7 días |
| Contenido ilegal, violento, sexual, discriminatorio o que incite a hacerse daño | Baneo permanente inmediato | Se puede avisar a las autoridades si la ley lo exige |
| Intentar acceder a datos de otros usuarios o hackear el sistema | Baneo permanente inmediato | Se puede avisar a las autoridades |
| Uso comercial o reventa sin permiso por escrito | Aviso y baneo 7 días | Baneo permanente |

**Detalles importantes**

- **Aviso:** te lo mostramos en la app o te escribimos al correo de tu cuenta, indicando qué norma has incumplido.
- **Limitación:** menos mensajes o archivos por día, o esperar en cola, durante un tiempo.
- **Baneo:** no puedes entrar en la cuenta durante el plazo indicado. Si es permanente, se cierra la cuenta y se borran sus datos, salvo lo que la ley nos obligue a conservar.
- **Detección:** algunos bloqueos son automáticos (por ejemplo por uso excesivo); el resto los decide una persona tras revisar la situación, sin leer tus conversaciones más de lo imprescindible.
- **Saltarse un baneo** (por ejemplo con otra cuenta) alarga la sanción y puede hacerla permanente.
- **Reclamar:** si crees que es un error, escribe a hellodream@edudream.es con el correo de tu cuenta. Lo revisaremos lo antes posible y, en todo caso, en un máximo de 30 días. Si nos equivocamos, quitamos el baneo.
- En casos muy graves podemos suspender la cuenta de inmediato y sin aviso previo.

## 7. Tu contenido

Lo que escribes y subes sigue siendo tuyo. Nos das permiso, solo para prestarte el servicio, a guardarlo y enviarlo a los proveedores de IA y de búsqueda que se explican en la Política de privacidad. Garantizas que tienes derecho a subirlo. No usamos tu contenido para anunciarte nada, ni para entrenar modelos ni para mejorar Dream.

## 8. Voz y micrófono

Dream permite **dictar con la voz** usando el reconocimiento de voz de tu **navegador**. Solo se activa cuando pulsas el botón del micrófono y tu navegador te pide permiso. Importante:

- Dream **no graba ni guarda tu audio**. Solo recibe el texto resultante.
- El audio lo procesa **tu navegador o su fabricante** (por ejemplo, Chrome puede enviarlo a servidores de Google; Safari, a los de Apple). Eso se rige por la política de privacidad de tu navegador, no por la nuestra.
- No está disponible en todos los navegadores y dispositivos.
- Puedes retirar el permiso del micrófono cuando quieras en la configuración de tu navegador. Evita dictar datos personales o de otras personas.

## 9. Propiedad intelectual

La marca, el diseño y el código de Dream pertenecen a **Carlos Sánchez** o a sus licenciantes. Puedes usar Dream para tu estudio personal; no puedes copiarlo, revenderlo ni usarlo para crear un servicio competidor.

## 10. Disponibilidad y cambios

Dream se ofrece "tal cual", sin garantía de funcionar sin interrupciones. Puede haber mantenimientos, fallos o cambios, y podemos modificar o retirar funciones. Intentaremos avisarte de los cambios importantes.

## 11. Responsabilidad

Dream es una herramienta de apoyo y se ofrece gratis y "tal cual". **No garantizamos que las respuestas sean correctas, completas o actuales, ni que consigas una nota, un aprobado o un resultado concreto.** En la medida que permita la ley, no nos hacemos responsables de: decisiones que tomes basadas en lo que diga la IA; tus resultados en exámenes o trabajos; sanciones de tu centro por usar Dream de forma indebida; pérdida de datos, errores, interrupciones o retrasos del servicio; ni de fallos de los proveedores que usamos (Google, Supabase, Vercel, Groq, Tavily). Tu responsabilidad es contrastar lo importante. Esto no limita los derechos que la ley te reconoce como consumidor ni nuestra responsabilidad por dolo o negligencia grave.

## 12. Baja de la cuenta

Puedes dejar de usar Dream cuando quieras y borrar tu historial desde Ajustes. Para eliminar la cuenta, escríbenos a **hellodream@edudream.es**. Podemos suspender o cerrar cuentas que incumplan estos términos.

## 13. Cambios en los términos

Si los cambiamos de forma importante, te avisaremos en la app. Seguir usándola después significa que aceptas los cambios; si no estás de acuerdo, puedes dejar de usarla.

## 14. Ley aplicable

Se aplica la ley española. Si eres consumidor, también tienes los derechos que te reconoce la ley de tu lugar de residencia, y puedes acudir a los tribunales que te correspondan. Para consultas o reclamaciones: **hellodream@edudream.es**.
`;

export const COOKIES_MD = `Dream guarda pequeños datos en tu navegador. Los necesarios para que funcione no requieren consentimiento; los de estadísticas solo se activan si tú lo aceptas en Ajustes.

| Qué | Para qué | Tipo | Consentimiento |
|---|---|---|---|
| Sesión de inicio de sesión (Supabase / Google) | Mantenerte conectado | Necesario | No hace falta |
| \`dream-theme\` (localStorage) | Recordar claro u oscuro | Necesario | No hace falta |
| \`dream-login-pending\` (sessionStorage) | Completar el inicio de sesión | Necesario | No hace falta |
| Preferencias de privacidad (localStorage) | Recordar tu elección sobre estadísticas y errores | Necesario | No hace falta |
| Caché de la app instalable (service worker) | Cargar más rápido y mostrar una página sin conexión; solo guarda archivos de la app, no tus conversaciones | Necesario | No hace falta |
| Identificador anónimo de PostHog (localStorage) | Estadísticas anónimas de uso | Analítico | **Sí**, desactivado por defecto |
| Informes de errores de Sentry | Detectar fallos | Diagnóstico | **Sí**, desactivado por defecto |

Dream no usa cookies de publicidad ni de seguimiento entre webs. Los archivos que subes se mantienen solo en memoria mientras los preparas y no se guardan en tu dispositivo.

Puedes borrar estos datos desde los ajustes de tu navegador, y cambiar tu elección de estadísticas y errores en cualquier momento en **Ajustes > Datos de uso**.
`;

// Aviso legal (LSSI, art. 10). Solo usa datos del documento de Carlos; el NIF y
// el domicilio quedan como huecos visibles hasta que Carlos los rellene.
export const LEGAL_NOTICE_MD = `*Última actualización: [FECHA]*

En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI), estos son los datos de quien ofrece este sitio web.

## 1. Titular

- **Titular:** Carlos Sánchez, a título particular
- **Servicio:** Dream Education ("Dream")
- **NIF:** [NIF]
- **Domicilio:** [DOMICILIO]
- **Correo electrónico:** hellodream@edudream.es
- **Sitio web:** www.edudream.es

## 2. Objeto

Dream es una web (instalable como app) con un tutor de inteligencia artificial que te ayuda a estudiar. Es gratuito y de uso personal.

## 3. Condiciones de uso

El uso de Dream se rige por los [Términos y condiciones](/terminos). Al crear una cuenta o usar Dream los aceptas.

## 4. Privacidad y cookies

Cómo tratamos tus datos se explica en la [Política de privacidad](/privacidad). Lo que Dream guarda en tu navegador se explica en [Almacenamiento en el dispositivo y cookies](/cookies).

## 5. Propiedad intelectual

La marca, el diseño y el código de Dream pertenecen a **Carlos Sánchez** o a sus licenciantes. Puedes usar Dream para tu estudio personal; no puedes copiarlo, revenderlo ni usarlo para crear un servicio competidor.

## 6. Ley aplicable

Se aplica la ley española. Para consultas o reclamaciones: **hellodream@edudream.es**.
`;
