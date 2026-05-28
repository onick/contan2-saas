# Tasks 004 — Platform admin module

## A · Backend
- [x] A1. Router `routes/platformAdmin.js` con KPIs + tenants + audit cross-tenant + suspend/reactivate.
- [x] A2. Wire en `server.js` (`/api/platform`, requirePlatformAdmin globally).
- [x] A3. Cache in-memory 60s para `/api/platform/kpis`.
- [x] A4. Suspend/reactivate escribe a `tenant_audit_log`.

## B · Frontend
- [x] B1. `platform-dashboard.html` rediseñado con sidebar + topbar + main.
- [x] B2. `platform-app.js` (router cliente, fetch helpers, Toast/Modal mínimos).
- [x] B3. `platform-views.js` con vistas: Operación, Tenants, TenantDetail, Audit, Account.
- [x] B4. CSS dedicado `platform.css`.
- [x] B5. Banner `mustChangePassword` global.

## C · Validación + release
- [ ] C1. Smoke local.
- [ ] C2. Commit + push develop, merge a multitenant, redeploy.
- [ ] C3. Verificar en admin.contan2.com con Marcelino.

## D · Backlog futuro

### D1. Platform admin impersonation / soporte temporal
Permitir que un platform admin entre al panel de un tenant sin tener credencial staff propia, para tickets de soporte. No implementado por ahora — el botón "Abrir panel del tenant" abre el login del tenant y exige credencial staff (sesión super admin no se comparte, ver fix UX 2026-05-27).

**Requisitos cuando se implemente:**
- **Auditoría obligatoria**: cada inicio de impersonation escribe a `tenant_audit_log` con `actor_type='platform_admin'`, `actor_id`, `tenant_id`, `reason` (campo libre), `started_at`, `expires_at`, `ended_at` (null hasta logout/expira).
- **Expiración corta**: sesión impersonada vive máximo 30 min, no renovable. Pasado el TTL, se invalida server-side y el SPA redirige a logout.
- **Banner visible no descartable**: dentro del tenant, todo el chrome muestra un banner rojo/ámbar `⚠ Sesión de soporte de plataforma · expira en HH:MM · todas las acciones quedan en bitácora`. No se puede minimizar.
- **Scope limitado**: la sesión impersonada NO debe permitir acciones destructivas (DELETE staff, DELETE actividades, cambiar dueño, exportar PII masivo). Whitelist explícita de lectura + soporte (resetear contraseña de staff, reenviar credencial a visitante).
- **Logout explícito**: botón "Salir de soporte" siempre visible en el banner. Logout limpia la cookie y vuelve a `admin.contan2.com/#/tenants/<id>`.
- **Notificación al owner**: cuando un platform admin inicia impersonation, el owner del tenant recibe email automático (`Marcelino abrió sesión de soporte en CCB — expira 14:32 — bitácora aquí`). No-op si owner=el mismo platform admin.
- **No reutilizar `platform_sessions`**: tabla aparte `tenant_support_sessions` con FK a `platform_admins` y `organizations` + expires_at + ended_at + reason. Esto deja la sesión super admin original intacta.

**Razón de NO implementarlo todavía**: el flujo actual (super admin abre tab nuevo, loguea con su credencial staff personal si la tiene) es seguro por defecto; el costo de hacerlo mal (super admin con acceso write a todos los tenants sin auditoría) supera el ahorro de UX. Pendiente hasta que tengamos ≥1 ticket de soporte real donde el owner pida explícitamente acceso temporal y no podamos resolverlo de otra forma.
