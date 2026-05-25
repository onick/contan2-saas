# Tasks — Sprint 1 (Auth)

> Desglose ejecutable derivado del [`plan.md`](./plan.md). Cada task es
> un commit independiente que deja el repo en un estado funcional
> (compila, tests pasan). Se ejecutan en orden — algunas se pueden
> paralelizar (anotado).

**Branch**: `develop`
**Estimación total**: ~2 semanas (10 días hábiles) trabajando ~6h/día

Leyenda: ⏳ pendiente · 🚧 en progreso · ✅ hecho

---

## Fase A — Servicios base (compartidos entre tenant y platform)

### T1 ⏳ Añadir dependencias npm
- `cd backend && npm install @node-rs/argon2 zod`
- Verificar que el build sigue funcionando (boot del server)
- Commit: `chore(deps): argon2id y zod para auth`

### T2 ⏳ Servicio de password (`passwordService.js`)
- `hash(plainPassword) → hashString` (argon2id m=19456, t=2, p=1)
- `verify(plainPassword, hash) → boolean`
- `generateOpaqueToken() → { plain: hex32, hash: sha256hex }`
- `hashToken(plain) → sha256hex`
- Tests unitarios (5 casos mínimo)
- Commit: `feat(auth): password service con argon2id + token helpers`

### T3 ⏳ Servicio de lockout (`lockoutService.js`)
- `recordFailedAttempt(account) → { locked, lockUntil, lockLevel }`
- `recordSuccessfulLogin(account)` → reset
- Lógica escalada: 5 fails en 15min → level 1 (30min); luego level 2 (1h); luego level 3 (24h)
- Test unitario con timestamps mockeados
- Commit: `feat(auth): lockout escalado anti brute-force`

### T4 ⏳ Servicio de sesiones (`sessionService.js`)
- `createSession({ accountId, accountType, rememberMe, ip, ua }) → { token, expiresAt }`
- `validateSession(token, accountType) → { account, sessionId } | null`
- `revokeSession(sessionId)`
- `revokeAllOtherSessions(accountId, exceptSessionId)`
- Polimórfico: trabaja con staff_sessions o platform_sessions según `accountType`
- Commit: `feat(auth): session service polimórfico (staff + platform)`

---

## Fase B — Migrations + Repos

### T5 ⏳ Migration 014 (`staff_members`)
- Tabla con todos los campos del plan
- Index único parcial en `(organization_id, lower(email)) WHERE deleted_at IS NULL`
- Commit: `db(auth): migration 014 staff_members`

### T6 ⏳ Migration 015 (`staff_sessions`)
- Tabla con token_hash único, expires_at, etc.
- Index por staff_member_id
- Commit: `db(auth): migration 015 staff_sessions`

### T7 ⏳ Migration 016 (`staff_password_resets`)
- Tabla con token_hash, used_at, expires_at
- Commit: `db(auth): migration 016 staff_password_resets`

### T8 ⏳ Migration 017 (`platform_admins`)
- Tabla análoga a staff_members pero sin organization_id, email único GLOBAL
- Commit: `db(auth): migration 017 platform_admins`

### T9 ⏳ Migrations 018 + 019 (`platform_sessions`, `platform_password_resets`)
- Mismo schema que las de staff pero apuntando a platform_admins
- Commit: `db(auth): migrations 018 + 019 platform sessions y resets`

### T10 ⏳ Repos para staff
- `StaffMemberRepository`: findByEmail, create, updatePassword, recordFailedAttempt, recordSuccessfulLogin, markPasswordChanged, etc.
- `StaffSessionRepository`: create, findByTokenHash, revoke, revokeAllForStaff
- `StaffPasswordResetRepository`: create, findByTokenHash, markUsed
- Commit: `feat(auth): repos para staff (members, sessions, resets)`

### T11 ⏳ Repos para platform admin
- Análogos a T10 pero para platform_admins, platform_sessions, platform_password_resets
- Commit: `feat(auth): repos para platform admin`

---

## Fase C — Backend tenant auth

### T12 ⏳ Tenant auth service (`tenantAuthService.js`)
- `login({ org, email, password, ip, ua, rememberMe }) → { staffMember, sessionToken, mustChangePassword }`
- Maneja: lookup, lockout check, verify password, registrar fail/success, crear sesión
- `logout(sessionToken)`
- `forgotPassword(org, email)` — silencioso si email no existe
- `resetPassword(token, newPassword)` — invalida todas las sesiones
- `changePassword(staffMember, currentPassword, newPassword, currentSessionId)` — mantiene la actual, mata otras
- Commit: `feat(auth): tenant auth service`

