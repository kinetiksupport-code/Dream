# Evaluación de impacto simplificada: moderación y antiabuso con IP y menores

> **BORRADOR para revisión de un abogado o gestor de protección de datos.** Lo ha escrito el equipo técnico a partir del código real. No sustituye a una EIPD formal si el profesional la considera necesaria.

Base: `docs/MODERACION.md`, `docs/PANEL_ADMIN.md`, migraciones `20261022…` a `20261025…` y los módulos `moderation.mjs`, `content-moderation.mjs` y `admin.mjs` de `dream-api`.

## 1. Descripción del tratamiento

Dream es una web de estudio con IA para mayores de 14 años, con muchos menores de 18. Para aplicar las normas de uso (Términos §6, tabla G) y evitar abusos hay cinco tratamientos:

1. **Antiabuso por tasa:** se cuentan las peticiones que gastan IA por huella de conexión y por cuenta; ante un uso anormal se bloquea la conexión 24 h o se limita la cuenta.
2. **Cuentas nuevas desde la conexión de una cuenta baneada:** observación de 2 días y, si se cumplen las condiciones, baneo de 7 días.
3. **Revisión de mensajes con IA:** un filtro de patrones y, solo para lo marcado, un clasificador (Groq).
4. **Baneos, avisos, limitaciones y reclamaciones**, con un panel interno para la persona administradora.
5. **Registro de auditoría** de las acciones del administrador.

## 2. Finalidades y base jurídica

| Finalidad | Base | Nota |
|---|---|---|
| Seguridad del servicio y prevención de abuso (1, 2) | Interés legítimo (art. 6.1.f RGPD) | Hace falta la prueba de ponderación, apartado 5 |
| Aplicar las normas de uso aceptadas en los Términos (3, 4) | Ejecución del contrato (art. 6.1.b) e interés legítimo | Los Términos se aceptan en la bienvenida |
| Responsabilidad y control del acceso del administrador (5) | Interés legítimo | |

## 3. Datos tratados

| Dato | Qué es | Dónde | Plazo |
|---|---|---|---|
| Huella de IP | HMAC-SHA256 de la IP con un secreto del servidor (IPv6 recortada a /64). **La IP en claro no se guarda ni se registra** y la base de datos rechaza cualquier valor que no sea una huella | `mod_ip_signals`, `mod_ip_hits`, `mod_ip_blocks`, `mod_observation_entries` | **30 días** (señales y bloqueos) y 2 horas (contadores). **Salvedad hoy:** las entradas anotadas en una observación (`mod_observation_entries`) no las borra `mod_purge`; duran mientras exista la cuenta. Es un fallo pendiente de corregir en el código (ver `MODERACION_NO_VERIFICADO.md`) |
| Id de cuenta | Identificador interno | Todas las tablas `mod_*` | Mientras exista la cuenta; borrado en cascada |
| Eventos de moderación | Código de la norma, origen, gravedad, confianza, referencia mínima (id de conversación). **Nunca el texto del mensaje, ni un fragmento** | `mod_events` | Mientras exista la cuenta (a decidir por el profesional, ver 8) |
| Sanciones y apelaciones | Tipo, norma, fecha, quién decidió; el texto que el alumno escribe al apelar | `mod_sanctions`, `mod_appeals` | Mientras exista la cuenta |
| Auditoría del administrador | Quién, qué acción, sobre qué cuenta, resultado, código de detalle. Sin datos personales ni textos | `admin_audit_log` (inmutable) | Indefinido por diseño (a decidir, ver 8) |
| Mensaje marcado | Texto del mensaje que el filtro previo marca, **solo en tránsito** hacia el clasificador (recortado a 1.500 caracteres). No se guarda en moderación | — | Sin conservación por moderación |

No se usan huellas de dispositivo, cookies de seguimiento ni se relaciona a nadie por nada más que la huella de IP y su comportamiento.

## 4. Menores

El servicio es para mayores de 14 años (art. 7 LOPDGDD). Los menores de 18 tienen umbrales **más estrictos para avisar** (un 25 % menos), pero la consecuencia **nunca es más dura**. Ningún baneo de 7 días o más se aplica sin revisión humana, salvo la excepción del apartado 7. Los mensajes sobre malestar o riesgo propio **no son infracción**: respuesta de apoyo (024, 112) y sin sanción ni evento.

## 5. Necesidad y proporcionalidad

- **Necesidad:** sin límites, un grupo pequeño puede agotar el servicio gratuito para todos (verificado en la auditoría: SEC-05) y no hay otra forma de que un baneo signifique algo.
- **Minimización:** huella en vez de IP, 30 días, sin texto de mensajes, correo enmascarado y sin IP en el panel.
- **Alternativas descartadas:** huellas de dispositivo y cookies de seguimiento (más intrusivas); guardar el texto como prueba (se descarta por privacidad: se pierde la prueba, ver 8).
- **Ponderación (a validar por el profesional):** el interés en mantener el servicio seguro y justo y en proteger a otros alumnos pesa más que la intromisión limitada de una huella irreversible con 30 días de vida, siempre que no se castigue a nadie solo por compartir red.

