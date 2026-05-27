# 03 · Plan de hardening de seguridad

> Vulnerabilidades identificadas en el audit (`00-current-state-audit.md`) clasificadas por prioridad, con plan de remediación concreto.
> P0 = bloqueador antes de exponer a un segundo tenant. P1 = sprint 1-2. P2 = backlog.

## Matriz de severidad

| ID | Vulnerabilidad | Severidad | CVSS aprox | Prio | Evidencia |
|---|---|---|---|---|---|
| V001 | `/api/users` sin auth | Crítico | 9.8 | **P0** | `backend/src/routes/users.js` — 0 refs `requireStaffSession` |
| V002 | `/api/activities` sin auth | Crítico | 9.8 | **P0** | `backend/src/routes/activities.js` — 0 refs |
| V003 | `/api/attendance` sin auth (incluye `/anonymous`) | Crítico | 9.8 | **P0** | `backend/src/routes/attendance.js` — 0 refs. Comentario del autor confirma que `/anonymous` es operación de staff |
| V004 | `/api/dashboard` sin auth | Alto | 8.2 | **P0** | `backend/src/routes/dashboard.js` — 0 refs |
| V005 | `/api/insights` sin auth | Alto | 8.2 | **P0** | `backend/src/routes/insights.js` — 0 refs |
| V006 | `/api/reports` sin auth + DoS síncrono | Alto | 8.5 | **P0** | `backend/src/routes/reports.js` — 0 refs |
| V007 | `/api/uploads/image` sin auth + SVG XSS | Alto | 7.5 | **P0** | `backend/src/routes/uploads.js` — 0 refs |
| V008 | `/api/org/branding` sin auth | Alto | 7.8 | **P0** | `backend/src/routes/orgBranding.js` — 0 refs |
| V008b | **`POST /api/credentials/:code/send` sin auth** | Alto | 7.5 | **P0** | Endpoint dispara email vía Resend; solo rate limit IP 3/min. Permite spam + enumeración de códigos válidos por timing |
| V009 | Retiro progresivo del PIN legacy en `routes/staff.js` | Medio | 5.5 | **P1** | Sistema aislado con cookie `ccb_staff`. **NO** aplicar `requireStaffSession` al login/me/logout (rompería el flujo). Plan: medir uso real, deprecar progresivamente. Hasta entonces queda como sistema PUBLIC-with-PIN sin tier de la matriz nueva |
| V010 | `/api/_tenant` payload allowlist | Bajo | 3.0 | **P1** | Endpoint **público por diseño** (branding pre-login). Confirmar que payload sólo expone metadata visual; excluir `plan`, `status`, hashes, secrets. Test snapshot obligatorio |
| V011 | Sin RLS en Postgres | Medio | 7.2 | **P1** | 0 `CREATE POLICY` en migrations |
| V012 | PDF/Excel síncronos en HTTP | Alto técnico | — | **P1** | `routes/reports.js` invoca Puppeteer en handler |
| V013 | Emails síncronos | Medio técnico | — | **P1** | `services/email.js` desde HTTP request |
| V014 | Uploads solo en disco local | Medio | 6.0 | **P1** | `backend/data/uploads/` único storage |
| V015 | Cero tests automatizados | Crítico técnico | — | **P1** | 0 archivos `*.test.js` |
| V016 | Cero CI/CD | Crítico técnico | — | **P1** | `.github/workflows/` inexistente |
| V017 | **Node.js 20 fuera de soporte (EOL 2026-04-30)** | Medio | 6.0 | **P1** | `Dockerfile` `node:20-bookworm-slim`. Migrar a 24 LTS |
| V018 | Sin rate limit en privados | Medio | 5.5 | **P2** | Solo login/forgot tienen limit |
| V019 | Sin observabilidad (Sentry/Pino) | Medio op | — | **P2** | Sin logger estructurado |
| V020 | Race condition capacity attendance | Medio | 5.8 | **P2** | Confirmar atomicidad SQL |
| V021 | Sin validación email TLD comunes | Bajo | 3.5 | **P2** | typo `.clm` crea duplicate user |
| V022 | Dos sistemas de cookie coexistiendo sin tests de aislamiento | Bajo op | — | **P2** | `contan2_session` (nuevo) + `ccb_staff` (legacy). Sistemas aislados; sin bug funcional confirmado. Requiere tests que demuestren no-mezcla antes de retirar legacy |

