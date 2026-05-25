# Plan técnico — Sprint 1 (Auth)

> Plan de implementación derivado del [`spec.md`](./spec.md). Resuelve
> las decisiones técnicas concretas: librerías, archivos, contratos,
> orden de implementación. No es código todavía — es el blueprint.

---

## 1. Decisiones técnicas

### 1.1 Librería de hashing
**`@node-rs/argon2`** (no `bcrypt`).
- Más moderno, GPU-resistente, recomendación OWASP 2025
- Mantiene compatibilidad ABI con Node 20 (nuestro runtime)
- Mismo paquete que ya usaríamos si queremos migrar las credenciales
  PNG generadas (consistencia)
- Parámetros: `m=19456, t=2, p=1` (OWASP minimum)

### 1.2 Tokens criptográficos
**`node:crypto`** (built-in, sin dependencia externa).
- `randomBytes(32).toString('hex')` para session token y reset token
- `createHash('sha256').update(token).digest('hex')` para hash en DB

### 1.3 Validación de input
**`zod`** (nueva dependencia).
- Tipa entradas y salidas de endpoints
- Mensajes de error útiles
- Cohesivo con TypeScript futuro (sin migrar todavía)
- Reusable en otros sprints (auth abre camino)
- Alternativa rechazada: `joi` (mayor footprint), validación manual (más código)

### 1.4 Email templates
Reusar el helper `email.js` existente.
- Funciones nuevas: `sendPasswordResetEmail`, `sendPasswordChangedEmail`,
  `sendNewLoginNotificationEmail`, `sendWelcomeStaffEmail`
- Mismo patrón visual que `sendCredentialEmail` (header con logo + colores
  del tenant cuando aplica, layout standalone para platform admin)

### 1.5 Rate limiting
**Reusar `utils/rateLimit.js`** que ya tenemos.
- Instancias nuevas: `loginRateLimit(10/15min/IP)`, `forgotRateLimit(5/15min/IP)`,
  `resetRateLimit(5/15min/IP)`

### 1.6 Cookies
**`cookie-parser`** ya está montado en `server.js`.
- Cookies nuevas: `contan2_session` (tenant staff) y `contan2_admin_session`
  (platform admin)
- Flags: `HttpOnly`, `Secure` (en prod), `SameSite=Lax`, `Path=/`
- `Max-Age`: 12h o 30 días según `rememberMe`

### 1.7 Migraciones
Una migration por concepto (3 migrations en este sprint):
- `014_staff_members.sql`
- `015_staff_sessions.sql`
- `016_password_resets.sql`
- (Si platform admin no comparte tablas, también `017_platform_admins.sql`
  y `018_platform_sessions.sql`. Ver sección 2.)

---

## 2. Modelo de datos final

### 2.1 ¿Una tabla o dos?

**Decisión: DOS sistemas paralelos** con tablas separadas pero servicio
de auth compartido.

**Tablas para tenant staff:**
- `staff_members` (PK uuid, FK organization_id, email único por org, ...)
- `staff_sessions` (PK uuid, FK staff_member_id, token_hash, expires_at, ...)
- `staff_password_resets` (PK uuid, FK staff_member_id, token_hash, expires_at, ...)

**Tablas para platform admin:**
- `platform_admins` (PK uuid, email único global, ...)
- `platform_sessions` (PK uuid, FK platform_admin_id, ...)
- `platform_password_resets` (PK uuid, FK platform_admin_id, ...)

**Servicio compartido** `src/services/auth/passwordService.js`:
- `hash(plain) → hash` (argon2id)
- `verify(plain, hash) → bool`
- `generateToken() → { plain, hash }` (token + hash)
- `hashToken(plain) → hash`
- Sin estado, sin tabla preferida — lo usan ambos sistemas

### 2.2 Schemas SQL (resumen — el SQL final va en las migraciones)

