# 05 · Matriz de autorización por endpoint

> Fuente única de verdad sobre qué endpoint requiere qué nivel de auth.
> Cada endpoint del API debe encajar en exactamente una de las cuatro categorías.
> El hardening FASE 1.A debe alinear el código a esta matriz.

## Categorías

| Tier | Quién | Cookie esperada | Middleware |
|---|---|---|---|
| **PUBLIC** | Cualquier visitante o sistema externo | — | Sin auth (rate-limit obligatorio en cada endpoint sensible) |
| **STAFF** | Operator, admin u owner del tenant resuelto por subdomain | `contan2_session` | `requireStaffSession` |
| **ADMIN/OWNER** | Solo `admin` u `owner` del tenant | `contan2_session` | `requireStaffSession` + `requireRole(['admin', 'owner'])` |
| **PLATFORM ADMIN** | Solo `platform_admins` del subdomain `admin.*` | `contan2_platform_session` (verificar nombre real) | `requirePlatformAdmin` |
| **LEGACY PIN** | Scanner antiguo basado en PIN del tenant | `ccb_staff` | `staffAuth.js` middleware (sistema aislado) |

Notas:
- LEGACY PIN coexiste con STAFF como sistema separado mientras se planifica su retiro. No mezcla cookies.
- Tests deben verificar tanto el caso positivo (autorizado pasa) como el negativo (no autorizado recibe 401/403).

## Matriz por router

### `routes/auth.js` — autenticación tenant staff

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/auth/login` | POST | PUBLIC | Rate limit 10/15min ya aplicado |
| `/api/auth/logout` | POST | STAFF | ✅ ya protegido |
| `/api/auth/me` | GET | STAFF | ✅ ya protegido |
| `/api/auth/forgot-password` | POST | PUBLIC | Rate limit 5/15min ya aplicado |
| `/api/auth/reset-password` | POST | PUBLIC | Rate limit 5/15min ya aplicado |
| `/api/auth/change-password` | POST | STAFF | ✅ ya protegido |
| `/api/auth/sessions` | GET | STAFF | ✅ ya protegido |
| `/api/auth/sessions/:id` | DELETE | STAFF | ✅ ya protegido |
| `/api/auth/invitation/:token` | GET | PUBLIC | Token opaco; rate limit recomendado |
| `/api/auth/accept-invitation` | POST | PUBLIC | Rate limit 10/1h ya aplicado |

### `routes/platformAuth.js` — autenticación platform admin

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/platform/auth/login` | POST | PUBLIC | Rate limit ya aplicado |
| `/api/platform/auth/logout` | POST | PLATFORM ADMIN | ✅ ya protegido |
| `/api/platform/auth/me` | GET | PLATFORM ADMIN | ✅ ya protegido |
| `/api/platform/auth/forgot-password` | POST | PUBLIC | Rate limit ya aplicado |
| `/api/platform/auth/reset-password` | POST | PUBLIC | Rate limit ya aplicado |
| `/api/platform/auth/change-password` | POST | PLATFORM ADMIN | ✅ ya protegido |
| `/api/platform/auth/sessions[/:id]` | GET, DELETE | PLATFORM ADMIN | ✅ ya protegido |

### `routes/users.js` — gestión visitantes del tenant

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/users` | POST | STAFF | Operator crea visitantes en kiosko/recepción |
| `/api/users/bulk` | POST | ADMIN/OWNER | Import masivo es admin |
| `/api/users` | GET | STAFF | Listar para buscar |
| `/api/users/:code` | GET | STAFF | Ver detalle |
| `/api/users/:code/visit` | PATCH | STAFF | Incrementar visita en check-in |
| `/api/users/:code` | PUT | STAFF | Editar visitante (typos comunes) |
| `/api/users/:code` | DELETE | ADMIN/OWNER | Destructivo |

### `routes/activities.js` — gestión actividades

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/activities` | POST | STAFF | Decisión documentada: operator puede crear |
| `/api/activities` | GET | STAFF | |
| `/api/activities/:id` | GET | STAFF | |
| `/api/activities/:id/attendees` | GET | STAFF | |
| `/api/activities/:id` | PUT | STAFF | |
| `/api/activities/:id` | DELETE | ADMIN/OWNER | Destructivo |
| `/api/activities/:id/invitations` | GET | STAFF | |
| `/api/activities/:id/invitations` | POST | STAFF | Operator invita |
| `/api/activities/:id/invitations/:invId` | DELETE | STAFF | Revocar invitación |

