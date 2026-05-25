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
