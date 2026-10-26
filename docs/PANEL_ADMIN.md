# Panel de administración

Lo ve y lo usa **solo la cuenta `hellodream@edudream.es`**. Si cae en manos equivocadas es un desastre, así que la seguridad está en el servidor, no en esconder el botón.

## Quién es administrador (hacen falta las cinco cosas a la vez)

1. El correo **verificado por el servidor** (el del token ya validado por Supabase), en minúsculas y sin espacios, es `ADMIN_EMAIL` (secreto de `dream-api`; nunca en el código ni en `NEXT_PUBLIC_*`).
2. Hay una fila en `dream_private.admin_users` con el **id** de esa cuenta. **El alta es solo a mano**, en el editor SQL de Supabase:
   `insert into dream_private.admin_users(user_id) values ('<id de la cuenta>');`
   Ninguna función ni acción puede crear, editar ni conceder administrador (hay un test que lo comprueba).
3. La identidad es **solo Google con correo verificado**. Si la cuenta tuviera además otra identidad (correo y contraseña…) deja de ser administradora.
4. La sesión es `aal2`: segundo factor TOTP.
5. La petición viene de un origen conocido (`dream-api` ya rechaza los demás).

Nada de roles en `user_metadata`: el usuario puede editarlo, así que se ignora.

**Quien no cumple cualquiera de las cinco recibe exactamente la respuesta de una acción que no existe** («Acción no válida», 400). Los tests lo comprueban para cada acción del panel y para cada condición por separado.

## Ruta

El panel no está en `/admin`. Está en **`/revision`** (configurable con `ADMIN_PANEL_PATH`, en Vercel **y** en los secretos de `dream-api`, con el mismo valor). `/admin`, `/panel`, `/administracion` y la página interna dan el 404 de siempre. Quien entra en la ruta del panel con otro correo (o sin sesión) va directo a Inicio (`/chat`, o la portada si no ha entrado): solo `hellodream@edudream.es` lo ve. Una ruta oculta no es seguridad por sí sola: es una capa extra.

## Cómo se activa

1. Aplicar la migración `20261025100000_admin_panel.sql`.
2. En los secretos de `dream-api`: `ADMIN_EMAIL=hellodream@edudream.es` (y `ADMIN_PANEL_PATH` si quieres otra ruta). En Vercel, `ADMIN_PANEL_PATH` si cambias la ruta.
3. En el editor SQL: dar de alta tu id (arriba). Tu id está en Authentication › Users.
4. Entrar en Dream con tu cuenta de Google. Aparece «Panel de administración» en el menú. La primera vez, el panel te guía para **activar el segundo factor** (TOTP): hazlo enseguida; hasta que lo inscribas, quien tuviera tu sesión de Google podría inscribir el suyo.

## Qué protege

- **Sesión del panel corta:** 30 min de inactividad. Para abrirla hace falta un código TOTP de los últimos 5 min.
- **Acciones graves** (baneo permanente, confirmar un baneo permanente): código reciente **y confirmación en dos pasos**, con un token que vale 2 minutos y está atado a quién, qué y sobre quién.
- **Registro de auditoría inmutable** (`dream_private.admin_audit_log`): solo se puede insertar. `UPDATE`, `DELETE` y `TRUNCATE` los rechaza un disparador y los permisos están revocados para todos los roles. Cada acción deja su fila **antes** de ejecutarse; si el registro no responde, no se devuelven datos. También quedan los intentos fallidos.
- **Límites:** 60 acciones por minuto y bloqueo (respuesta de «no existe») tras 10 intentos fallidos en 15 minutos.
- **Cabeceras de la ruta del panel:** CSP sin `unsafe-inline` para scripts (con nonce), sin recursos de terceros, `X-Frame-Options: DENY`, `Cache-Control: no-store`, `noindex`, `Referrer-Policy: no-referrer`. Sin Crisp ni telemetría en el panel.
- **Datos mínimos:** id corto y correo enmascarado (`a***@gmail.com`); nunca IP, solo el prefijo de 12 caracteres de la huella; sin exportación masiva. Los textos de los alumnos se pintan como texto, nunca como HTML.
- **CSRF:** no aplica a las acciones (van con `Authorization: Bearer`, sin cookies); además se exige un origen conocido.
- No se puede banear a uno mismo ni a otro administrador, y las normas ofrecidas son solo filas de la tabla G.

## Lo que NO está hecho o NO se ha podido verificar

- **Aviso por correo a Carlos** en cada inicio de sesión del panel y en las acciones graves: no hay infraestructura de correo. Queda anotado; hace falta decidir el servicio (privacidad y contrato de tratamiento de datos).
- **Que no exista otra forma de entrar en la cuenta de administrador.** El código exige Google verificado y rechaza cuentas con otra identidad, pero en la configuración de Supabase Auth hay que comprobar: «Allow new users to sign up» con correo, enlaces mágicos y «vinculación automática de identidades» (Authentication › Sign In / Providers). Lo comprobé en la base de datos: hoy solo hay identidades de Google, sin contraseñas. Es el punto más débil del panel: revísalo.
- La inscripción del segundo factor depende de Supabase Auth (TOTP activado en Authentication › Multi-factor). No he podido probarla contra el proyecto real.
- El estado `404` con el que se sirve el panel y la CSP con nonce están probados en un navegador contra una compilación real, no en Vercel.