### `routes/attendance.js` — asistencias

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/attendance` | POST | STAFF | Check-in normal |
| `/api/attendance/anonymous` | POST | **STAFF** | Corrección P0: comentario del autor confirma "el staff dispara este endpoint"; el kiosko público usa `/api/public/checkin` |
| `/api/attendance` | GET | STAFF | |
| `/api/attendance/by-user/:userCode` | GET | STAFF | |
| `/api/attendance/by-activity/:activityId` | GET | STAFF | |
| `/api/attendance/:id` | DELETE | ADMIN/OWNER | Destructivo |

### `routes/dashboard.js` — métricas tenant

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/dashboard/stats` | GET | STAFF | |
| `/api/dashboard/checkin-context` | GET | STAFF | |

### `routes/insights.js` — segmentos + analytics

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/insights/user-affinity/:code` | GET | STAFF | |
| `/api/insights/suggestions` | GET | STAFF | |
| `/api/insights/segments` | GET | STAFF | |
| `/api/insights/segments/:id` | GET | STAFF | Devuelve PII (emails); tier STAFF aceptable porque ya hay sesión |
| `/api/insights/activity-summary/:id` | GET | STAFF | |

### `routes/reports.js` — exportes PDF/Excel con PII

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/reports/...` (todos) | * | ADMIN/OWNER | PII exportada masivamente → tier alto. Migración a worker en FASE 1.B |

### `routes/uploads.js` — subida de imágenes

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/uploads/image` | POST | STAFF | Usado tanto para logo (admin) como para afiches de actividad (operator). El control de qué se hace con el upload va en el endpoint que consume el resultado (`/api/org/branding` o crear actividad). **SVG deshabilitado**: en commit `497f3c1` se removió `image/svg+xml` del `ALLOWED_MIME` del fileFilter porque el sanitizer regex actual no cubre vectores como entidades codificadas (`&#x6A;avascript:`), `<foreignObject>` con HTML embebido ni `style="..."` con `expression()`/`url(javascript:)`. La función `sanitizeSvg` queda exportada como pura para tests y para uso futuro cuando se integre un sanitizer robusto (DOMPurify+jsdom). SVG ya servidos en `/uploads/*` siguen como estáticos |

### `routes/orgBranding.js` — branding del tenant

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/org/branding` | GET | STAFF | Lectura (mostrar setup actual) |
| `/api/org/branding` | PATCH | ADMIN/OWNER | Cambia branding del tenant |

### `routes/orgDomain.js` — custom domain self-service

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/org/domain` | GET | ADMIN/OWNER | Lee configuración de dominio custom |
| `/api/org/domain` | PATCH | ADMIN/OWNER | Setea / cambia dominio |
| `/api/org/domain/verify` | POST | ADMIN/OWNER | Verifica TXT DNS |
| `/api/org/domain` | DELETE | ADMIN/OWNER | Remueve dominio |

✅ Hardening aplicado en commit `abfa09f` de la rama `security/p0-hardening`: `router.use(requireStaffSession); router.use(requireRole(['owner','admin']))`. Antes usaba el legacy `requireStaff` (cookie `ccb_staff`), lo que dejaba la configuración institucional del dominio expuesta a sesiones de PIN scanner. Tests en `test/security/orgDomain-rbac.test.js`.

### `routes/credentials.js` — credenciales QR

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/credentials/:code.png` | GET | PUBLIC bearer-style | El `code` actúa como token portador. **Decisión documentada y aplicada en `security/p0-hardening`:** se mantiene público porque el visitante recibe su credencial PNG vía link en su email y debe abrirla sin login. Mitigaciones obligatorias **implementadas**: (a) el código es opaco (`CCB-XXXXXX` con 6 chars `[A-Z0-9]` ≈ 2.1B combinaciones); (b) rate-limit explícito 60 req/min por IP en `routes/credentials.js` (`credentialPngLimit`); (c) **el PNG NO incluye email del visitante** — el SVG renderizado por `services/credential.js` solo embebe nombre + código + QR; (d) el contenido portable (nombre + código + QR) se considera dato que el visitante mismo posee y comparte. **Limitación conocida**: quien posea el link de la credencial puede descargarla; mitigación futura sería un token de descarga single-use, evaluable si el modelo de amenaza lo justifica |
| `/api/credentials/:code/send` | POST | STAFF | ✅ ya protegido en commit previo de `security/p0-hardening` con `requireStaffSession`. En commit `ec98380` se añade `recordAudit({ action: 'credential.sent', targetType: 'user', targetLabel: code, metadata: { resendId, emailMasked } })` tras envío exitoso |
| `/api/credentials/bulk-send` | POST | ADMIN/OWNER | ✅ ya protegido en commit `712e244` con `requireStaffSession + requireRole(['admin','owner'])` (antes usaba el legacy `requireStaff`, que aceptaba cualquier cookie `ccb_staff`) |

### `routes/auditLog.js` — historial

✅ ADMIN/OWNER ya aplicado. Verificación en tests.

### `routes/staff.js` — LEGACY PIN (scanner antiguo)

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/staff/login` | POST | PUBLIC (LEGACY) | Login con PIN. NO se le aplica `requireStaffSession`. Sistema aislado con cookie propia (`ccb_staff`) |
| `/api/staff/logout` | POST | LEGACY | Lee `ccb_staff`. No depende del sistema nuevo |
| `/api/staff/me` | GET | LEGACY | Idem |