### T13 ⏳ Email templates de auth
- `sendPasswordResetEmail({ staffMember, organization, resetUrl })`
- `sendPasswordChangedEmail({ staffMember, organization, ip, ua })`
- `sendNewLoginNotificationEmail({ staffMember, organization, ip, ua, at })`
- `sendWelcomeStaffEmail({ staffMember, organization, tempPassword, loginUrl })`
- Reusan el shell de `email.js` con branding del tenant
- Commit: `feat(auth): email templates (welcome, reset, changed, new-login)`

### T14 ⏳ Router `/api/auth/*` (tenant)
- POST `/login` con zod schema, rate limited
- POST `/logout` (autenticado)
- GET `/me` (autenticado)
- POST `/forgot-password`
- POST `/reset-password`
- POST `/change-password` (autenticado)
- GET `/sessions` (autenticado)
- DELETE `/sessions/:id` (autenticado)
- Montaje en server.js: `app.use('/api/auth', resolveTenant, buildTenantRepos, createAuthRouter())`
- Commit: `feat(auth): endpoints /api/auth/* para tenant`

### T15 ⏳ Middleware `requireStaffSession`
- Lee cookie, valida con sessionService, popula `req.staffSession` y `req.currentStaff`
- Backward compatible: si no hay session cookie, fallback temporal al middleware PIN existente (con flag de deprecación en logs)
- Commit: `feat(auth): middleware requireStaffSession con fallback PIN`

### T16 ⏳ Smoke local del backend tenant auth
- Login OK / wrong pass / lockout
- Forgot → email log → reset → login con nueva pass
- Change password → otras sesiones invalidadas
- Sin commit (es validación humana antes de seguir)

---

## Fase D — Frontend tenant login

### T17 ⏳ `login.html` + `login.css`
- Página standalone (igual patrón que `kiosko.html`)
- Form simple, responsive, mobile-first
- Aplica branding del tenant via SSR (`serveHtmlWithBranding`)
- Commit: `feat(auth-ui): página /login standalone con branding tenant`

### T18 ⏳ `login.js` (cliente)
- Submit del form → POST `/api/auth/login`
- Manejo de errores: 401 (credenciales), 423 (locked), 429 (rate limited)
- Redirect a `?next=` o `/`
- Mostrar/ocultar password toggle
- Commit: `feat(auth-ui): login.js con manejo de errores y redirect`

### T19 ⏳ `/login/forgot` + `/login/reset` (mismas páginas con variantes)
- HTML, CSS, JS para los 3 flows (login, forgot, reset)
- Validación client-side antes de submit
- Commit: `feat(auth-ui): forgot y reset password pages`

### T20 ⏳ Server.js: montar rutas `/login*`
- `app.get('/login', resolveTenant, serveHtmlWithBranding(loginHtmlPath))`
- Idem para `/login/forgot` y `/login/reset`
- Commit: `feat(auth): servir páginas /login* con branding SSR`

### T21 ⏳ SPA admin: guard de sesión en boot
- En `app.js`, al iniciar: `GET /api/auth/me`
- Si 401: `window.location.href = '/login?next=' + encodeURIComponent(location.hash)`
- Si OK: continuar como antes, guardar `State.currentStaff`
- Header del admin: avatar/nombre del staff + menú con "Cambiar contraseña" y "Cerrar sesión"
- Commit: `feat(auth-ui): SPA admin requiere sesión válida`

### T22 ⏳ Modal "Cambiar contraseña" en el admin
- Disparado desde el menú del header
- Form: actual + nueva + confirmar nueva
- Commit: `feat(auth-ui): cambiar contraseña desde el panel`

---

## Fase E — Backend platform auth

### T23 ⏳ Platform auth service (`platformAuthService.js`)
- Análogo a `tenantAuthService` pero contra `platform_admins`
- Mismos métodos: login, logout, forgot, reset, change, sessions
- Commit: `feat(auth): platform auth service`

### T24 ⏳ Router `/api/platform/auth/*`
- Análogo al tenant router pero sin `resolveTenant` (subdomain admin no es tenant)
- Reglas distintas en `resolveTenant`: si `subdomain === 'admin'`, no buscar org, `req.organizationId = null`
- Commit: `feat(auth): endpoints /api/platform/auth/* y resolveTenant para admin subdomain`

