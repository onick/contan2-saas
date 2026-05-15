# contan2-saas

Plataforma SaaS multi-tenant para gestión de centros culturales: registro de visitantes, control de asistencia a actividades, credenciales digitales con QR, segmentación de audiencia y reportes profesionales.

Primer tenant en producción: **Centro Cultural Banreservas** (`ccb.contan2.com`).

## Stack

- **Backend:** Node.js 20 + Express 4, ESM modules
- **DB:** PostgreSQL 16 (driver `pg`), multi-tenant shared-DB con `organization_id` por fila
- **Frontend:** Vanilla JS + CSS (tres SPAs sin framework)
  - `/` — Admin
  - `/kiosko` — Touchscreen de auto-registro
  - `/scanner` — Scanner QR para staff (auth por PIN)
  - `/rsvp/:token` — Confirmación de invitaciones
- **Email transaccional:** Resend
- **PDF reports:** Puppeteer-core + Chromium del sistema
- **Excel reports:** ExcelJS
- **Imágenes:** sharp (resize + JPEG q82) + QRCode
- **Deploy:** Docker single-stage (Debian bookworm-slim) en Coolify v4 sobre VPS Contabo

## Arquitectura multi-tenant

- Resolución de tenant por subdomain (`<slug>.contan2.com`) o custom domain, vía `middleware/resolveTenant.js` con caché LRU.
- `createTenantRepos(organizationId)` produce un conjunto de repositorios scoped a la org. Todo flujo de datos pasa por `req.repos`.
- Branding (logo, primary/secondary colors, sidebar style) por organización. Sistema de design tokens con SSR de paleta HSL inyectada en `<style data-branding-ssr>` antes de `</head>`.

## Estructura del repo

```
backend/
  server.js                 # Express entrypoint
  src/
    config.js               # Lectura de .env
    bootstrap.js            # Tareas idempotentes al boot (default PIN, etc.)
    db/
      repositories.js       # Factory de repos por tenant
      memoryActivityRepository.js
      memoryUserRepository.js
      memoryAttendanceRepository.js
      persistence.js        # Snapshot JSON para modo memory (legacy)
      postgres/
        pool.js             # PG pool singleton
        migrations.js       # Runner de migrations SQL versionadas
        migrations/         # 001..NNN_*.sql
        PostgresUserRepository.js
        PostgresActivityRepository.js
        PostgresAttendanceRepository.js
        PostgresInvitationRepository.js
        platform/
          OrganizationRepository.js
    domain/
      schemas.js            # Validators + normalizadores
    middleware/
      resolveTenant.js      # Subdomain → organization
      tenantRepos.js        # buildTenantRepos por request
      staffAuth.js          # Sesiones del scanner por PIN
      serveHtmlWithBranding.js  # SSR del style tag
      errorHandler.js
    routes/
      public.js             # Endpoints del kiosko (checkin público)
      users.js
      activities.js
      attendance.js
      dashboard.js
      insights.js           # Affinity scoring + segmentos
      staff.js              # Login del scanner por PIN
      credentials.js        # PNG + envío email
      uploads.js            # Multer + sharp optimization
      tenant.js             # GET /api/_tenant (branding público)
      orgBranding.js        # PATCH branding de la org
      reports.js            # Excel + PDF (actividad / período)
    services/
      email.js              # Resend transactional
      emailBranding.js      # Tokens + logo del tenant para emails
      credential.js         # PNG branded con QR
      activityCancellation.js
      invitations.js
      staffPin.js
      reports/
        pdfRenderer.js          # Puppeteer browser singleton
        activityPdfTemplate.js
        activityExcelReport.js
        periodAggregator.js
        periodPdfTemplate.js
        periodExcelReport.js
    utils/
      autoFinalize.js       # Cron interno: actividades pasadas → finalizada
      codeGenerator.js
      palette.js            # HSL palette generation (compartido con frontend)
      seed.js
  scripts/
    migrate-json-to-postgres.js
    optimize-uploads.js
  data/uploads/             # Volumen persistente en Docker (bind mount)

frontend/
  index.html / app.js / styles.css                 # Admin SPA
  kiosko.html / kiosko.js / kiosko.css             # Touchscreen
  scanner.html / scanner.js / scanner.css          # QR scanner
  rsvp.html / rsvp.js / rsvp.css                   # Confirmación
  branding.js / branding-admin.js                  # Sistema de marca
  reports-admin.js                                 # UI de reportes
  assets/

Dockerfile
.env.example
```

## Setup local

```bash
# Requiere Docker para Postgres local
git clone https://github.com/onick/contan2-saas.git
cd contan2-saas/backend
cp .env.example .env  # editar valores

# Levantar Postgres local (ejemplo simple)
docker run --name contan2-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_USER=ccb -e POSTGRES_DB=contan2 -p 5432:5432 -d postgres:16

npm install
npm run dev   # corre con --watch
```

App disponible en `http://localhost:3000`. En modo dev con `ROOT_DOMAIN=localhost` se sirve el tenant CCB como fallback.

## Deploy

Push a la branch `multitenant` dispara redeploy automático en Coolify (webhook configurado). Para forzar deploy manual:

```bash
curl -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "$COOLIFY_BASE_URL/api/v1/deploy?uuid=$APP_UUID&force=false"
```

El Dockerfile incluye Chromium del sistema para Puppeteer; el primer build descarga ~300MB y queda cacheado en capas subsiguientes.

## Volumen persistente

`/data/contan2/uploads` en el host está bind-mounted a `/app/backend/data/uploads` dentro del contenedor. Sobrevive redeploys. Configurado en Coolify como `file_storage` (`is_directory: true`).

## Migrations

Versionadas en `backend/src/db/postgres/migrations/NNN_descripcion.sql`. El runner las aplica en transacción y registra cada una en una tabla interna. Idempotentes (`IF NOT EXISTS`).

## Health

- `GET /healthz` — liveness liviano, no toca DB.
- `GET /api/dashboard/stats` — readiness (requiere DB + tenant).

## Branding

Cada organización configura su `primary_color`, `secondary_color`, `logo_url` y `sidebar_style` (brand / dark / light) desde el panel de admin (`#/branding`). El sistema:

1. Genera 10 stops de paleta vía HSL desde un único color primario.
2. Calcula el color de texto sobre fondo brand por luminancia WCAG.
3. Aplica los tokens al admin, kiosko, scanner, emails y credencial PNG.
4. SSR del bloque de tokens en cada HTML servido para evitar FOUC.

## Reportes

- **Por actividad:** `GET /api/reports/activity/:id.xlsx | .pdf`
- **Por período:** `GET /api/reports/period.xlsx | .pdf?from=YYYY-MM-DD&to=YYYY-MM-DD&types=cine,taller`
- **Preview JSON:** `GET /api/reports/period/preview?from=...&to=...`

Excel: multi-hoja branded con KPIs, distribución, tablas filtrables. PDF: vía Puppeteer renderizando una plantilla HTML que reusa los mismos tokens del tenant.

## Roadmap

Ver `ROADMAP.md`. Estamos en transición de prototipo a SaaS comercial; el roadmap detalla las 4 waves de hardening + sales-ready + escala.

## Licencia

Propietario.