## Plan P0 (bloqueadores)

### Objetivo

Cerrar la superficie de ataque pública crítica **sin romper** flujos legítimos del frontend ni del kiosko.

### Estrategia: middleware mínimo defensivo

**Decisión arquitectónica clave**: aplicar `requireStaffSession` en cada router privado (no a nivel `app.use`), porque algunos routers tienen sub-paths públicos (ej. `credentials/:code.png` es público por diseño dentro de un router que también tiene endpoints privados).

### Cambios por router

#### V001 · `routes/users.js`
```diff
+ import { requireStaffSession } from '../middleware/sessionAuth.js';

  router.post('/', async (req, res, next) => { ... })
- router.post('/bulk', async (req, res, next) => { ... })
+ router.post('/bulk', requireStaffSession, async (req, res, next) => { ... })
  // ... aplicar a todos los handlers
```

Aplicar a TODOS los endpoints. No hay sub-paths públicos.

#### V002 · `routes/activities.js`
Aplicar a TODOS. Las páginas públicas de eventos van por `routes/eventosPublic.js`, que es OK.

#### V003 · `routes/attendance.js`
**Corrección al plan anterior**: el comentario del autor en `routes/attendance.js` indica que `/anonymous` es para uso del staff (grupos en pico, VIP, prensa). El kiosko público usa `/api/public/checkin`. Por tanto **todos los endpoints requieren `requireStaffSession`**, incluyendo `/anonymous`. Si se descubre evidencia de tráfico legítimo anónimo, se documenta excepción y se agrega rate-limit estricto antes de re-abrir.

#### V004 · `routes/dashboard.js`
Todos los handlers privados. Sin excepciones.

#### V005 · `routes/insights.js`
Todos los handlers privados.

#### V006 · `routes/reports.js`
Todos los handlers privados. Además, mover generación a worker (V012, en P1) pero como interim, agregar timeout estricto + queue interna naive si es necesario.

#### V007 · `routes/uploads.js`
`POST /api/uploads/image` requiere auth. Confirmar que la sanitización SVG actual está activa (función `sanitizeSvg` o similar) y agregar test que pruebe payload XSS.

#### V008 · `routes/orgBranding.js`
`GET /api/org/branding` (lectura) → `requireStaffSession` (tier STAFF).
`PATCH /api/org/branding` (escritura, cambia identidad del tenant) → `requireStaffSession` + `requireRole(['admin', 'owner'])`.

#### V008b · `routes/credentials.js` — `POST /:code/send` + público `GET /:code.png`
Estado pre-hardening: el send estaba sin auth (solo rate limit IP 3/min), permitía a anónimo disparar emails vía Resend con cualquier código válido + enumerar existencia por timing. El PNG público incluía el email del visitante embebido en el SVG.

Aplicado en `security/p0-hardening`:
- `POST /:code/send`: `requireStaffSession` (tier STAFF) + rate limit existente + **audit log** `credential.sent` con metadata `{ resendId, emailMasked }` tras envío exitoso (commit `ec98380`).
- `POST /bulk-send`: `requireStaffSession + requireRole(['admin','owner'])` (commit `712e244`). Antes usaba el legacy `requireStaff` que no validaba role.
- `GET /:code.png`: se mantiene público bearer-style (el visitante recibe el link en su email y debe abrirlo sin login), pero:
  - **Email removido del SVG renderizado** (`services/credential.js`, commit `ec98380`). El PNG solo embebe nombre + código + QR.
  - **Rate-limit explícito 60 req/min por IP** (`credentialPngLimit`) aplicado antes del handler.
  - Regex estricto del código mantenido.
- Tests: `test/security/credentials.test.js` cubre auth en send/bulk-send, rate-limit del GET (65 requests rápidos → al menos un 429), verificación de que `generateCredentialPng` no embebe email + lectura estática de `credential.js` que actúa como regression guard (`${email}` y `escapeXml(email)` no aparecen en código activo).

