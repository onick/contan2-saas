# 00 · Auditoría del estado actual

> Fecha: 2026-05-27
> Branch: `security/p0-hardening` (creada desde `multitenant`, branch desplegada)
> Alcance: snapshot del repo `contan2-saas` antes de cualquier cambio de hardening P0.

## Resumen ejecutivo

`contan2-saas` es un **MVP funcional con superficie de ataque crítica**:

- ✅ Multi-tenancy a nivel de middleware (`resolveTenant` + `buildTenantRepos`) implementado.
- ✅ Auth nueva (Argon2id + sesiones opacas en Postgres) implementada en `routes/auth.js` + `middleware/requireStaffSession.js`. **Sin tests automatizados que demuestren su corrección**.
- ✅ Branding por tenant implementado (logoUrl, paleta SSR, sidebar style).
- ⚠️ Tenant ancla (CCB) en uso real. Volúmenes de datos no verificados en esta auditoría.
- ❌ **8 routers privados sin middleware de autenticación** + **2 endpoints individuales críticos sin protección** (`POST /api/credentials/:code/send`, `POST /api/attendance/anonymous`) — exponen PII y permiten escritura/borrado anónimo + envío masivo de emails.
- ❌ Sin Row-Level Security en Postgres — la única barrera es application-level.
- ❌ Generación PDF/Excel/email síncrona en el proceso HTTP — riesgo DoS.
- ❌ Uploads solo en disco local del container.
- ❌ Cero tests automatizados, cero CI/CD configurado.
- ❌ Node.js 20 corriendo en runtime; EOL oficial 2026-04-30 ya pasado.
- ⚠️ Dos sistemas de cookie coexisten: nueva (`contan2_session`, usado por admin SPA y `requireStaffSession`) y legacy PIN (`ccb_staff`, usado por `routes/staff.js` con su middleware aislado `staffAuth.js`). Sistemas no se mezclan en runtime; sin bug funcional confirmado al momento de la auditoría.

Bloqueadores P0 obligatorios antes de exponer a un segundo tenant comercial.

---

## 1. Stack confirmado

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Runtime | Node.js | 20-bookworm-slim (Dockerfile) | `engines: ">=18"`. **Node 20 EOL fue 2026-04-30 — ya fuera de soporte**. Target: 24 LTS |
| API | Express | 4.x (ESM imports) | Sin Fastify, sin TypeScript |
| Frontend | Vanilla JS + HTML/CSS | — | Múltiples SPAs (`frontend/*.html`) |
| DB | PostgreSQL | — | 22 migrations aplicadas (`backend/src/db/postgres/migrations/`) |
| Email | Resend | — | Síncrono en HTTP request handlers |
| PDF | Puppeteer + Chromium | — | Síncrono |
| Excel | ExcelJS | — | Síncrono |
| Uploads | Disco local + Sharp | — | `backend/data/uploads/` (Coolify volume) |
| Deploy | Docker en Coolify VPS | — | UUID `f3xck8spocf0o377y9w0vq6n` |
| Tests | — | — | **0 archivos `*.test.js`** |
| CI/CD | — | — | **0 workflows en `.github/workflows/`** |
| Lint/format | — | — | No `.eslintrc`, no `.prettierrc` detectados |

## 2. Inventario de routers backend

Cada router en `backend/src/routes/*.js`. Las columnas indican cantidad de referencias a middlewares de auth (`requireStaffSession`, `requirePlatformAdmin`).

