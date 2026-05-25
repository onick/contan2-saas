# Spec 004 — Platform admin module (super admin SaaS owner)

> **Estado:** Borrador v1
> **Sprint:** 4 de 6 (mes 2, sem 3-4)
> **Depende de:** Sprint 1 (platform_admins), Sprint 3 (audit log)
> **Autor:** Claude · 2026-05-25

---

## 1. Motivación

El platform-dashboard actual (post Sprint 1) es un placeholder: un header,
4 KPIs en 0 (porque no hay endpoint) y un texto "la gestión llega en
Sprint 2". Marcelino acaba de loggear y se encuentra con una pantalla
sin nada operativo.

Este sprint **convierte el módulo de super admin en un panel real**:
sidebar profesional, vistas funcionales, datos cross-tenant agregados,
y todas las acciones operativas que necesita el owner del SaaS.

---

## 2. Scope

### Sí incluye

| # | Feature | Por qué |
|---|---------|---------|
| F1 | Layout con sidebar dark + topbar + main | UX coherente con el panel de tenant |
| F2 | Router cliente con hashes (`#/operacion`, `#/tenants`, etc.) | Una SPA sencilla, igual que el admin de tenant |
| F3 | Vista **Operación** (dashboard) con KPIs reales cross-tenant + actividad reciente | Lo que reemplaza al placeholder actual |
| F4 | Vista **Tenants** con tabla + búsqueda + detalle | Lo central del sprint |
| F5 | Vista **Detalle de tenant** con KPIs por org, staff, branding, dominio | Drill-down operativo |
| F6 | Vista **Bitácora global** cross-tenant | Compliance + soporte |
| F7 | Vista **Mi cuenta** con cambio de password + sesiones activas | Higiene del super admin |
| F8 | Banner global cuando `mustChangePassword=true` | Forzar el cambio al primer login |
| F9 | Acción "suspender / reactivar tenant" desde detalle | Control operativo |

### No incluye (fuera de este sprint)

- ❌ **Impersonation** (login as tenant staff) — requiere modelo de
  sesión cross-tenant, queda para Sprint 5.
- ❌ **Billing/Stripe** — Sprint 4 backend separado.
- ❌ **Crear tenant desde el panel** (signup self-service) — Sprint 5.
- ❌ **Edit branding cross-tenant** — el tenant lo edita en su panel.
- ❌ **Notificaciones / alertas in-app** — futuro.
- ❌ **Métricas históricas / gráficos** — solo snapshot + bitácora.

---

## 3. UI / Vistas

### 3.1 Layout

```
+----------------------------------------------------------------+
| [c2] contan2 / plataforma                Marcelino · [Logout]  |
+--------+-------------------------------------------------------+
|        |                                                       |
| Side   |          Main content                                 |
| bar    |          (vista actual)                               |
|        |                                                       |
|        |                                                       |
+--------+-------------------------------------------------------+
```

Sidebar dark con fondo `#0b1220 → #0f172a`, accent `#f59e0b` (mismo
acento que el login del platform). Items:

- 📊 **Operación**     — `#/operacion`
- 🏢 **Tenants**       — `#/tenants`
- 📜 **Bitácora**      — `#/audit`
- 👤 **Mi cuenta**     — `#/account`

Topbar: brand a la izquierda (puede quedarse), usuario + logout a la
derecha. El nombre del usuario y el botón "cerrar sesión" siguen visibles.

### 3.2 Operación (dashboard)

- 4 KPIs grandes (mismas que hoy, pero con datos reales):
  - Tenants activos
  - Usuarios totales (suma cross-tenant de `users`)
  - Asistencias totales (suma cross-tenant)
  - Actividades activas (suma de actividades futuras/en curso)
- Card secundaria: **Actividad reciente** — últimos 8 eventos del
  `tenant_audit_log` cross-tenant (action, actor, tenant, hace cuánto).
- Card secundaria: **Top tenants por asistencias últimos 30 días**
  (top 5 — cuando haya >1 tenant, mientras tanto un solo row).

### 3.3 Tenants

- Tabla con: Nombre, Slug, Plan, Status, Usuarios, Asistencias 30d,
  Última actividad, Acciones (ver detalle).
- Buscador por nombre o slug.
- Empty state si no hay tenants (no debería pasar, pero defensivo).
- Click en una fila → navega a `#/tenants/<id>`.

### 3.4 Detalle de tenant

- Header con: nombre, slug, plan badge, status badge, custom domain,
  fecha de creación.
- Acciones rápidas (botones):
  - Suspender / reactivar.
  - Abrir el panel del tenant en nueva tab (link directo al subdomain).
