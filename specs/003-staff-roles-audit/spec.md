# Spec 003 — Staff multi-usuario con roles + Audit Log

> **Estado:** Borrador v1
> **Sprint:** 3 de 6 (mes 2, sem 1-2)
> **Depende de:** Sprint 1 (auth) — usa `staff_members`, `staff_sessions`.
> **Bloquea:** Sprint 4 (billing self-service, signup), porque sin
> permisos diferenciados no puede separarse quién paga de quién opera.
> **Autor:** Claude · 2026-05-25

---

## 1. Motivación

Sprint 1 nos dio identidad individual (email + password por staff),
pero todos los autenticados tienen exactamente el mismo poder. Eso es
inaceptable para vender:

- **No hay forma de delegar.** Karen no puede dar acceso al equipo de
  programación sin entregarle también el control de branding, dominio o
  configuración.
- **No hay invitaciones.** Sumar un staff requiere correr un script
  desde el VPS. No es escalable ni profesional.
- **No hay auditoría.** Si alguien borra una actividad por error o si
  un staff suspendido hace algo en su último día, no tenemos registro.
  Para clientes empresariales (CCB y siguientes) esto es bloqueador.

Este sprint cierra **identidad → autorización → trazabilidad**. Después
de este sprint, contan2 es defendible ante un comité de seguridad
corporativo.

---

## 2. Scope

### Sí incluye

| # | Feature | Por qué |
|---|---------|---------|
| F1 | Tres roles dentro del tenant: `owner`, `admin`, `operator` | Mínimo viable para delegar sin sobre-diseñar |
| F2 | Flujo de invitación por email (link + token 24h) | Self-service de onboarding del staff |
| F3 | Vista "Mi equipo" con tabla, invitar, cambiar rol, suspender, eliminar | Karen necesita esto desde el día 1 |
| F4 | Soft-delete del staff (no romper FK histórica de audit/checkins) | Cero pérdida de trazabilidad |
| F5 | `audit_log` (org-scoped) con writes en eventos críticos | Compliance + soporte |
| F6 | Vista de "Bitácora" filtrable por actor, acción, fecha | Permite revisar incidentes sin SQL |
| F7 | Página pública `/invite/:token` para aceptar invitación | UX simple y reusable |
| F8 | Backfill: Karen pasa a `owner` automáticamente | No romper su acceso actual |

### Roles — quién puede qué

| Acción | owner | admin | operator |
|---|---|---|---|
| Operar (check-in, registrar usuarios, ver actividades, ver reportes) | ✅ | ✅ | ✅ |
| Crear/editar actividades | ✅ | ✅ | ✅ |
| Cancelar actividad | ✅ | ✅ | ❌ |
| Editar branding (color, logo, sidebar style) | ✅ | ✅ | ❌ |
| Solicitar/verificar dominio personalizado | ✅ | ✅ | ❌ |
| Invitar / suspender / cambiar role del staff | ✅ | ✅ | ❌ |
| Eliminar staff | ✅ | ❌ | ❌ |
| Transferir ownership | ✅ | ❌ | ❌ |
| Ver bitácora (audit log) | ✅ | ✅ | ❌ |
| Borrar la organización (futuro) | ✅ | ❌ | ❌ |

**Reglas duras:**
- Una org debe tener **siempre al menos un owner activo**. El sistema
  rechaza la última eliminación/suspensión de owner sin transferencia
  previa.
- Un usuario **NO puede modificar su propio role**. Otra persona con
  permisos suficientes debe hacerlo (esto previene escalación accidental).
- Un usuario **NO puede eliminar/suspender su propia cuenta** desde la
  vista admin. (Sí puede hacer logout y cambio de password.)

### No incluye (explícitamente fuera)

