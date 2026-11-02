# Plan de emergencia: qué hacer si atacan Dream

Para Carlos. Frases cortas, paso a paso. Fecha: 2026-10-29.

> **Lo primero que hay que saber.** Cloudflare protege la **web** (`www.edudream.es`). La **IA, la base de datos y los archivos** van directos a **Supabase**, y ahí Cloudflare no llega. Contra un ataque a la IA actúan los límites de Dream (por cuenta, por IP y la cola) y los interruptores del paso 2d.

## 1. Cómo saber que hay un ataque

Cualquiera de estas señales:

- **Te llega un correo de Cloudflare** «HTTP DDoS Attack Alert» a `hellodream@edudream.es` (ver el paso 4 para dejarlo listo).
- **Cloudflare → `edudream.es` → Analytics & Logs → Traffic:** un pico de peticiones muy por encima de lo normal.
- **Cloudflare → `edudream.es` → Security → Events:** muchos bloqueos o desafíos de golpe, casi siempre de las mismas IP o del mismo país.
- **Vercel → proyecto `dream` → Usage:** las invocaciones o el ancho de banda se disparan. Con el plan Hobby, si se agota el cupo del mes la web se para.
- **La IA falla mucho:** alumnos que ven «Hay mucha gente usando Dream» todo el rato, o errores de Groq por cupo agotado.
- **Supabase va lento:** Supabase → proyecto «Dream AI» → Reports muestra muchas peticiones o errores.

Si dudas, **actúa**. Los pasos se deshacen en un clic.

## 2. Qué hacer primero (en este orden)

**a) Cloudflare: Under Attack Mode.**
Cloudflare → selecciona `edudream.es` → en la página de resumen (Overview), en **Quick Actions**, activa **Under Attack Mode**.
- Qué pasa: cada visitante ve unos segundos una pantalla de «comprobando tu navegador» antes de entrar. Los alumnos solo esperan un momento.
- Dream ya está preparado: la app no cierra la sesión de nadie por culpa de esa pantalla (arreglo de este bloque).

**b) Si el ataque viene de fuera de España: activa la regla de desafío para el extranjero.**
Prepárala ahora y déjala **desactivada** (decisión 3: no se bloquea ningún país; esto es solo para emergencias).
- Cloudflare → `edudream.es` → **Security → WAF → Custom rules → Create rule**.
- **Nombre:** `Emergencia: desafío fuera de España`
- **Expression** (Edit expression):
  ```
  (ip.src.country ne "ES" and not starts_with(http.request.uri.path, "/_next/") and not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/.well-known/") and http.request.uri.path ne "/sw.js" and http.request.uri.path ne "/manifest.webmanifest")
  ```
- **Action:** **Managed Challenge**
- Pulsa **Save as Draft** (no «Deploy»). Ocupa uno de los 3 huecos libres.
- **En un ataque:** abre la regla y pulsa **Deploy** (o actívala con su interruptor).
- Quedan fuera los archivos de la web, `/api`, el service worker y el manifiesto, para no romper a quien ya está dentro. Un alumno de viaje solo ve un «no soy un robot» rápido. Nadie queda bloqueado.

**c) Vercel: Attack Challenge Mode (respaldo).**
Vercel → proyecto `dream` → **Firewall** → **Attack Challenge Mode** (también llamado «Attack Mode») → activar y elegir cuánto dura: 1, 6 o 24 horas. Se apaga solo al acabar ese tiempo. Sirve si alguien ataca directamente la dirección de Vercel. Con el arreglo del Bloque B4, esa dirección ya redirige a `www.edudream.es` y rechaza las escrituras.

**d) Frenar la IA (si el ataque gasta IA o Supabase).**
Supabase → proyecto «Dream AI» → **SQL Editor** → pega y ejecuta:
```sql
-- Menos respuestas de IA a la vez: el resto espera en la cola con el aviso
-- «Hay mucha gente usando Dream». Lo normal es 8.
update dream_private.limits set global_concurrency = 3 where id;
```
Si hace falta parar la IA del todo: Supabase → Edge Functions → **Secrets** → `DREAM_MAINTENANCE_MODE` = `true`. Dream mostrará que está en mantenimiento y no gastará nada.

## 3. Cómo volver a la normalidad

Cuando los gráficos vuelvan a lo normal **durante al menos una hora**, deshaz en **orden inverso**:

1. Supabase → Secrets → borra `DREAM_MAINTENANCE_MODE` (o ponlo en `false`), si lo pusiste.
2. Supabase → SQL Editor:
   ```sql
   update dream_private.limits set global_concurrency = 8 where id;
   ```