```sql
-- staff_members
CREATE TABLE staff_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email           CITEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','deleted')),
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ NULL,
  lock_level      INT NOT NULL DEFAULT 0,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,  -- hook futuro
  mfa_secret      TEXT NULL,                       -- hook futuro
  last_login_at   TIMESTAMPTZ NULL,
  last_login_ip_hash TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX staff_members_org_email_unique
  ON staff_members (organization_id, lower(email))
  WHERE deleted_at IS NULL;
```

(`platform_admins` igual pero sin `organization_id`, con email único
global.)

```sql
-- staff_sessions y platform_sessions tienen schema idéntico salvo la FK
CREATE TABLE staff_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  remember_me     BOOLEAN NOT NULL DEFAULT FALSE,
  ip_hash         TEXT NULL,
  user_agent      TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ NULL
);
CREATE INDEX staff_sessions_member ON staff_sessions(staff_member_id);
```

---

## 3. Estructura de archivos

```
backend/src/
├── db/postgres/
│   ├── migrations/
│   │   ├── 014_staff_members.sql                  (NEW)
│   │   ├── 015_staff_sessions.sql                 (NEW)
│   │   ├── 016_staff_password_resets.sql          (NEW)
│   │   ├── 017_platform_admins.sql                (NEW)
│   │   ├── 018_platform_sessions.sql              (NEW)
│   │   └── 019_platform_password_resets.sql       (NEW)
│   └── platform/
│       ├── StaffMemberRepository.js               (NEW)
│       ├── StaffSessionRepository.js              (NEW)
│       ├── PasswordResetRepository.js             (NEW, polimórfico staff/platform)
│       └── PlatformAdminRepository.js             (NEW)
├── services/auth/
│   ├── passwordService.js                         (NEW) — argon2 hash/verify, token gen
│   ├── sessionService.js                          (NEW) — crear/validar/revocar sesiones
│   ├── lockoutService.js                          (NEW) — fail-tracking + bloqueo escalado
│   ├── tenantAuthService.js                       (NEW) — orquesta tenant login flow
│   ├── platformAuthService.js                     (NEW) — orquesta platform login flow
│   └── authEmails.js                              (NEW) — wrappers de templates
├── routes/
│   ├── auth.js                                    (NEW) — tenant auth (montado en /api/auth)
│   ├── platformAuth.js                            (NEW) — platform auth (montado en /api/platform/auth)
│   └── staff.js                                   (MODIFY) — el legacy PIN se mantiene 7 días con flag de deprecación
├── middleware/
│   ├── requireStaffSession.js                     (NEW) — reemplazo gradual de requireStaff
│   ├── requirePlatformAdmin.js                    (NEW)
│   └── resolveTenant.js                           (MODIFY) — para reconocer subdomain "admin"
└── server.js                                      (MODIFY) — montar nuevos routers

frontend/
├── login.html                                     (NEW) — página standalone de login tenant
├── login.js                                       (NEW)
├── login.css                                      (NEW)
├── platform-login.html                            (NEW) — login del super admin
├── platform-login.js                              (NEW)
└── (resto del SPA admin sigue igual, solo añadimos check de sesión al boot)
```

---

## 4. Frontend: rutas y comportamiento

### 4.1 Tenant login (`/login`)
- Servida directo por Express (no SPA), mismo patrón que `kiosko.html`
- Aplica branding SSR del tenant (logo, colores)
- Form simple: email, password, "recordarme", botón
- Link "¿Olvidaste tu contraseña?" → `/login/forgot`
- POST `/api/auth/login` → cookie + redirect a `next` o `/`
- Si la sesión es válida al cargar `/login`, redirige directo a `/` (skip)

### 4.2 Forgot/reset (`/login/forgot`, `/login/reset`)
- Pages standalone con mismo branding del tenant
- Forgot: solo input email + botón
- Reset: lee `?token=...` de URL, valida en backend, muestra form de nueva password

### 4.3 SPA admin (`/`)
- En el boot, llama a `GET /api/auth/me`
- Si 401 → redirige a `/login?next=` + URL actual
- Si OK → continúa carga normal, guarda `currentUser` en State