#### V009 · `routes/staff.js` — LEGACY PIN (no aplicar `requireStaffSession`)
Login PIN del scanner antiguo. `POST /login` debe permanecer PUBLIC (lógicamente, igual que cualquier login). `GET /me` y `POST /logout` usan el middleware `staffAuth.js` aislado con cookie `ccb_staff`, no `requireStaffSession`. Este sistema queda como está hasta que se confirme que ningún cliente lo invoca; entonces se retira en una migración separada.

Acción FASE 1.A: documentar en `04-cutover-and-rollback.md` un plan de retiro progresivo:
1. Agregar logging cada vez que se acceda a `routes/staff.js` (qué IP, qué user-agent).
2. Observar por 7 días. Si tráfico = 0, eliminar router + middleware + service.
3. Si hay tráfico, identificar quién y migrar al sistema nuevo antes de retirar.

#### V010 · `routes/tenant.js` — payload public allowlisted
Endpoint público por diseño (necesario para que `branding.js` aplique paleta antes del login).

Acción FASE 1.A: revisar campos retornados y mantener solo lo necesario para branding y kiosko. Excluir explícitamente: `staffPinHash`, `emailReplyTo`, configuración de billing, secretos. Considerar excluir `plan` y `status` (revelan info sobre el tenant que no aporta al branding).

Test obligatorio: snapshot del payload garantiza que campos sensibles no aparecen aunque se agreguen al modelo de DB.

### Tests obligatorios para P0

En `backend/test/security/` (suite Vitest + supertest). Cobertura mínima:

1. `unauth.test.js` — anónimo recibe 401/403 en cada endpoint administrativo privado (lista derivada de doc 05).
2. `rbac.test.js` — operator no puede borrar visitantes/actividades/asistencias, ni cambiar branding, ni exportar reportes con PII (a definir según matriz).
3. `rbac-allowed.test.js` — owner/admin sí pueden ejecutar las operaciones permitidas (positivo).
4. `cross-tenant.test.js` — sesión de tenant A no accede a recursos de tenant B (404 o 403, sin leak de existencia).
5. `platform-isolation.test.js` — platform admin queda separado: sesión de platform admin no actúa como tenant staff y viceversa.
6. `kiosko-public.test.js` — endpoints de `/api/public/*` siguen abiertos, retornan datos esperados, respetan rate limits.
7. `legacy-pin.test.js` — scanner login PIN (`/api/staff/login`) sigue funcionando o, si se decide migrar, queda documentado.
8. `rsvp-public.test.js` — endpoints públicos de RSVP/eventos siguen funcionando para invitados sin sesión.
9. `credentials-send.test.js` — `POST /api/credentials/:code/send` requiere sesión staff; anónimo recibe 401; staff autenticado puede disparar; rate limit por staff aplica.
10. `tenant-payload.test.js` — `GET /api/_tenant` snapshot: no expone hashes, tokens, billing ni configuración sensible.
11. `uploads-svg.test.js` — payload SVG con `<script>` o `onload` queda sanitizado o bloqueado.

Stack: Vitest + supertest. Postgres real (instancia local efímera o Testcontainers). Falla en CI si alguno se rompe.

### Ventana de aplicación P0

Aplicar **en rama `security/p0-hardening`** (cortada desde `multitenant`) primero:
1. Cambios + tests pasando localmente (`backend/test/security/*` con Vitest + supertest).
2. Smoke test autenticado contra Postgres local (dump scrubbed de prod — sin datos reales del CCB).
3. Code review + aprobación explícita del operador antes de merge.
4. Merge a `multitenant` (rama estable actual de producción) bajo ventana baja de tráfico.
5. Deploy a producción con observación de error rate + smoke autenticado post-deploy.

Cada commit en `security/p0-hardening` está aislado por router para permitir revert individual:
- `1f356d2` users + activities
- `522f289` attendance + dashboard + insights
- `c242b63` reports + uploads + orgBranding
- `712e244` credentials + tenant payload
- `abfa09f` orgDomain (hardening completo)
- `ec98380` credentials público (PNG sin email + rate-limit + audit log)
- `497f3c1` uploads SVG (rechazar SVG en filter + sanitizeSvg exportado)

**Rollback**: revertir commit del router específico + redeploy. Cada router es revertible aislado.

## Plan P1 (sprint 1-2)

