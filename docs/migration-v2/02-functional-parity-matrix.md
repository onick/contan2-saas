# 02 · Matriz de paridad funcional

> Mapeo: módulos del producto actual → estado v1 → target v2 → criterios de aceptación.
> Cada módulo no se declara "migrado" hasta cumplir TODOS los criterios.

## Estado de paridad

Leyenda:
- 🟢 Implementado y verificado
- 🟡 Implementado parcial / sin tests
- 🔴 No implementado en v2

## Módulos

### 1. Branding y resolución de tenant

| Aspecto | v1 actual | v2 target |
|---|---|---|
| Subdomain `<tenant>.contan2.com` | ✅ middleware `resolveTenant` | 🔴 Migrar a apps/web + apps/api con misma lógica |
| Custom domain | ✅ verificado por DNS TXT | 🔴 Mantener + agregar tests |
| Logo del tenant | ✅ `logoUrl` desde DB | 🔴 `<TenantLogo>` componente shared |
| Paleta (primary/accent) | ✅ generada HSL en runtime cliente | 🔴 SSR de tokens CSS desde server (sin FOUC) |
| Sidebar style (brand/dark/light) | ✅ aplicado por branding.js | 🔴 server-side render |
| Emails branded | ✅ paleta inyectada en HTML | 🔴 React Email templates con tokens |
| Credenciales QR branded | ✅ CR80 con gradient cyan-teal | 🔴 Generado por worker, no por HTTP |

**Aceptación**: CCB renderiza idéntico en v2 antes de cualquier otro tenant. Tests E2E que cargan ccb.contan2.com en Playwright y verifican logo, paleta y sidebar.

### 2. Login, sesiones y RBAC

| Aspecto | v1 actual | v2 target |
|---|---|---|
| Hashing | ✅ Argon2id | 🔴 Misma lógica, package shared |
| Sesiones opacas HttpOnly | ✅ `__c2_staff` cookie | 🔴 Misma cookie, mismo storage en DB |
| Roles owner/admin/operator | ✅ `staff_members.role` | 🔴 RBAC policies en `packages/auth` |
| Reset por email | ✅ token + Resend | 🔴 Job idempotente en worker |
| Platform admin separado | ✅ admin.contan2.com | 🔴 Mismo subdomain, código compartido |
| PIN legacy | 🟡 aún activo en `staff.js` | 🔴 **Retirar tras 30 días sin uso** |
| Tests de aislamiento cross-tenant | 🔴 no existen | 🔴 Vitest + Playwright |

**Aceptación**: tests automatizados que demuestran (a) staff tenant A no accede a tenant B, (b) anónimo no accede a rutas privadas, (c) operator no puede gestionar staff. PIN legacy con feature flag `LEGACY_PIN_ENABLED=false` por default en v2.

### 3. Gestión de visitantes

| Aspecto | v1 actual | v2 target |
|---|---|---|
| CRUD | 🔴 sin auth (P0) | 🔴 Endpoints protegidos con RBAC granular |
| Búsqueda + segmentos | ✅ search client-side + segments rule-based | 🔴 Endpoint con paginación + filtros server-side |
| Import Excel | ✅ síncrono | 🔴 Worker job + progress events |
| Export Excel | ✅ síncrono | 🔴 Worker job, link de descarga R2 |
| Credenciales QR | ✅ generadas on-demand | 🔴 Worker pre-genera + cache en R2 |
| Bulk send credentials | ✅ `/api/credentials/bulk-send` | 🔴 Worker en cola, idempotente |
| Detect duplicate por email/nombre | ✅ frontend warning | 🔴 Backend dedup + validador TLD comunes |

**Aceptación**: import de 1,000 visitantes no bloquea HTTP. Bulk send 500 credenciales completa sin timeout. Detección de duplicate en backend (no solo frontend).

### 4. Gestión de actividades

| Aspecto | v1 actual | v2 target |
|---|---|---|
| CRUD | 🔴 sin auth (P0) | 🔴 Con auth + RBAC |
| Tipos (cine/concierto/taller/etc.) | ✅ enum | 🔴 enum tipado en contracts |
| Capacity + enrolled atomic | 🟡 confirmar atomicidad | 🔴 SQL transaction garantida |
| Cancelación + notificación | ✅ `notifyActivityCancelled` | 🔴 Worker email |
| Reportes por actividad | ✅ síncrono | 🔴 Worker PDF/Excel |
| Imagen de afiche | ✅ upload local | 🔴 R2 + optimización Sharp en worker |