### 4.4 Platform login (`admin.contan2.com/login`)
- Análogo a tenant login pero:
  - Sin branding de tenant (es contan2 "branding" por defecto)
  - No usa `resolveTenant` (subdomain `admin` está reservado)
  - Cookie distinta: `contan2_admin_session`
  - Redirige a un dashboard nuevo `admin.contan2.com/dashboard` (placeholder
    inicial; el dashboard completo es Sprint 2 o futuro)

### 4.5 Política con kiosko/scanner
**No cambian.** Siguen siendo apps standalone sin auth de usuario.
La razón: son tablets compartidas en el lobby. Si un día queremos
autoría de check-ins (saber qué staff escaneó qué QR), es otro sprint.

---

## 5. Migración del PIN actual (operacional)

| Fase | Cuándo | Qué |
|---|---|---|
| **T0** | Día del deploy | Migrations aplican, tablas se crean, endpoints `/api/auth/*` y `/api/platform/auth/*` quedan vivos. Middleware viejo `requireStaff` (PIN) sigue activo en paralelo. |
| **T1** | T0 + 1h | Script de seed: crear `platform_admins` para Marcelino con password temporal. Email a Marcelino. |
| **T2** | Cuando Marcelino confirme acceso | Crear `staff_members` para Karen del CCB (email pendiente). Email a Karen. |
| **T3** | T2 + 3 días sin incidentes | El PIN viejo responde 410 Gone con mensaje "el sistema migró, contacta soporte si no tienes acceso". |
| **T4** | T3 + 4 días | Endpoint `/api/staff/login` (PIN) se remueve del código. Cleanup. |

Backout: si T1/T2 fallan, revertir el deploy mantiene el PIN funcional.

---

## 6. Tests

Mínimo para considerar el sprint "done":

- Unit tests para `passwordService` (hash, verify, token gen)
- Unit tests para `lockoutService` (escalado, reset)
- Integration tests para los flows críticos:
  - Login OK / login wrong password / login locked
  - Forgot → reset → login con nueva pass
  - Logout invalida sesión
  - Change password invalida otras sesiones pero mantiene actual
  - Nueva IP envía email
- Tests para platform admin (mismo conjunto, tabla distinta)
- Smoke E2E manual antes del merge a `multitenant`

---

## 7. Orden de implementación (cómo se ejecutan las tasks)

Ver [`tasks.md`](./tasks.md) para la lista detallada. El orden general:

```
1. Servicio compartido          → passwordService, lockoutService
2. Migrations                   → 6 archivos SQL
3. Repositorios                 → StaffMemberRepository, etc.
4. Backend tenant auth          → service + router + middleware
5. Smoke local backend          → curl-driven validation
6. Frontend tenant login        → login.html/js/css
7. SPA check-de-sesión          → app.js boot guard
8. Backend platform auth        → service + router
9. Frontend platform login      → platform-login.html/js
10. Tests + smoke E2E
11. Script de migración (Marcelino + Karen)
12. Deploy a staging (build local con .env de prueba)
13. Validación humana
14. Merge a multitenant + deploy a prod
```

---

## 8. Dependencias nuevas (npm)

```json
{
  "@node-rs/argon2": "^2.0.2",
  "zod": "^3.23.8"
}
```

Ambas son sólidas, mantenidas, sin transitive deps preocupantes.

---

## 9. Riesgos del plan

| Riesgo | Mitigación |
|---|---|
| Conflicto entre middleware viejo y nuevo en endpoints existentes | Durante T0-T3 aceptamos AMBOS auth methods. Marcamos endpoints uno por uno conforme migramos. |
| Push a develop deploya algo? | Coolify solo deploya `multitenant`. Verificar antes del primer push. |
| Olvidamos invalidar sesiones al cambiar password | Test e2e cubre este caso, no merge sin ese test verde. |
| Email de recovery cae en spam | Resend con dominio verificado lo evita; si algún destinatario lo pierde, recovery por DM al super admin. |
| Tenant admin de CCB se queda sin acceso en pleno horario operativo | El PIN sigue funcional 7 días como fallback. Documentado en runbook. |

---

## Siguiente: [`tasks.md`](./tasks.md)