### V009 · Retirar legacy PIN
- Feature flag `LEGACY_PIN_ENABLED` env var, default `false` en v2.
- En CCB prod, default `true` por backwards-compat 30 días.
- Logging cada uso del PIN → confirmar que llegó a cero antes de retirar el código.

### V010 · Auditar `/api/_tenant`
- Confirmar payload retornado:
  - ✓ `id, slug, name, primaryColor, secondaryColor, sidebarStyle, logoUrl, customDomain, locale, timezone, codePrefix`
  - ✗ Verificar que NO incluya: `staffPinHash`, `emailReplyTo`, secrets futuros de billing
- Test snapshot del payload.

### V011 · Row-Level Security en Postgres

Migración no destructiva por tabla:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_org_isolation ON users
  USING (organization_id = current_setting('app.org_id', true)::uuid);
```

Setear `app.org_id` en cada request:
```ts
await pool.query(`SET LOCAL app.org_id = $1`, [req.organizationId]);
```

Excepción: platform admin bypass con `BYPASSRLS` o role separado.

Aplicar a: `users`, `activities`, `attendance`, `staff_members`, `staff_invitations`, `staff_auth_sessions`, `tenant_audit_log`, `staff_password_resets`.

### V012/V013 · Workers para PDF/Email
Ver `01-target-architecture.md` § apps/worker. BullMQ + Redis. Endpoint cambia de "responde con PDF" a "responde con job ID" + polling/SSE para status.

### V014 · Storage S3-compatible
- Cloudflare R2 (egress gratis para QR descargas).
- Dual-write durante 7 días: upload va a local + R2.
- Validación: count match en ambos.
- Switchover: lecturas pasan a R2, local queda como backup.
- Borrar local después de 30 días sin reportes de assets perdidos.

### V015 · Tests automatizados
- Vitest setup en `apps/api`.
- Cobertura inicial: auth + RBAC (objetivo 90%), attendance (race conditions), uploads (XSS).
- Playwright para flujos críticos: login, check-in, RSVP.

### V016 · CI/CD GitHub Actions
- Workflow `ci.yml`: lint → typecheck → test → build → docker-build.
- Workflow `deploy-staging.yml`: trigger manual + on merge a `develop`.
- Workflow `deploy-prod.yml`: trigger manual con confirmación.

## Plan P2 (backlog)

### V017 · Node 24 LTS
Update `Dockerfile` cuando el ecosistema de deps lo confirme estable (verificar `argon2`, `puppeteer`, `sharp`, `pg`).

### V018 · Rate limit en privados
`@fastify/rate-limit` con keying por `staffId`. Default 100 req/min por staff. Endpoints sensibles (bulk send, exports) con limit más estricto.

### V019 · Observabilidad
- Pino logger en api/worker.
- Sentry DSN config.
- Health endpoints expuestos.
- Métricas básicas: requests/sec, latencia p50/p95/p99, error rate.

### V020 · Race condition capacity
Test concurrente (1,000 requests en paralelo intentando inscribirse a actividad con capacity = 50). Conteo final debe ser exactamente 50.

### V021 · Validador TLD email
Lista de typos comunes (`.clm`, `.con`, `.cmo`, `.gmial.com`, `.gmal.com`) → backend rechaza o sugiere corrección.

## Reglas de oro durante el hardening

1. **Nunca aplicar cambios destructivos a producción directo.** Toda mejora va por la rama de migración.
2. **Toda mejora P0 tiene su test correspondiente** que demuestra que la regla aplica.
3. **El frontend actual no se rompe.** Antes de merge, smoke test del kiosko/admin/scanner contra el branch.
4. **Toda decisión queda documentada en `docs/migration-v2/`.**
5. **Cualquier cambio que toque DB pasa por staging antes de prod.**
6. **Toda migración tiene rollback documentado.**

## Estado inicial de implementación

Al cierre de FASE 0:
- ✅ Auditoría completa
- ✅ Docs `00`, `01`, `02`, `03`, `04` creados
- ⏸️ Cambios P0 al código: **pendientes de aprobación expresa del operador**
- ⏸️ Tests: pendientes
- ⏸️ CI: pendiente

El operador debe aprobar el inicio de FASE 1 (aplicar middleware P0 en la rama migration + tests) antes de tocar `backend/src/routes/*.js`.