- ❌ **Permisos granulares dentro del role** (ej. "puede invitar pero
  no cambiar branding"). Si surge, se agrega un role nuevo, no un grid
  de checkboxes.
- ❌ **Auditoría de TODAS las acciones**. Solo cubrimos auth + staff
  management + un set inicial de eventos críticos (activity cancel,
  branding change, dominio). El resto se va incorporando en sprints
  posteriores.
- ❌ **Retención y exportación del audit log**. Vive en la DB sin TTL.
  Política de retención = futuro.
- ❌ **Notificaciones de invitación pendiente** ("aún no has aceptado").
  Resend cuando se quiera, sí; recordatorio automático, no.
- ❌ **2FA / MFA**. Los hooks ya están en la tabla (Sprint 1) pero la
  implementación no entra acá.
- ❌ **SSO**. Mismo motivo.
- ❌ **Audit log en `platform_admins`**. Cross-tenant queda para Sprint 5.

---

## 3. Casos de uso

### CU1 — Karen invita a un nuevo colega

1. Karen entra a `ccb.contan2.com/#/staff`. Ve su nombre, su rol
   (`owner`), su último login.
2. Click "Invitar persona". Modal pide email + nombre + rol (default
   `operator`).
3. Submit. El colega recibe email con link `https://ccb.contan2.com/invite/<token>`.
   La invitación aparece en la sección "Invitaciones pendientes" con
   "Reenviar" y "Revocar".
4. El colega abre el link, escribe su password (≥ 10 chars), confirma.
5. Cuenta queda `active`. Karen ve el cambio en su lista en cuanto
   recarga.

### CU2 — Karen cambia el rol de un operator a admin

1. En `/staff`, junto al staff, hay un menú "···" con "Cambiar rol".
2. Modal con dropdown. Karen elige "admin".
3. Confirma. La fila se actualiza, queda registrado en audit log.

### CU3 — Operator intenta entrar a `/staff`

1. Login OK como operator.
2. Click en el menú "Mi equipo". El item está oculto en el sidebar
   (gated por role).
3. Si entra a `#/staff` escribiendo URL, la vista muestra "No tienes
   permiso para ver esta sección" (no es un 500, es un empty state
   informativo).

### CU4 — Marcelino revisa qué pasó en una actividad cancelada

1. Karen llama: "alguien canceló el ciclo de cine, no sabemos quién".
2. Marcelino (super admin) impersona o pide a Karen entrar a la
   bitácora. (Impersonation queda Sprint 5; por ahora Marcelino pide
   acceso temporal o Karen mira directo.)
3. Karen filtra `action = activity.cancelled` en las últimas 24h.
4. Ve la fila: actor "carlos@ccb.org", acción "activity.cancelled",
   target "Cine Clásico 2026-05-15", IP hash, timestamp.

### CU5 — Karen suspende a un colega temporalmente

1. En `/staff`, elige "Suspender". Confirma motivo opcional.
2. Backend: marca `status='suspended'`, revoca todas las sesiones del
   staff, audit-loggea.
3. El colega, si está logueado, en la próxima request recibe 401 y va
   al login. Al intentar login: "Cuenta suspendida. Contacta a tu admin."

### CU6 — Karen intenta eliminar al único owner (ella misma)

1. Karen abre el menú "···" en su propia fila. La opción "Eliminar"
   está deshabilitada con tooltip "No puedes eliminarte a ti mismo".
2. Si edita la request HTTP a mano, el backend devuelve 400
   "No puedes eliminarte a ti mismo".
3. Si pide eliminar a otro owner mientras es la única que queda, el
   sistema rechaza con "La organización debe tener al menos un owner".

---

## 4. Requisitos funcionales

- **RF1.** Tabla `staff_members` extendida con columna `role` (`owner`,
  `admin`, `operator`), default `operator`, NOT NULL. Backfill: Karen
  (única que existe) pasa a `owner`.
- **RF2.** Tabla `staff_invitations` (org-scoped, token hasheado, expira
  24h, status `pending|accepted|revoked|expired`).
- **RF3.** Tabla `audit_log` global (no se modifica nunca por staff,
  solo se appendea desde el backend).
- **RF4.** Middleware `requireRole([roles])` que se compone tras
  `requireStaffSession` y bloquea con 403 si el rol del staff no está
  en la lista.
- **RF5.** Endpoints `/api/staff/members/*` y `/api/staff/invitations/*`
  protegidos por `requireRole(['owner','admin'])`.
- **RF6.** Endpoint público `/api/auth/invitation/:token` (GET para
  preview) y `/api/auth/accept-invitation` (POST). Sin auth.