**Aceptación**: race condition de capacity sometida a test (1000 requests concurrentes → conteo final == capacity). Cancelación notifica a todos los inscritos vía worker.

### 5. Kiosko / check-in

| Aspecto | v1 actual | v2 target |
|---|---|---|
| Welcome + activities + identify | ✅ flujo 6 pantallas | 🔴 Migrar 1:1 visualmente |
| Cinema Marquee design system | ✅ deployado | 🔴 Componentes en `packages/ui` |
| RSVP confirmation flow | ✅ | 🔴 Idem |
| `/api/public/*` endpoints | ✅ público por diseño | 🔴 Mismos endpoints, rate limit estricto |
| Kiosko lock + watchdog | ✅ JS lock | 🔴 Mantener + tests |

**Aceptación**: Playwright E2E del flujo completo welcome → activities → identify (código) → confirm. CCB lo opera sin diferencias visuales.

### 6. Scanner QR

| Aspecto | v1 actual | v2 target |
|---|---|---|
| Escaneo QR webcam | ✅ jsQR | 🔴 Misma lib |
| Validación de código contra DB | ✅ endpoint | 🔴 Protegido con auth de staff |
| Branded por tenant | ✅ | 🔴 Idem |

**Aceptación**: scanner funciona offline-first si la red falla momentáneamente (queue local que sincroniza).

### 7. Invitaciones / RSVP

| Aspecto | v1 actual | v2 target |
|---|---|---|
| Invitar por usuarios | ✅ con segmentos sugeridos | 🔴 Misma UX, worker email |
| RSVP Sí/No por email | ✅ tokens + link público | 🔴 Mantener + agregar webhook resend para tracking |
| Tasa de respuesta | 🔴 no medida | 🔴 Métrica por actividad |

**Aceptación**: invitar a 500 visitantes no bloquea HTTP. RSVP funcional sin sesión. Tracking de tasa visible en detalle de actividad.

### 8. Reportes

| Aspecto | v1 actual | v2 target |
|---|---|---|
| PDF asistencia por actividad | 🔴 síncrono sin auth (P0) | 🔴 Worker + auth + link descarga |
| Excel masivo | 🔴 idem | 🔴 Idem |
| Por período (mes/año) | 🟡 pendiente del producto | 🔴 Implementar |

**Aceptación**: ningún endpoint de reportes responde a anónimos. Generación demora < 30s para reporte mensual de CCB.

### 9. Platform admin

| Aspecto | v1 actual | v2 target |
|---|---|---|
| admin.contan2.com login | ✅ con `platform_admins` | 🔴 Misma lógica en monorepo |
| Listar/crear tenants | ✅ | 🔴 Idem |
| Ver auditoría global | 🔴 limitado | 🔴 Vista agregada cross-tenant |
| Billing futuro | 🔴 no implementado | 🔴 Stripe + planes (post-v2) |

**Aceptación**: super admin operativo en v2 sin pérdida de funcionalidad. Auditoría cross-tenant visible.

### 10. Auditoría + billing futuro

| Aspecto | v1 actual | v2 target |
|---|---|---|
| Audit log tenant-aware | ✅ `tenant_audit_log` | 🔴 Mismo modelo + RLS |
| Vista Historial (admin) | ✅ Operations Console A | 🔴 Migrar UI |
| Acciones cubiertas | 🟡 verificar coverage | 🔴 Listar y completar gaps |
| Billing | 🔴 no | 🔴 Out of v2 scope inicial |

**Aceptación**: cada acción mutativa registra audit (con masked PII). Vista Historial sin regresión.

## Métricas globales de paridad

| Categoría | Total | v2 implementado | % |
|---|---|---|---|
| Endpoints API | ~70 | 0 | 0% |
| Pantallas frontend | ~20 | 0 | 0% |
| Jobs en worker | 6 colas | 0 | 0% |
| Tests automatizados | objetivo 200+ | 0 | 0% |

Esta matriz se actualiza al final de cada FASE 4 vertical slice. Un módulo no se considera "migrado" sin verificar todos sus criterios de aceptación.
