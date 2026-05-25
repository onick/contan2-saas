# Plan técnico 003 — Staff roles + Audit log

> Cómo aterrizamos la spec. Orden, archivos, decisiones de librería.

---

## 1. Migrations (020-022)

### 020_staff_member_role.sql
```sql
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('owner','admin','operator'));

-- Backfill defensivo: cualquier staff existente (que vino del seed
-- de Sprint 1) era de hecho el "owner" del tenant — el script de seed
-- crea SOLO la cuenta primaria.
UPDATE staff_members
   SET role = 'owner'
 WHERE role = 'operator'
   AND organization_id IN (SELECT id FROM organizations);
```

### 021_staff_invitations.sql
```sql
CREATE TABLE IF NOT EXISTS staff_invitations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email                CITEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('owner','admin','operator')),
  full_name            TEXT NULL,
  token_hash           TEXT NOT NULL UNIQUE,
  invited_by_staff_id  UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  expires_at           TIMESTAMPTZ NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','accepted','revoked','expired')),
  accepted_by_staff_id UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  accepted_at          TIMESTAMPTZ NULL,
  revoked_at           TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1 invitación pending por email por org
CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_unique_pending
  ON staff_invitations (organization_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS staff_invitations_org_idx
  ON staff_invitations (organization_id, created_at DESC);
```

### 022_audit_log.sql
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_staff_id      UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  actor_email_masked  TEXT NULL,
  actor_role          TEXT NULL,
  action              TEXT NOT NULL,
  target_type         TEXT NULL,
  target_id           TEXT NULL,
  target_label        TEXT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash             TEXT NULL,
  ua                  TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_org_time_idx
  ON audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_org_action_idx
  ON audit_log (organization_id, action);
CREATE INDEX IF NOT EXISTS audit_log_org_actor_idx
  ON audit_log (organization_id, actor_staff_id)
  WHERE actor_staff_id IS NOT NULL;
