# Tasks 003 — Staff roles + Audit log

## Fase A — Migrations

- [x] A1. `020_staff_member_role.sql` con backfill a owner
- [x] A2. `021_staff_invitations.sql`
- [x] A3. `022_audit_log.sql`

## Fase B — Repos

- [x] B1. Extender `StaffMemberRepository` (rol, list, updateRole, updateStatus, softDelete, countOwners)
- [x] B2. `StaffInvitationRepository`
- [x] B3. `AuditLogRepository`

## Fase C — Servicios y middleware

- [x] C1. `auditService.js` con `recordAudit({req, action, ...})`
- [x] C2. Audit writes en `tenantAuthService` (login, login_failed, logout, password_changed, password_reset_used)
- [x] C3. `requireRole.js` middleware

## Fase D — Endpoints

- [x] D1. `routes/staffManagement.js` con CRUD de staff + invitaciones
- [x] D2. `routes/auth.js` extendido con `GET /invitation/:token` y `POST /accept-invitation`
- [x] D3. `routes/auditLog.js` con paginación + filtros
- [x] D4. Wire en `server.js`

## Fase E — Email

- [x] E1. Template `sendStaffInvitationEmail` en `authEmails.js`

## Fase F — Frontend

- [x] F1. Página pública `/invite/:token` (invite.html + invite.js) servida con branding
- [x] F2. Vista `#/staff` en admin SPA (staff-admin.js + sección en index.html)
- [x] F3. Vista `#/audit` en admin SPA (audit-admin.js + sección en index.html)
- [x] F4. Sidebar: gating de items por rol (oculto para operator)
- [x] F5. `ensureAuthenticated()` guarda el rol del usuario

## Fase G — Validación

- [x] G1. Smoke: migration aplica, Karen sube a owner (defer a deploy real con DB postgres)
- [x] G2. Smoke local: endpoints retornan 401 sin sesión, 200 con sesión
- [x] G3. Smoke local: routing del marketing host y tenant intactos
- [x] G4. Smoke local: /invite/:token sirve invite.html con resolveTenant

## Fase H — Release

- [ ] H1. Commit en `develop`
- [ ] H2. Push a `origin/develop`