**Documentado para retiro progresivo**: ver `04-cutover-and-rollback.md` § retiro de PIN legacy. Verificar tráfico real en logs antes de eliminar.

### `routes/staffManagement.js` — gestión de staff

✅ Todos los endpoints ya protegidos con `requireStaffSession` + `requireRole(['admin','owner'])`. Verificación en tests.

### `routes/tenant.js` — info pública del tenant

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/_tenant` | GET | PUBLIC | Necesario para que `branding.js` aplique paleta antes del login. **Payload allowlisted obligatorio**: solo `slug`, `name`, `legalName`, `logoUrl`, `primaryColor`, `secondaryColor`, `sidebarStyle`, `codePrefix`, `locale`, `timezone`. **Excluir** `plan`, `status`, hashes, emails internos, configuración de billing o cualquier secreto. Test obligatorio: snapshot del payload garantiza no leak |

### `routes/public.js` — kiosko API

| Endpoint | Método | Tier | Notas |
|---|---|---|---|
| `/api/public/activities` | GET | PUBLIC | Solo activities con status `activa` y campos públicos |
| `/api/public/users/suggest` | GET | PUBLIC + rate-limit | Type-ahead 3+ chars, sin emails completos |
| `/api/public/users/lookup` | GET | PUBLIC + rate-limit | Lookup por email/código exacto |
| `/api/public/users/:code` | GET | PUBLIC | Vista mínima del visitante (nombre, visitas) |
| `/api/public/checkin` | POST | PUBLIC + rate-limit | Endpoint real del kiosko |
| `/api/public/events/:slug/reserve` | POST | PUBLIC + rate-limit | RSVP web compartible |
| `/api/public/rsvp/:token` | GET/POST | PUBLIC | Token opaco en email |

### `routes/eventosPublic.js` — open graph pages

`/eventos/:slug` GET → PUBLIC. Solo metadata para compartir; sin PII.

### `routes/landing.js` — marketing root

`/api/landing/contact` POST → PUBLIC + rate-limit 3/1h.

### `routes/platformAdmin.js` — admin de plataforma

Todos los endpoints PLATFORM ADMIN. ✅ ya protegidos con `requirePlatformAdmin`.

## Reglas transversales

1. **Tenant isolation**: incluso staff autenticado solo accede a recursos de SU `organizationId`. Toda query usa `req.repos` scope-ado. Cuando FASE 1.B introduce RLS, esto queda con doble barrera.
2. **Rate limiting**: todo endpoint `PUBLIC` con potencial de abuso (envío email, enumeración) lleva rate limit explícito.
3. **Audit log**: toda acción mutativa de tier STAFF o superior registra en `tenant_audit_log` con PII enmascarada.
4. **No leakage de existencia**: 401 vs 404 debe ser consistente — un anónimo no debería poder distinguir si un recurso existe o no, salvo en endpoints PUBLIC.
5. **Tests obligatorios**: cada endpoint en la matriz tiene su test correspondiente que demuestra la regla.

## Decisiones que requieren confirmación del operador

1. `POST /api/users` como STAFF (operator crea visitantes). Alternativa: ADMIN/OWNER si el operator solo debe usar `/api/public/checkin` desde kiosko. **Default propuesto**: STAFF.
2. `POST /api/credentials/:code/send` como STAFF. Alternativa: PUBLIC con rate-limit estricto (visitante solicita reenvío de su credencial). **Default propuesto**: STAFF (más restrictivo por ahora).
3. `PUT /api/activities/:id` (editar) como STAFF. ¿O ADMIN/OWNER? Coherente con "operator puede crear" → propuesto STAFF.

Confirmar estos tres antes de aplicar el código de hardening.