3. Vercel → Firewall → desactiva **Attack Challenge Mode**.
4. Cloudflare → WAF → Custom rules → desactiva la regla `Emergencia: desafío fuera de España` (no la borres: queda lista para la próxima).
5. Cloudflare → Overview → Quick Actions → desactiva **Under Attack Mode**.

**Comprueba después:**
- La web abre en `https://www.edudream.es`.
- Entrar con Google funciona: cierra la sesión y vuelve a entrar.
- El chat responde una pregunta.
- La subida por QR conecta desde el móvil.
- El correo funciona: envía un correo a `hellodream@edudream.es` desde otra cuenta.

## 4. Pasos manuales pendientes (con fecha)

| Cuándo | Qué | Dónde |
|---|---|---|
| **Ahora** | Avisos por correo de ataques: Notifications → **Add** → **HTTP DDoS Attack Alert** → nombre `Dream DDoS` → correo `hellodream@edudream.es` → Save. Está incluido en todos los planes | Cloudflare (nivel de cuenta) |
| **Ahora** | Preparar la regla de emergencia (paso 2b) como **borrador** | Cloudflare |
| **Ahora** | Regla de límite de tasa (`docs/cloudflare-reglas.md`, apartado 2) | Cloudflare |
| **Ahora** | Browser Cache TTL → **Respect Existing Headers** (`docs/cloudflare-reglas.md`, apartado 4) | Cloudflare |
| **Ahora** | `edudream.vercel.app` → Redirect to `www.edudream.es` (308) | Vercel → Settings → Domains |
| **Ahora** | Comprobar que **Deployment Protection** sigue en **Standard Protection** (las vistas previas ya piden iniciar sesión) | Vercel → Settings |
| **Ahora** | Ruta secreta del panel: `ADMIN_PANEL_PATH` en Vercel y en `dream-api` (`docs/cabeceras.md`) | Vercel + Supabase |
| **Tras desplegar** | Abrir `https://www.edudream.es/api/ip-check` y mirar la tabla de `docs/ip-real.md` | Navegador |
| **5 de noviembre de 2026** (7 días sin problemas) | HSTS con subdominios: `DREAM_HSTS` = `on` y redesplegar (`docs/cabeceras.md`). **Sin `preload`** | Vercel |
| **12 de noviembre de 2026** | Revisar el umbral de la regla de límite de tasa con los datos reales (`docs/cloudflare-reglas.md`) | Cloudflare |
| **Opcional, al final** | DNSSEC (ver abajo) | Cloudflare + IONOS |

### DNSSEC (opcional, al final)

DNSSEC firma los registros DNS para que nadie pueda hacerse pasar por `edudream.es`. **Ojo:** si el registro DS se pega mal en IONOS, **el dominio deja de funcionar** (web y correo) hasta que se corrija.

1. Cloudflare → `edudream.es` → **DNS → Settings → DNSSEC → Enable DNSSEC**. Cloudflare muestra los datos del registro **DS**: Key Tag, Algorithm, Digest Type y Digest.
2. IONOS → Dominios → `edudream.es` → **DNSSEC** (o «Ajustes de DNS» → DNSSEC) → añadir el registro DS copiando **exactamente** esos cuatro valores.
3. Espera hasta 24 h. Cloudflare pondrá **Active** en DNSSEC.
4. Comprueba que la web y el correo siguen funcionando.

**Cómo deshacerlo si algo falla:**
- **Primero**, en IONOS, borra el registro DS.
- **Después**, espera unas horas y desactiva DNSSEC en Cloudflare.
- Nunca al revés: desactivarlo en Cloudflare con el DS todavía en IONOS deja el dominio caído.

## 5. A quién avisar y qué guardar

- **Guarda capturas** antes de deshacer nada:
  - Cloudflare → Security → Events (filtros de la hora del ataque).
  - Analytics → Traffic.
  - Vercel → Usage.
  - Supabase → Reports.
  - Anota la hora de inicio y de fin.
- **Si Vercel cobra o corta por el ataque:** abre un caso en Vercel (Help → Contact) con las capturas y explica que fue un ataque.
- **Si Supabase se queda sin cupo:** abre un caso en Supabase (Support) con las capturas.
- **Si hubo acceso a datos de alumnos** (no solo saturación): es una **brecha**. Hay que avisar a la **AEPD en un máximo de 72 horas** y, si hay alto riesgo, a los afectados. Busca ayuda profesional ese mismo día.

## Lo que este plan no cubre

- **Ataques directos a Supabase:** el dominio propio de Supabase es de pago y no se usa. Los frenan los límites de Dream por cuenta e IP y la cola (paso 2d).
- **No lo he probado durante un ataque real.** No se pueden lanzar pruebas de ataque contra `edudream.es`. Los pasos salen de la documentación de Cloudflare, Vercel y Supabase (2026-10-29), y el arreglo de la sesión con Under Attack Mode tiene su prueba.