- Sub-secciones (cards):
  - **KPIs del tenant** — usuarios, asistencias 30d, actividades, staff.
  - **Staff de este tenant** — tabla read-only (no admin de staff
    desde acá; eso lo hace el owner del tenant).
  - **Branding actual** — preview de colores + logo.
  - **Custom domain** — estado de verificación.
  - **Última actividad** — últimos 5 eventos del audit log de este
    tenant.

### 3.5 Bitácora global

Misma UI que la bitácora del tenant (Sprint 3) pero **cross-tenant**:
- Tabla con columna extra "Tenant" (slug + nombre).
- Filtros: acción, tenant (dropdown), actor (texto), rango de fechas.
- Paginación cursor.

### 3.6 Mi cuenta

- Card "Tu cuenta": nombre, email, último login.
- Card "Cambiar contraseña" — actual + nueva + confirmar.
- Card "Sesiones activas" — tabla con UA, IP hasheada, creada hace,
  expira en, botón "Cerrar" por sesión (excepto la actual).

---

## 4. Backend — endpoints nuevos

Montados en `/api/platform/*`, protegidos por `requirePlatformAdmin`.

| Método | Path | Devuelve |
|---|---|---|
| GET | `/api/platform/kpis` | `{ tenants, activeTenants, users, attendances, activeActivities, recentAuditEntries }` |
| GET | `/api/platform/tenants?q=` | `{ tenants: [{ id, slug, name, plan, status, usersCount, attendancesCount30d, activitiesActive, lastActivityAt, customDomain, customDomainVerifiedAt, createdAt }] }` |
| GET | `/api/platform/tenants/:id` | `{ tenant: {...}, kpis: {...}, staff: [...], recentAudit: [...] }` |
| POST | `/api/platform/tenants/:id/suspend` | `{ ok, tenant }` (set `status='suspended'`) |
| POST | `/api/platform/tenants/:id/reactivate` | `{ ok, tenant }` |
| GET | `/api/platform/audit-log?...` | Igual que `/api/audit-log` pero cross-tenant + filtro por tenant |
| (ya existe) GET | `/api/platform/auth/me` |
| (ya existe) POST | `/api/platform/auth/change-password` |
| (ya existe) GET | `/api/platform/auth/sessions` |
| (ya existe) DELETE | `/api/platform/auth/sessions/:id` |

### Reglas duras

- **`/api/platform/*` SIEMPRE requiere `requirePlatformAdmin`.** Sin
  excepciones.
- El audit del platform admin se loggea como acción cross-tenant
  (org_id = el tenant afectado; actor = platform admin).
- Suspender/reactivar tenant escribe entry `tenant.suspended` /
  `tenant.reactivated` con `actor_staff_id=NULL` pero
  `actor_email_masked` del platform admin (campo libre para identificar).

---

## 5. Persistencia / SQL

No requiere migración nueva. Aprovecha:
- `organizations` (lista de tenants, plan, status, custom domain).
- `users`, `activities`, `attendance` (counts).
- `staff_members` (cuenta por tenant).
- `tenant_audit_log` (cross-tenant cuando filtras sin `WHERE org_id`).
- `platform_admins`, `platform_sessions`, `platform_password_resets`.

---

## 6. Seguridad

- Cookie del platform separa de la del tenant (`contan2_admin_session`),
  ya está implementado desde Sprint 1.
- El platform admin **NO** puede usar su cookie para entrar a un panel
  de tenant (cross-tenant access bloqueado por `requireStaffSession`).
- El cambio de pass del platform admin revoca todas las otras sesiones
  de la cuenta.
- Audit del platform admin **NO** queda en una bitácora separada — usa
  `tenant_audit_log` con la org afectada. Esto permite que el owner del
  tenant también vea cuando un platform admin tocó algo.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Endpoint `/api/platform/kpis` pesado con muchos tenants | Limitar agregados, cachear 60s |
| Cross-tenant audit log con muchos rows | Paginación cursor + índices que ya creamos |
| Suspender un tenant con users activos sin avisarles | Audit log + email (próximo sprint) |
| El platform admin se auto-cambia la pass y se queda fuera | Mismo flujo que tenant — recovery por email funciona |

---

## 8. Decisiones tomadas

| Pregunta | Decisión | Por qué |
|---|---|---|
| ¿Sidebar dark o light en platform? | Dark | Diferencia visual fuerte vs panel tenant |
| ¿Vista "Crear tenant"? | No por ahora | Signup self-service es Sprint 5 |
| ¿Login as tenant (impersonation)? | No | Requiere flujo de sesión nuevo; Sprint 5 |
| ¿Audit cross-tenant es un endpoint o filter? | Endpoint dedicado `/api/platform/audit-log` | Mejor enforcement del rol |
| ¿KPIs en tiempo real o cacheados? | Cache 60s server-side | Suficiente, evita query pesada cada hit |