- **RF7.** Endpoint `/api/audit-log` con paginación + filtros (actor,
  action prefix, date range), protegido por `requireRole(['owner','admin'])`.
- **RF8.** Auth flows existentes (login, logout, password change, etc.)
  escriben al audit log con email enmascarado en la metadata.
- **RF9.** Cuando se suspende/elimina un staff, todas sus sesiones se
  revocan inmediatamente.
- **RF10.** El backend rechaza 400 cualquier intento de auto-modificar
  rol o auto-eliminarse desde la API admin.
- **RF11.** El backend rechaza 400 cualquier intento de quitar el
  último owner sin transferencia.

---

## 5. Requisitos no funcionales

- **RNF1.** El audit log es write-only desde el código de aplicación.
  No hay endpoint de DELETE.
- **RNF2.** Cada entrada del audit log incluye: `id`, `org_id`,
  `actor_staff_id` (NULL si fue sistema), `actor_email_masked`,
  `action`, `target_type`, `target_id`, `target_label`, `metadata`
  (jsonb), `ip_hash`, `ua`, `created_at`.
- **RNF3.** Las consultas al audit log siempre filtran por
  `organization_id = req.organizationId`. Cross-tenant queda **prohibido**
  para el tenant admin (solo platform admin podrá ver cross en Sprint 5).
- **RNF4.** Índice en `(organization_id, created_at DESC)` para que el
  scroll de la bitácora sea eficiente.
- **RNF5.** El email de invitación incluye branding del tenant (logo,
  colores), igual que welcomeStaff del Sprint 1.
- **RNF6.** Token de invitación opaco 32 bytes hex; en DB se guarda
  sha256.
- **RNF7.** Sin `audit_log` PII completa: emails enmascarados, no
  passwords ni tokens.

---

## 6. Modelo de datos

### 6.1 `staff_members` (cambio en migración 020)

```sql
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('owner','admin','operator'));

-- Backfill: el staff seedeado por seed-tenant-owner pasa a owner.
-- En prod, Karen es la única que existe.
UPDATE staff_members SET role = 'owner' WHERE role = 'operator';
```

### 6.2 `staff_invitations` (migración 021)

```
id              UUID PK
organization_id UUID FK organizations
email           CITEXT NOT NULL
role            TEXT NOT NULL CHECK (role IN ('owner','admin','operator'))
token_hash      TEXT NOT NULL UNIQUE
invited_by_staff_id UUID NULL FK staff_members
expires_at      TIMESTAMPTZ NOT NULL
status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','revoked','expired'))
accepted_by_staff_id UUID NULL FK staff_members
accepted_at     TIMESTAMPTZ NULL
created_at      TIMESTAMPTZ DEFAULT NOW()

UNIQUE INDEX (organization_id, email) WHERE status = 'pending'
```

Regla: máximo 1 invitación pending por email por organización (re-invitar
revoca la anterior).

### 6.3 `audit_log` (migración 022)

```
id              BIGSERIAL PK
organization_id UUID NOT NULL FK organizations
actor_staff_id  UUID NULL FK staff_members (NULL si fue sistema)
actor_email_masked TEXT NULL  (cache para que el log siga legible aun si el staff se borra)
actor_role      TEXT NULL
action          TEXT NOT NULL  (ej "staff.invited", "activity.cancelled")
target_type     TEXT NULL  (ej "staff_member", "activity")
target_id       TEXT NULL  (id del target, como TEXT por simplicidad)
target_label    TEXT NULL  (ej nombre de la actividad, email del staff)
metadata        JSONB NOT NULL DEFAULT '{}'
ip_hash         TEXT NULL
ua              TEXT NULL
created_at      TIMESTAMPTZ DEFAULT NOW()

INDEX (organization_id, created_at DESC)
INDEX (organization_id, action)
INDEX (organization_id, actor_staff_id) WHERE actor_staff_id IS NOT NULL
```

### 6.4 Catálogo inicial de acciones registradas