## 6. Riesgos para los alumnos y medidas

| Riesgo | Medida |
|---|---|
| **Falsos positivos en redes compartidas** (colegio, biblioteca, datos móviles) | Con **5 o más cuentas** distintas en una hora nunca se bloquea la conexión entera: solo se limita a la cuenta. Para el baneo por evasión, si en 30 días la huella la han usado **más de 4 cuentas** no se banea a nadie solo y el caso va al panel. La cuenta debe haberse creado **después** del baneo. Test con el escenario del colegio |
| **Una huella repetida no es la misma persona** (hermanos, compañeros de piso) | Observación de 2 días, mínimo de 4 entradas (entre 4 y 7), reclamación atendida por una persona y botón de levantar el baneo |
| **Decisiones automatizadas** | Lo automático por tasa es solo un bloqueo temporal de 24 h. Los baneos de 7 días o más solo se **proponen**. Interruptores apagados por defecto (apartado 7) |
| **Discriminación o error del clasificador** | Solo ve mensajes que el filtro marcó. Su salida es un JSON de lista cerrada que no puede disparar acciones por sí sola. Nunca sanciona de forma dura, falla hacia permitir y el límite de tasa es la red de seguridad. **El clasificador no se ha medido con datos reales** (ver `MODERACION_NO_VERIFICADO.md`) |
| **Alumno en riesgo tratado como infractor** | Autolesiones = apoyo, sin sanción |
| **Abuso del panel o toma de la cuenta de administrador** | Solo `hellodream@edudream.es` con fila en la base de datos, identidad de Google verificada y segundo factor; sesión de 30 min; acciones graves con código reciente y confirmación en dos pasos; registro inmutable; datos mínimos; sin Crisp ni terceros en el panel; mismo 404 para el resto |
| **Fuga de huellas** | Tablas sin acceso desde el navegador, permisos mínimos, secreto solo en el servidor |

## 7. Interruptores y estado por defecto

| Interruptor (secreto de `dream-api`) | Qué activa | Por defecto |
|---|---|---|
| `MOD_MODE` | `off` nada; `observe` solo apunta; `enforce` bloquea y limita | **`off`** |
| `MOD_AI_ENABLED` | Revisión de mensajes con IA (necesita `MOD_MODE` distinto de `off`) | **`false`** |
| `MOD_AUTO_BAN_ENABLED` | Baneo automático por evasión (necesita `MOD_MODE=enforce`) | **`false`** |
| `ADMIN_EMAIL` | Quién puede ser administrador | **vacío** (nadie) |

Con todo apagado el sistema no lee la IP, no guarda nada nuevo y no sanciona a nadie. El baneo manual (escribir una fila en `mod_sanctions` o desde el panel) funciona siempre.

## 8. Puntos que debe decidir el profesional

1. **RGPD art. 22.** El baneo automático por evasión es una **decisión automatizada con efecto significativo** (pierdes el acceso al servicio). Mitigaciones: apelación atendida por una persona, aviso claro, observación previa de 2 días, solo en conexiones de tamaño de hogar y no antes de que la cuenta sea posterior al baneo, y baneo de 7 días (no permanente). **Conviene un abogado o gestor antes de activar `MOD_AUTO_BAN_ENABLED`.** Hasta entonces solo se propone.
2. Plazos de conservación de `mod_events`, sanciones, apelaciones y `admin_audit_log` (hoy: sin borrado automático salvo con la cuenta).
3. Si la ponderación del interés legítimo se sostiene con menores y si hace falta información previa más visible.
4. Si el aviso a las autoridades de la tabla G requiere procedimiento aparte.
5. Si hace falta un contrato de encargado específico con Groq para la clasificación (ya es proveedor de IA del servicio).

## 9. Encargados del tratamiento

- **Supabase** (base de datos, autenticación y funciones; región Zúrich).
- **Groq:** recibe, solo cuando la revisión con IA está activada y el filtro marca el mensaje, el texto marcado (sin correo, nombre ni apodo).
- **Crisp:** solo en la apelación (pantalla del baneado), con un código de apelación aleatorio y **sin enviar correo, nombre ni datos de la cuenta**. Carga tras un aviso de privacidad.
- **Hugo (asistente de Crisp, por MCP, solo lectura; docs/HUGO_MCP.md):** con la sesión de Dream iniciada al abrir el chat, consulta solo esa cuenta: nombre de pila (máx. 20 caracteres), estado de bloqueo y norma, uso del día, cola, avisos y apelaciones (sin textos). Sin sesión no ve nada. La conversación de Crisp se ata a la cuenta 24 h (se borra al cerrar sesión o con la cuenta). Registro de llamadas sin datos personales, 30 días. **Pendiente de Carlos/profesional:** dónde guarda Crisp los datos de la conversación y sus subencargados.
- **Vercel** sirve la web y puede registrar datos técnicos de conexión (ya descrito en la política).

## 10. Riesgo residual

**Medio-bajo con todo apagado; medio al activar la revisión con IA; medio-alto al activar el baneo automático** hasta que un profesional lo valide. El principal es el error sobre alumnos reales que comparten red, mitigado pero no eliminado.
