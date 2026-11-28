# Registro de coches por matrícula

App web para el móvil: escaneas la matrícula, haces fotos del coche y guardas eventos.
Después puedes buscar por matrícula (escribiéndola o con una foto) y ver todo el historial.

```
 ┌─ Móvil ───────────────────────┐
 │ lee la matrícula (Tesseract.js)│
 └──┬─────────────────────┬──────┘
    │ datos               │ fotos (subida directa, URL firmada)
    ▼                     ▼
 Vercel (Next.js) ──▶ Supabase Postgres (eventos)
                      Supabase Storage  (fotos, bucket privado)
```

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en https://supabase.com (región Europa, p. ej. `eu-west-3` París).
2. **SQL Editor → New query**: pega el contenido de `supabase/schema.sql` y pulsa **Run**.
   Crea las tablas `events` y `photos` y el bucket privado `photos`.
   Después crea el primer taller, con `APP_PASSWORD` como contraseña (aplica `supabase/multitaller.sql`):
   `node scripts/migrar-multitaller.mjs --taller "Mi taller"`
3. **Project Settings → API Keys**: copia la *Publishable key* y la *Secret key*.
   **Project Settings → Data API**: copia la *Project URL*.

### 2. Variables de entorno
Copia `.env.example` a `.env.local` y rellénalo. Las mismas variables van en Vercel.

| Variable | De dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys → Publishable |
| `SUPABASE_SECRET_KEY` | Supabase → API Keys → Secret (**nunca** en el cliente) |
| `APP_PASSWORD` | Contraseña del primer taller (solo la usa `scripts/migrar-multitaller.mjs`) |
| `AUTH_SECRET` | `openssl rand -hex 32`. Firma las cookies de sesión |
| `POSTGRES_URL_NON_POOLING` | Supabase → Connect → Direct connection (solo para `scripts/`) |

### 3. Local
```bash
npm install
npm run dev
```
Abre http://localhost:3000. La cámara del móvil necesita HTTPS, así que para probarla en el
teléfono usa el despliegue de Vercel.

### 4. Vercel
1. Sube el repo a GitHub e impórtalo en https://vercel.com/new.
2. Añade las variables de entorno del paso 2 y despliega.
3. En el móvil abre la URL y usa **Compartir → Añadir a pantalla de inicio** para tenerla como app.

## Estructura

| Ruta | Qué hace |
|---|---|
| `/` | Buscador por matrícula, "Buscar por foto" y lista de últimos coches |
| `/nuevo` | Nuevo evento: escanear matrícula, fecha, descripción y fotos |
| `/coche/[matrícula]` | Historial de eventos con fotos |
| `src/lib/ocr.ts` | Lee la matrícula en el navegador (Tesseract.js) con preprocesado y reintentos girando la imagen |
| `src/app/api/uploads` | Genera URLs firmadas para subir fotos directo a Supabase |
| `src/app/api/events` | Listar, buscar y crear eventos (`[id]` para borrar) |
| `src/proxy.ts` | Exige una cookie de taller válida en todo menos el login |
| `src/lib/session.ts` | `requireSession()`: taller de la petición y acceso a datos filtrado por él |
| `supabase/multitaller.sql` | Talleres y `workshop_id` en todas las tablas |
| `scripts/` | `migrar-multitaller`, `crear-taller` y `probar-aislamiento` |

Las matrículas se guardan normalizadas (`1234BCD`) y se muestran con formato (`1234 BCD`).
Se aceptan el formato actual y el provincial antiguo (`M-1234-AB`).

## Lectura de matrículas

Se hace en el móvil con Tesseract.js, sin servidores ni claves. La primera vez descarga unos
5 MB (motor e idioma) y luego queda en caché. Funciona bien si la matrícula ocupa casi todo
el encuadre. Si no la lee, se escribe a mano: el campo siempre es editable.

## Varios talleres

Cada taller tiene su contraseña. Al entrar, la contraseña decide el taller y la app solo muestra
sus datos. No hay usuarios: todo el equipo de un taller comparte su contraseña.

```
 contraseña ──▶ workshops ──▶ cookie "<taller>.<firma>"
                    │
 cars · events · photos · audios · workers · work_sessions   (workshop_id)
```

- Cada fila de datos lleva `workshop_id`. Las rutas acceden a la base de datos solo a través de
  `requireSession().db`, que filtra cada lectura, cambio y borrado por el taller y lo rellena en
  cada alta. No uses `supabaseAdmin().from(...)` en las rutas.
- Claves compuestas `(workshop_id, …)`: una fila no puede apuntar a datos de otro taller, y dos
  talleres pueden tener la misma matrícula.
- Fotos y audios nuevos se guardan en `<taller>/<matrícula>/…`.
- Las sesiones de antes de haber varios talleres siguen valiendo y son del primer taller.
- Alta de un taller: `node scripts/crear-taller.mjs --taller "Taller de Pepe" --password "…" --operarios "Juan,Luis"`
- Comprobar el aislamiento con la app en marcha (crea y borra dos talleres de prueba):
  `node scripts/probar-aislamiento.mjs --url http://localhost:3000`