```
auth.login                  · ok
auth.login_failed           · email no existe, password mala, lockout
auth.logout
auth.password_changed       · cambio manual autenticado
auth.password_reset_used    · vía link de email
staff.invited
staff.invitation_revoked
staff.invitation_resent
staff.invite_accepted
staff.role_changed          · metadata { from, to }
staff.suspended
staff.reactivated
staff.deleted
activity.created
activity.cancelled
branding.updated
domain.requested
domain.verified
```

El resto de acciones del producto NO se loggean en este sprint. Las
agregamos cuando haya razón (incidente, pedido del cliente, etc.).

---

## 7. UI / Rutas

### 7.1 Admin SPA

Dos rutas nuevas:

- `#/staff` — vista "Mi equipo". Tabla + invitar + acciones por fila.
  Tab secundario "Invitaciones pendientes".
- `#/audit` — vista "Bitácora". Tabla paginada con filtros (actor,
  action, fecha desde/hasta).

Ambos items aparecen en el sidebar SOLO si `currentStaff.role` es
`owner` o `admin`. Operators no las ven.

### 7.2 Página pública de invitación

- `/invite/:token` — landing pública servida por el backend (similar
  a `/rsvp/:token`). No requiere auth.
  - GET cargada con info de la invitación (organización, email, role,
    expiración).
  - Form para nombre completo (si no se pasó al invitar) + password +
    confirmar password.
  - Submit envía a `/api/auth/accept-invitation`.
  - Si token inválido/expirado/usado: mensaje claro + link a la landing
    principal.

---

## 8. Migración del estado actual

- Karen (única staff) ya existe. La migración 020 le asigna `role='owner'`
  por backfill.
- Cualquier otra cuenta seedeada después de la migración 020 con el
  script `seed-tenant-owner.mjs` debe explícitamente setear `role='owner'`.
- Operators y admins se crean SOLO vía el flujo de invitación nuevo.

---

## 9. Seguridad

- Token de invitación opaco 32 bytes hex en email + URL; sha256 en DB.
  Verificación constant-time.
- Una invitación aceptada NO puede ser re-usada (status → `accepted`).
- Si el email del invitado ya tiene cuenta `active` en la org, la
  invitación se rechaza al crearse con 409.
- Al suspender o eliminar un staff, se revocan TODAS sus sesiones en
  la misma transacción.
- `requireRole` corre SIEMPRE después de `requireStaffSession`. Sin
  sesión válida, no llega.
- Bitácora: `actor_email_masked` se calcula al insert; **no** join en
  cada lectura (evitamos exponer email completo si el actor se borró).

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Eliminación accidental del último owner | Backend valida antes de UPDATE/DELETE; UI deshabilita la opción |
| Audit log crece descontrolado | Índices correctos + futuro retention policy (Sprint 5+) |
| Spam de invitaciones (un admin invita 1000 emails) | Rate limit 20 invitaciones/h/staff (in-memory) |
| Race: 2 admins invitan al mismo email a la vez | Constraint UNIQUE pending → la segunda recibe 409 |
| Cambio de role escala accidental | Self-modify bloqueado; cambio loggeado |

---

## 11. Métricas (post-deploy)

- Nº de invitaciones enviadas vs aceptadas (conversión).
- Distribución de roles por tenant.
- Tasa de uso de la bitácora (cuántos accesos/semana).
- Acciones más loggeadas (validar que el catálogo cubre lo importante).

---

## 12. Decisiones tomadas

| Pregunta | Decisión | Por qué |
|---|---|---|
| ¿3 roles o granular? | 3 roles | Mínimo viable, fácil de explicar |
| ¿Audit log = solo append? | Sí | Compliance + integridad |
| ¿Invitaciones con o sin nombre del invitado en el modal? | Con nombre opcional | UX más fluido pero no requerido |
| ¿Token de invitación expira en cuántas horas? | 24h | Estándar; suficiente para emails de Resend que tardan + zona horaria |
| ¿Revocar sesiones al suspender? | Sí | Higiene; el suspended NO puede seguir operando |
| ¿Permitir auto-cambio de rol? | No | Anti-escalación accidental |
| ¿Borrar audit log de staff borrado? | No | Pierde valor de auditoría; mantenemos `actor_email_masked` cacheado |
