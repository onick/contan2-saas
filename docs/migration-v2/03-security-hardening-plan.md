# 03 · Plan de hardening de seguridad

> Vulnerabilidades identificadas en el audit (`00-current-state-audit.md`) clasificadas por prioridad, con plan de remediación concreto.
> P0 = bloqueador antes de exponer a un segundo tenant. P1 = sprint 1-2. P2 = backlog.

## Matriz de severidad

| ID | Vulnerabilidad | Severidad | CVSS aprox | Prio | Evidencia |
|---|---|---|---|---|---|
| V001 | `/api/users` sin auth | Crítico | 9.8 | **P0** | `backend/src/routes/users.js` — 0 refs `requireStaffSession` |
| V002 | `/api/activities` sin auth | Crítico | 9.8 | **P0** | `backend/src/routes/activities.js` — 0 refs |
| V003 | `/api/attendance` sin auth | Crítico | 9.8 | **P0** | `backend/src/routes/attendance.js` — 0 refs |
| V004 | `/api/dashboard` sin auth | Alto | 8.2 | **P0** | `backend/src/routes/dashboard.js` — 0 refs |
| V005 | `/api/insights` sin auth | Alto | 8.2 | **P0** | `backend/src/routes/insights.js` — 0 refs |
| V006 | `/api/reports` sin auth + DoS síncrono | Alto | 8.5 | **P0** | `backend/src/routes/reports.js` — 0 refs |
| V007 | `/api/uploads/image` sin auth + SVG XSS | Alto | 7.5 | **P0** | `backend/src/routes/uploads.js` — 0 refs |
| V008 | `/api/org/branding` sin auth | Alto | 7.8 | **P0** | `backend/src/routes/orgBranding.js` — 0 refs |
| V009 | `staff.js` legacy PIN sin guard | Medio | 6.5 | **P1** | `backend/src/routes/staff.js` — 0 refs |
| V010 | `tenant.js` `/api/_tenant` info | Medio | 5.0 | **P1** | Confirmar payload no expone secrets |
| V011 | Sin RLS en Postgres | Medio | 7.2 | **P1** | 0 `CREATE POLICY` en migrations |
| V012 | PDF/Excel síncronos en HTTP | Alto técnico | — | **P1** | `routes/reports.js` invoca Puppeteer en handler |
| V013 | Emails síncronos | Medio técnico | — | **P1** | `services/email.js` desde HTTP request |
| V014 | Uploads solo en disco local | Medio | 6.0 | **P1** | `backend/data/uploads/` único storage |
| V015 | Cero tests automatizados | Crítico técnico | — | **P1** | 0 archivos `*.test.js` |
| V016 | Cero CI/CD | Crítico técnico | — | **P1** | `.github/workflows/` inexistente |
| V017 | Node 20 EOL próximo | Bajo | 4.0 | **P2** | `Dockerfile` `node:20-bookworm-slim` |
| V018 | Sin rate limit en privados | Medio | 5.5 | **P2** | Solo login/forgot tienen limit |
| V019 | Sin observabilidad (Sentry/Pino) | Medio op | — | **P2** | Sin logger estructurado |
| V020 | Race condition capacity attendance | Medio | 5.8 | **P2** | Confirmar atomicidad SQL |
| V021 | Sin validación email TLD comunes | Bajo | 3.5 | **P2** | typo `.clm` crea duplicate user |

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
**Excepción**: `POST /api/attendance/anonymous` debe permanecer público (kiosko anónimo). El resto, todos requieren auth.

#### V004 · `routes/dashboard.js`
Todos los handlers privados. Sin excepciones.

#### V005 · `routes/insights.js`
Todos los handlers privados.

#### V006 · `routes/reports.js`
Todos los handlers privados. Además, mover generación a worker (V012, en P1) pero como interim, agregar timeout estricto + queue interna naive si es necesario.

#### V007 · `routes/uploads.js`
`POST /api/uploads/image` requiere auth. Confirmar que la sanitización SVG actual está activa (función `sanitizeSvg` o similar) y agregar test que pruebe payload XSS.

#### V008 · `routes/orgBranding.js`
Cambiar branding del tenant = acción admin/owner. Aplicar `requireStaffSession` + `requireRole(['admin', 'owner'])`.

### Tests obligatorios para P0

En `apps/api/test/security/` (o si seguimos en monolito, `backend/test/security/`):

1. `unauth.test.js` — 21 tests, uno por endpoint privado, anónimo → 401.
2. `cross-tenant.test.js` — staff de tenant A intenta hit endpoint con datos de tenant B → 403 o 404 (no leak existence).
3. `rbac.test.js` — operator intenta DELETE actividad → 403.
4. `public-stays-public.test.js` — kiosko/RSVP/eventos siguen abiertos.

Usar Vitest + supertest con Postgres real (Testcontainers o instancia local efímera). Falla en CI si alguno se rompe.

### Ventana de aplicación P0

Aplicar **en rama `migration/saas-platform-v2-parallel`** primero:
1. Cambios + tests pasando localmente.
2. Smoke test contra Postgres dump de prod (no contra prod directo).
3. Merge a `develop`.
4. Deploy a staging (si hay) o canary deploy en horario bajo tráfico.
5. Verificar que el frontend actual no se rompe (envía cookie correctamente).
6. Merge a `multitenant` + deploy.

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