```

Migrations corren al boot (igual que el resto). El backfill del 020 toma
todos los staffs existentes y los marca como `owner`. En prod, esto
afecta solo a Karen.

---

## 2. Repositorios nuevos / cambios

### Cambios en `StaffMemberRepository`
- `rowToStaff` incluye `role`.
- Métodos nuevos:
  - `listByOrganization(organizationId)` — para la vista staff.
  - `updateRole(staffId, role)` — UPDATE simple.
  - `updateStatus(staffId, status)` — para suspended/active/deleted.
  - `softDelete(staffId)` — `deleted_at = NOW()`, `status = 'deleted'`.
  - `countOwners(organizationId)` — para enforcement de "al menos 1".

### `StaffInvitationRepository` (nuevo)
- `create({ organizationId, email, role, fullName, tokenHash, invitedByStaffId, expiresAt })`
- `findByTokenHash(tokenHash)` — devuelve invitación + organization joined (o aparte).
- `findPendingByEmail(organizationId, email)`
- `listByOrganization(organizationId, { status })`
- `markAccepted(invitationId, acceptedByStaffId)`
- `markRevoked(invitationId)`
- `regenerateToken(invitationId, newTokenHash, newExpiresAt)` — para "Reenviar"

### `AuditLogRepository` (nuevo)
- `record({ organizationId, actorStaffId, actorEmailMasked, actorRole,
   action, targetType, targetId, targetLabel, metadata, ipHash, ua })`
   — INSERT. **No** lanza si la org no existe (best-effort; nunca tumbar
   un request por audit).
- `list({ organizationId, limit, before, action, actorStaffId, since, until })`
  — paginación cursor por `created_at` desc + id; filtros opcionales.

---

## 3. Servicios

### `auditService.js` (nuevo en `services/auth/`)

```js
export async function recordAudit({
  req,        // request — extraemos org, actor, ip, ua
  action,     // string
  targetType, // string opcional
  targetId,
  targetLabel,
  metadata,   // objeto opcional
}) { ... }
```

- Toma `req.organizationId`, `req.currentStaff`, `req.ip`, `req.headers['user-agent']`.
- Si la entrada falla (DB caída), loggea WARN pero **no** propaga el error.
- Hashea la IP igual que el sessionService (sha256 + truncate).

### Cambios en `tenantAuthService.js`

- Tras login OK: `recordAudit({ action: 'auth.login', ... })`.
- Login fallido: `recordAudit({ action: 'auth.login_failed', metadata: { reason } })`.
  Esto se hace SIN `req.currentStaff` (no hay aún) pero sí podemos cachear
  `actor_email_masked = maskEmail(intent.email)`.
- Logout / password change / reset usado: idem.

---

## 4. Middleware `requireRole`

`backend/src/middleware/requireRole.js`:

```js
export function requireRole(allowed) {
  const set = new Set(allowed);
  return function (req, res, next) {
    if (!req.currentStaff) return next(new HttpError(401, 'No autenticado'));
    if (!set.has(req.currentStaff.role)) {
      return next(new HttpError(403, 'No tienes permiso para esta acción.'));
    }
    next();
  };
}
```

**Composición típica:**
```js
router.get('/members', requireStaffSession, requireRole(['owner','admin']), handler);
```

Para mantener el bundle de `requireStaffSession` ya en uso por
endpoints `/api/auth/*` y `/api/users`, etc. cuando entran al modo
nuevo, NO modificamos endpoints legacy aún. La compuerta es por endpoint
nuevo.

---

## 5. Routers nuevos

### `routes/staffManagement.js` — NUEVO

Para no chocar con `staff.js` legacy (PIN), creamos un router distinto
montado en `/api/staff/members` y `/api/staff/invitations`. **No** se
mezcla con `/api/staff/login` legacy.

Endpoints:

```
GET    /api/staff/members
POST   /api/staff/members/:id/role          { role }
POST   /api/staff/members/:id/suspend
POST   /api/staff/members/:id/reactivate
DELETE /api/staff/members/:id

GET    /api/staff/invitations
POST   /api/staff/invitations                { email, fullName?, role }
POST   /api/staff/invitations/:id/resend
POST   /api/staff/invitations/:id/revoke
```

Todos requieren `requireStaffSession + requireRole(['owner','admin'])`.
Eliminación de staff y "cambio de role a owner" requieren además
`requireRole(['owner'])` (validado dentro del handler).

### `routes/auth.js` — EXTENDIDO

```
GET  /api/auth/invitation/:token       (público; preview)
POST /api/auth/accept-invitation       (público; { token, password, fullName? })
```

### `routes/auditLog.js` — NUEVO

```
GET /api/audit-log?limit=&before=&action=&actor=&since=&until=
```

Devuelve `{ entries: [...], nextCursor: string|null }`.

---

## 6. Frontend (admin SPA)

### Cambios mínimos en infra

- `app.js` debe leer `currentStaff.role` desde `/api/auth/me`. Ya
  tenemos `ensureAuthenticated()`; ampliamos para guardar `role`.
- El sidebar oculta items `staff` y `audit` cuando `role === 'operator'`.

### Nuevas vistas

- `frontend/staff-admin.js` + sección en `index.html` con id
  `#view-staff`. Tabla de miembros + invitaciones pendientes.
- `frontend/audit-admin.js` + sección con id `#view-audit`. Tabla
  con filtros.

Estilo: reutiliza tokens y clases del admin (`.table`, `.btn`, etc.).
No introducimos nuevas paletas.

### Modales

- Invitar staff (nuevo, en `staff-admin.js`).
- Cambiar rol (nuevo).
- Confirmar suspensión / eliminación (reusa `Modal.confirm` existente).

### Página pública de invitación

- `frontend/invite.html` (nueva, sin sidebar) + `frontend/invite.js`.
- Servida por backend con `serveHtmlWithBranding` (para inyectar el
  branding del tenant al que se está invitando).

---

## 7. Backend wiring (server.js)

- Importar nuevos routers.
- Montar `/api/staff/members`, `/api/staff/invitations`, `/api/audit-log`.
- Ruta `GET /invite/:token` que sirve `invite.html` con SSR de branding.

---

## 8. Tests (manuales)

1. Migration aplica en DB local (Postgres con `DB_DRIVER=postgres`).
   Karen pasa a `owner` (verificable con SELECT).
2. Login de Karen → ver "Mi equipo" + "Bitácora" en sidebar.
3. Crear operator de prueba vía invitación → email enviado → aceptar
   → login OK → no ve "Mi equipo".
4. Cambiar role del operator a admin → ve la sección al re-loggear.
5. Suspender admin de prueba → sus sesiones se revocan → 401 en su
   próxima request.
6. Bitácora: ver entries de los pasos anteriores.
7. Owner único intenta eliminarse → 400.

---

## 9. Riesgos técnicos

| Riesgo | Mitigación |
|---|---|
| Audit log nunca debe tumbar un request | `try/catch` en `recordAudit`; falla → WARN, no throw |
| Migration 020 corre dos veces (re-deploy) | `IF NOT EXISTS` + el backfill solo afecta filas con role default — idempotente |
| Sesión existente queda "stale" cuando el role cambia | `requireRole` lee `req.currentStaff.role` que viene del repo en cada request; queda fresco |
| Email del invitado coincide con un existing user `deleted_at IS NOT NULL` | El UNIQUE solo aplica a `deleted_at IS NULL`, así que se puede invitar de nuevo |

---

## 10. Orden de implementación

1. ✅ Spec, plan, tasks.
2. Migrations 020-022.
3. Repos: `StaffInvitationRepository`, `AuditLogRepository`. Extensión
   de `StaffMemberRepository`.
4. Servicios: `auditService`. Extensión de `tenantAuthService` (audit
   writes).
5. Middleware: `requireRole`.
6. Router `staffManagement.js` + endpoints en `auth.js` para invitación
   pública. Router `auditLog.js`.
7. Wire en `server.js`.
8. Emails: template de invitación (reusar `authEmails.js`).
9. Frontend: vistas staff/audit + página invite. Update de sidebar.
10. Smoke local + commit.