| Router | Auth refs | Estado | Notas |
|---|---|---|---|
| `auth.js` | 6 | ✅ protegido | Login, logout, /me, reset, sessions |
| `staffManagement.js` | 10 | ✅ protegido | Members, invitations · todos con guard |
| `auditLog.js` | 2 | ✅ protegido | Solo admin/owner |
| `credentials.js` | 2 | 🟡 parcial | `bulk-send` tiene guard. **`POST /:code/send` SIN auth** (P0). `GET /:code.png` público por diseño bearer-style |
| `orgDomain.js` | 5 | ✅ protegido | Self-service domain |
| `platformAdmin.js` | 3 | ✅ protegido | Subdomain admin separado |
| `platformAuth.js` | 6 | ✅ protegido | Sesión platform-side |
| **`users.js`** | **0** | 🔴 **P0** | CRUD visitantes — POST/GET/PATCH/PUT/DELETE sin auth |
| **`activities.js`** | **0** | 🔴 **P0** | CRUD actividades + invitations |
| **`attendance.js`** | **0** | 🔴 **P0** | Incluye `POST /anonymous` (comentario del autor dice "el staff dispara este endpoint" — no público a pesar del nombre) |
| **`dashboard.js`** | **0** | 🔴 **P0** | Métricas del tenant |
| **`insights.js`** | **0** | 🔴 **P0** | Segmentos + analytics + user affinity |
| **`reports.js`** | **0** | 🔴 **P0** | PDF/Excel con PII del tenant |
| **`uploads.js`** | **0** | 🔴 **P0** | POST imagen — riesgo SVG XSS |
| **`orgBranding.js`** | **0** | 🔴 **P0** | Cambiar branding del tenant |
| `staff.js` | 0 | 🟡 LEGACY | PIN scanner antiguo. Sistema aislado con cookie propia (`ccb_staff`). `POST /login`, `GET /me`, `POST /logout` **NO** deben protegerse con `requireStaffSession` (rompería el login). Documentar retiro progresivo |
| `tenant.js` | 0 | ✓ PUBLIC | `/api/_tenant` es público por diseño (branding pre-login). Payload debe estar allowlisted: solo metadata visual, sin hashes/secretos/billing. Sujeto a test de no-leak |
| `eventosPublic.js` | 0 | ✓ público OK | Open Graph compartibles (diseño) |
| `landing.js` | 0 | ✓ público OK | Marketing root |
| `public.js` | 0 | ✓ público OK | API del kiosko (RSVP, etc.) |

**Impacto inmediato P0**: cualquiera con la URL puede listar/crear/borrar visitantes, actividades, asistencias y reportes de cualquier tenant sin autenticación. PII (nombre, email, teléfono, historial de visitas) expuesta. Además, `POST /api/credentials/:code/send` permite disparar emails (Resend) desde anónimo con rate limit IP-only.

## 3. Modelo de datos y multi-tenancy

22 migrations confirmadas en `backend/src/db/postgres/migrations/`. Tablas tenant-aware (todas con `organization_id`):

- Legacy: `users`, `activities`, `attendance`, `organizations`, `staff_sessions` (PIN legacy), `audit_log` (vacía, sustituida)
- Sprint 1+: `staff_members`, `staff_auth_sessions`, `staff_password_resets`, `platform_admins`, `platform_sessions`, `platform_password_resets`
- Sprint 3: `staff_invitations`, `tenant_audit_log`

**Aislamiento actual**: middleware `buildTenantRepos` inyecta un `repos` scope-ado al `organizationId` resuelto por `resolveTenant`. Cada repositorio (Pg*Repository) filtra por `organization_id` en SQL.

**Row-Level Security**: **NO implementado**. Cero `CREATE POLICY` en migrations. Cero `ENABLE ROW LEVEL SECURITY`. La aislación es application-level — si un developer olvida pasar por `req.repos`, accede a otros tenants.

**Riesgo**: defensa en una sola capa. Con RLS, aunque un endpoint olvide filtrar, la DB rechaza la query.

## 4. Auth y RBAC

- **Sesiones**: opacas (tokens random hex de 32 bytes), persistidas en `staff_auth_sessions`, cookie `__c2_staff` HttpOnly+Secure+SameSite=lax.
- **Hashing**: Argon2id (paquete `argon2`) con parámetros default seguros.
- **Roles**: `owner` · `admin` · `operator` (también `staff` interno) — definidos en `staff_members.role`.
- **Middleware**: `requireStaffSession` valida cookie → carga staff → setea `req.currentStaff`. `requireRole(['owner', 'admin'])` para gating granular.
- **Platform admin**: subdomain dedicado `admin.contan2.com` con su propia tabla `platform_admins` + sesión separada (`platform_sessions`).
- **PIN legacy**: aún existe la tabla `staff_sessions` (legacy, distinta de la nueva `staff_auth_sessions`). El router `staff.js` la usa. Debería estar tras feature flag o eliminado tras la migración.

## 5. Jobs, uploads, PDF/Excel

- **Sin worker independiente**. Sin BullMQ, sin Redis, sin cola.
- **Generación PDF**: `routes/reports.js` invoca Puppeteer + Chromium **dentro del request handler** → bloquea el event loop por segundos, riesgo DoS trivial.
- **Generación Excel**: ExcelJS también síncrono en handler.
- **Email**: `services/email.js` y `authEmails.js` mandan vía Resend desde el handler. Si Resend tarda, el HTTP request espera.
- **Cron jobs**: setInterval en proceso server (auto-finalización de actividades, p.ej.). Si el container reinicia, posibles jobs perdidos.
- **Uploads**: `routes/uploads.js` guarda en `/app/backend/data/uploads/` (volume Coolify). **No S3-compatible**. Si el container se mueve a otro host sin volumen montado, assets perdidos.