### T25 ⏳ Middleware `requirePlatformAdmin`
- Solo permite si hay sesión válida en `platform_sessions`
- Popula `req.platformAdmin`
- Commit: `feat(auth): middleware requirePlatformAdmin`

---

## Fase F — Frontend platform login + dashboard mínimo

### T26 ⏳ `platform-login.html` + JS + CSS
- Página standalone en `admin.contan2.com/login`
- Sin branding tenant (es contan2 branding default)
- Mismo flow: login, forgot, reset
- Commit: `feat(auth-ui): página de login para platform admin`

### T27 ⏳ Dashboard básico de platform admin
- `admin.contan2.com/` autenticado: muestra una lista de tenants + métricas básicas (total tenants, tenants activos)
- Aún sin gestión completa (es Sprint 2/3); solo "estoy logueado, veo el sistema"
- Commit: `feat(platform): dashboard mínimo del super admin`

---

## Fase G — Migración y deploy

### T28 ⏳ Script de seed para platform admin (Marcelino)
- `scripts/seed-platform-admin.mjs` — toma email + genera password temporal
- Inserta en `platform_admins` con `must_change_password = TRUE`
- Imprime el email + password temporal en stdout
- Commit: `tools: script de seed para crear platform admin`

### T29 ⏳ Script para crear el primer staff de un tenant
- `scripts/seed-tenant-owner.mjs --org <slug> --email <email> --name <full name>`
- Idem al anterior pero para `staff_members`
- Commit: `tools: script para crear primer staff owner de un tenant`

### T30 ⏳ Tests E2E
- Playwright o curl-based, lo que sea más simple para empezar
- Cubrir los 6 casos de uso del spec
- Commit: `test(auth): suite E2E de los casos de uso del spec`

### T31 ⏳ Smoke E2E manual completo
- Loguearse como Marcelino en `admin.contan2.com`
- Loguearse como Karen en `ccb.contan2.com`
- Forgot → reset → re-login en ambos
- Validar que sesión expira correctamente
- (Sin commit; es check humano)

### T32 ⏳ Documentación operacional
- `docs/runbooks/auth-system.md` — qué hacer si un owner pierde acceso, cómo crear nuevos staff sin UI todavía, etc.
- Commit: `docs(runbooks): auth system operations`

### T33 ⏳ Merge plan
- PR de `develop` → `multitenant`
- Code review (yo + tú)
- Coolify deploya automáticamente al merge
- Post-deploy: ejecutar T28 (crear cuenta de Marcelino)
- Después de T28: ejecutar T29 (crear cuenta de Karen)
- Confirmar acceso humano
- Notificar deprecación del PIN en 7 días

---

## Tareas NO incluidas en este sprint (post-merge)

Estas quedan para sprints futuros, NO bloquean el merge:

- 🟡 UI de gestión de staff (invitar más staff del CCB, asignar roles): **Sprint 2**
- 🟡 Audit log completo de acciones administrativas: **Sprint 2**
- 🟡 Dashboard completo del platform admin con métricas reales: **Sprint 2**
- 🟡 MFA/TOTP: **Sprint 4** o **Sprint 5**
- 🟡 SSO (Google/MS): cuando algún cliente lo pida

---

## Métricas del sprint

Al final del sprint, debe ser cierto:

- [ ] Karen entra a ccb.contan2.com/login con email + password
- [ ] Marcelino entra a admin.contan2.com/login con email + password
- [ ] El PIN viejo todavía funciona (deprecation 7 días)
- [ ] Ambos pueden cambiar password
- [ ] Ambos reciben email de recovery si lo piden
- [ ] Si fallan 5 veces el password, cuenta se bloquea
- [ ] Cookies con flags HttpOnly + Secure + SameSite
- [ ] Tests E2E verdes en CI (cuando exista CI; por ahora local)
- [ ] Runbook documentado

---

## Decisiones diferidas a sprints futuros

- **Multi-tenant admin compartido** (un staff de varias orgs a la vez):
  no es un caso común; lo dejamos para cuando aparezca.
- **OAuth como Identity Provider** (que otras apps usen contan2 para
  auth): no aplica al modelo de negocio actual.
- **Magic links** (login sin password): nice-to-have, no prioritario.