## 6. Frontend actual

SPAs identificadas:
- `index.html` → admin SPA principal (vista panel CCB)
- `kiosko.html` + `kiosko.js` + `kiosko.css` → kiosko táctil (Cinema Marquee redesign reciente)
- `scanner.html` + `scanner.js` → escáner QR para staff
- `login.html` + `login.js` → auth UI
- `invite.html` + `invite.js` → aceptación de invitación
- `rsvp.html` + `rsvp.js` → confirmación pública RSVP
- `landing.html` → marketing root
- `platform-login.html` + `platform-dashboard.html` → super admin

Branding multi-tenant: `branding.js` hace fetch a `/api/_tenant` y aplica CSS vars (`--color-primary-*`, `--k-primary-*`, `--s-primary-*`) generadas en runtime desde el primaryColor del tenant. Funciona pero acoplado al runtime cliente.

## 7. Tests + CI/CD

- **Tests**: 0 archivos `*.test.js` / `*.spec.js` en el proyecto.
- **CI**: `.github/workflows/` no existe.
- **Linting**: no detectado.
- **Format**: sin configuración.

Cero garantías automatizadas de regresión. Cada deploy depende de smoke manual.

## 8. Deploy

- Dockerfile: `node:20-bookworm-slim AS base` (multi-stage simple). **Node 20 EOL 2026-04-30 ya pasado**.
- Coolify v4 en VPS externo. Branch `multitenant` = producción. Branch `develop` = trabajo. Webhook GitHub → Coolify reportado como poco confiable (requiere trigger manual ocasional).
- Detalles operacionales (IPs, UUIDs de apps, tokens) viven en runbook privado fuera de este doc versionado.
- ENV vars críticas configuradas en Coolify (`RESEND_API_KEY`, `DATABASE_URL`, etc.). Validación tipada de env: parcial (`src/config.js`), no Zod ni schema explícito.

## 9. Hardcoded CCB

- `CCB_ORG_ID` constante en `backend/src/db/repositories.js`.
- Default PIN hash CCB en bootstrap legacy.
- Modo memory single-tenant: si `DB_DRIVER=memory`, todo apunta a CCB hardcoded en `middleware/resolveTenant.js` (`MEMORY_ORG`).
- Logo default `/assets/logo.png` es el del CCB (mono blanco). Tenants nuevos sin `logoUrl` ven el del CCB.

## 10. Hallazgos adicionales

- **Cookie del nuevo sistema** (`contan2_session`): definida en `middleware/requireStaffSession.js:17` y usada por `routes/auth.js:29` vía `getSessionCookieName()`. Lectura y escritura consistentes — el sistema NUEVO funciona end-to-end.
- **Cookie legacy** (`ccb_staff`): definida en `middleware/staffAuth.js:6`. Usada exclusivamente por `routes/staff.js` (login PIN, logout, /me). Sistema aislado del nuevo. Sin tests que demuestren la separación.
- **`POST /api/credentials/:code/send` sin auth**: confirmado P0. Rate limit IP 3/min ya aplicado, pero permite a anónimo disparar email del tenant (Resend). Mitigaciones requeridas: requerir sesión staff + audit log.
- **`POST /api/attendance/anonymous` sin auth**: el comentario del autor en `routes/attendance.js` indica que es para uso del staff cuando entra un grupo sin escanear. El kiosko público usa `/api/public/checkin`. Confirmado: este endpoint debe requerir sesión staff.
- **CORS**: `credentials: true` permitido para cookies cross-subdomain. Verificar que `Access-Control-Allow-Origin` esté explícitamente listado (no `*`, incompatible con credentials).
- **PII en logs**: existe helper `maskEmail()`; falta auditar todos los `console.log` y `recordAudit` para confirmar uso consistente.
- **SVG XSS**: `uploads.js` acepta SVG y los sanitiza (referencias en commits previos); la sanitización no está cubierta por tests automatizados.
- **Race conditions**: registro de attendance con capacity check vía `incrementEnrolledIfRoom`; atomicidad a nivel SQL no verificada por tests.
- **Sin rate limiting** en endpoints privados (solo en login, forgot, accept-invitation).
- **Sin observabilidad**: ningún logger estructurado (Pino), sin Sentry, sin métricas, sin OpenTelemetry.

## Conclusión

La base funcional está. La base operacional **no**. La migración v2 propuesta apunta a fortalecer la operacional sin romper la funcional. El próximo doc (`01-target-architecture.md`) describe el destino; `03-security-hardening-plan.md` lista los P0/P1/P2 con evidencia accionable.
