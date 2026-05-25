# Spec 001 — Sistema de Autenticación

> **Estado:** Borrador inicial · pendiente de aprobación
> **Sprint:** 1 de 6 (mes 1, sem 1-2)
> **Bloquea:** todo el resto del roadmap (staff multi-usuario, billing,
> signup self-service, audit log).
> **Autor:** Claude · 2026-05-25

---

## 1. Motivación

Hoy la plataforma autentica con un **PIN único compartido** (`STAFF_PIN=2828`).
Esto fue suficiente para validar el MVP con CCB, pero es bloqueador para
todo lo que viene:

- **No sabemos quién hizo qué.** Si dos staff del CCB usan el sistema en
  paralelo, no podemos atribuir acciones (necesario para audit log).
- **No podemos vender el producto** a un segundo cliente sin invitar
  cuentas individuales.
- **No hay recovery.** Si alguien olvida el PIN, hoy hay que pedirlo en
  persona — no es self-service.
- **No hay separación de identidades** entre owners/admins/staff común.
  Eso lo resuelve el Sprint 2 (roles), pero requiere que primero
  exista identidad individual.

Este sprint cierra la **fundación de identidad** sobre la que el resto
del producto se apoya.

---

## 2. Scope

### Sí incluye

| # | Feature | Por qué |
|---|---------|---------|
| F1 | Login con email + password | Identidad individual |
| F2 | Logout (invalida sesión) | Higiene de sesión |
| F3 | "Recordarme" (sesión 30 días vs 12 horas) | UX cotidiano |
| F4 | Recovery por email (link con token 1h) | Self-service del olvido |
| F5 | Cambio de password autenticado | Higiene preventiva |
| F6 | Bloqueo temporal por intentos fallidos | Anti brute-force |
| F7 | Email de notificación en cambios sensibles (password, login desde nueva IP) | Seguridad transparente |
| F8 | Migración del PIN actual a cuenta con email/password | No romper el MVP en producción |

### No incluye (explícitamente fuera)

- ❌ **Roles y permisos** (Sprint 2). En este sprint todos los staff
  autenticados tienen el mismo poder que el PIN tenía.
- ❌ **Signup self-service de nuevos tenants** (Sprint 3). Hoy crear
  una org sigue siendo manual; lo que cambia es cómo se loguean los
  staff de orgs existentes.
- ❌ **SSO** (Google, Microsoft). Posible futuro pero no este sprint.
- ❌ **2FA/TOTP**. Hook arquitectónico sí, implementación no.
- ❌ **Audit log completo** (Sprint 2). Lo único que loggeamos aquí
  son los eventos de auth mismos (login, fallo, recovery).

---

## 3. Casos de uso (cómo el staff lo experimenta)

### CU1 — Marcelino del CCB se loguea por la mañana

1. Va a `https://ccb.contan2.com/login`
2. Ingresa su email + password
3. Marca "Recordarme en este equipo"
4. Click "Entrar" → redirige a `/` (admin SPA, donde estaba antes con PIN)
5. La sesión dura 30 días en este browser

### CU2 — Olvida su password

1. En `/login` click "Olvidé mi contraseña"
2. Ingresa su email
3. Recibe email con asunto "Restablecer tu contraseña · CCB"
4. Click en el link (válido 1 hora)
5. Ingresa nueva password 2 veces
6. Confirma → password actualizada, recibe email de notificación
7. Re-redirige a `/login` y le pide entrar con la nueva

### CU3 — Cambio de password preventivo

1. Logueado, va a "Mi cuenta" (icono arriba derecha)
2. "Cambiar contraseña"
3. Ingresa actual + nueva (2 veces)
4. Submit → sesiones de OTROS dispositivos se invalidan
5. La sesión actual se mantiene
6. Recibe email "Tu contraseña fue cambiada"

### CU4 — Alguien intenta adivinar el password

1. Atacante prueba 5 passwords distintas en 15 minutos
2. Sistema bloquea la cuenta 30 minutos
3. El owner real recibe email: "Detectamos 5 intentos fallidos de login"
4. Email incluye IP y user-agent del atacante
5. Tras 30 min la cuenta se desbloquea automáticamente
6. Si los intentos siguen, el bloqueo escala (15 min → 1h → 24h)

### CU5 — Logout

1. Click "Cerrar sesión" en el menú de mi cuenta
2. Cookie de sesión se borra
3. Server invalida el token (no usable aunque alguien lo robe)
4. Redirige a `/login`

### CU6 — Migración desde el PIN (one-time, lunes 25 may)

1. Marcelino tiene PIN 2828 vigente
2. Yo creo (vía script) un `staff_member` con:
   - email: `mfranciscomartinez@gmail.com`
   - password temporal: `[random 16 chars]`
   - status: `active`
3. Marcelino recibe email: "Tu cuenta con email/password está lista.
   Tu password temporal es XXX. Por favor cámbiala al primer login."
4. Login con email + password temporal funciona
5. Sistema lo redirige a "Cambiar contraseña" (forzado, no skip)
6. Tras cambiar, sesión normal
7. **El PIN sigue funcionando durante 7 días como fallback** por si algo
   se rompe. Después se remueve.

---

## 4. Requisitos funcionales

| ID | Requisito |
|---|---|
| **RF1** | Login con email (case-insensitive) + password validado contra hash argon2id |
| **RF2** | Bloqueo temporal después de 5 intentos fallidos en 15 min: 30 min de lock. Si re-intenta tras desbloqueo y vuelve a fallar 5x → 1h. Tras 3 ciclos → 24h. Reset del contador al login exitoso. |
| **RF3** | Recovery: POST `/api/auth/forgot-password` con email → siempre responde 200 (no leak de qué emails existen). Si el email existe, se envía link con token random 32 chars (hash en DB), TTL 1h, un solo uso. |
| **RF4** | Recovery: POST `/api/auth/reset-password` con token + new password → si token válido y no usado y no expirado, actualiza password y marca token como usado. Invalida todas las sesiones activas del staff. |
| **RF5** | Logout: invalida la sesión actual server-side (no solo borra cookie). |
| **RF6** | "Recordarme" cambia la duración: 12h (default) o 30 días (recordarme). |
| **RF7** | Cambio de password autenticado: requiere password actual. Tras éxito, invalida sesiones de otros dispositivos pero mantiene la actual. Envía email de notificación. |
| **RF8** | Login desde nueva IP (no vista en últimos 30 días para este staff): envía email "Nuevo inicio de sesión en tu cuenta" con IP, user-agent, fecha. No bloquea (informativo). |
| **RF9** | Sesión expirada o inexistente en cualquier endpoint protegido → 401 con JSON `{error: "no autenticado"}`. La UI redirige a `/login` con un `?next=` para volver tras login. |

---

## 5. Requisitos no funcionales

| ID | Requisito |
|---|---|
| **RNF1** | Passwords con **argon2id** (`@node-rs/argon2`). Coste mínimo: `m=19456, t=2, p=1` (recomendación OWASP 2025). |
| **RNF2** | Tokens de recovery: `crypto.randomBytes(32)` → hex string. **Solo el hash se guarda en DB** (sha256). Si la DB se filtra, los tokens no son utilizables. |
| **RNF3** | Tokens de sesión (cookie): `crypto.randomBytes(32)` hex. Hash en DB (sha256). Cookie con flags `HttpOnly`, `Secure`, `SameSite=Lax`. |
| **RNF4** | Rate limit del endpoint `/api/auth/login`: 10 intentos / IP / 15 min. (Adicional al bloqueo por email-cuenta de RF2.) |
| **RNF5** | Logs de eventos auth en formato estructurado: `[auth] login_success email=m***@gmail.com staff_id=...` (email enmascarado siempre). |
| **RNF6** | Validación server-side de email (RFC) y password (mínimo 10 chars, no sólo dígitos, no en blacklist de 10k más comunes). |
| **RNF7** | Emails de auth (recovery, notificaciones) usan el branding del tenant (mismo helper que credenciales). |
| **RNF8** | Compatible con multi-tenant: cada staff pertenece a 1 org. Resolver primero el tenant (subdomain), luego buscar el staff dentro de esa org. Email único POR org, no global. |

---

## 6. Modelo de datos

### 6.1 `staff_members` (tabla nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK | NOT NULL, indexed |
| `email` | citext | NOT NULL, unique POR org |
| `password_hash` | text | argon2id hash |
| `full_name` | text | "Marcelino Francisco Martínez" |
| `status` | text | `active` / `suspended` / `deleted` |
| `failed_attempts` | int | default 0, reset al login OK |
| `locked_until` | timestamptz | NULL si no está lockeado |
| `lock_level` | int | 0/1/2/3 → 0/30min/1h/24h |
| `last_login_at` | timestamptz | |
| `last_login_ip` | text | hash sha256 para privacy |
| `must_change_password` | boolean | true para migración del PIN |
| `created_at` | timestamptz | default NOW() |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | soft delete |

Constraints:
- `UNIQUE (organization_id, lower(email))` — un mismo email en distintos
  tenants es válido.
- Index parcial en `email` WHERE deleted_at IS NULL.

### 6.2 `staff_sessions` (tabla nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `staff_id` | UUID FK | NOT NULL |
| `token_hash` | text | sha256 del token enviado en cookie |
| `expires_at` | timestamptz | 12h o 30d según remember_me |
| `remember_me` | boolean | |
| `ip_hash` | text | sha256(ip) — para detección de cambio sin guardar PII |
| `user_agent` | text | truncado a 256 chars |
| `created_at` | timestamptz | |
| `revoked_at` | timestamptz | si logout o invalidación manual |

Index: `token_hash` (lookup en cada request), `staff_id` (listar sesiones,
revocarlas en password change).

### 6.3 `password_resets` (tabla nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `staff_id` | UUID FK | NOT NULL |
| `token_hash` | text | sha256 del token enviado por email |
| `expires_at` | timestamptz | NOW() + 1h |
| `used_at` | timestamptz | NULL hasta usado |
| `requested_ip_hash` | text | |
| `requested_user_agent` | text | |
| `created_at` | timestamptz | |

### 6.4 Tabla `organizations`: nada cambia

El owner inicial del tenant (creado a mano hoy, vía signup en Sprint 3)
ya existe; lo único es crear un `staff_member` asociado a esa org con
rol implícito de "todos los permisos" (hasta el Sprint 2 que introduce
roles).

---

## 7. Endpoints HTTP

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | público | body `{email, password, rememberMe?}` → 200 + setea cookie, 401 si credenciales mal, 423 si lockeado |
| POST | `/api/auth/logout` | autenticado | invalida sesión actual, borra cookie |
| GET | `/api/auth/me` | autenticado | devuelve `{id, email, fullName, organizationId, mustChangePassword}` |
| POST | `/api/auth/forgot-password` | público | body `{email}` → 200 siempre (no leak) |
| POST | `/api/auth/reset-password` | público | body `{token, newPassword}` → 200 / 400 token inválido |
| POST | `/api/auth/change-password` | autenticado | body `{currentPassword, newPassword}` → 200 |
| GET | `/api/auth/sessions` | autenticado | lista sesiones activas del staff |
| DELETE | `/api/auth/sessions/:id` | autenticado | revoca una sesión específica |

Todos: rate-limited según RNF4.

---

## 8. UI / Rutas frontend

| Ruta | Tipo | Descripción |
|---|---|---|
| `/login` | página standalone (no SPA) | form de login, link a forgot |
| `/login/forgot` | página standalone | form para pedir recovery |
| `/login/reset?token=...` | página standalone | form de nueva password |
| `/` (admin SPA) | autenticado | redirige a `/login?next=/` si no hay sesión |
| `/kiosko` `/scanner` | sin cambios | siguen siendo abiertos (su propio modelo de auth: cookie PIN-like del tenant) |

**Decisión importante:** `/kiosko` y `/scanner` NO usan el sistema de auth
de staff. Son tablets compartidas en el lobby — el modelo es "está
configurada en este tenant, punto". Si quisiéramos identificar al staff
que opera el scanner, sería otro sprint (autoría de check-ins).

### Pantalla de login (mock visual)

```
┌──────────────────────────────────────────┐
│                                          │
│           [Logo del tenant]              │
│                                          │
│       Inicia sesión en CCB               │
│                                          │
│   Correo electrónico                     │
│   [ tu@centroculturalbanreservas.com ]  │
│                                          │
│   Contraseña                             │
│   [ •••••••••••• ]               [👁]    │
│                                          │
│   ☐ Recordarme en este equipo            │
│                                          │
│   [        Iniciar sesión        ]       │
│                                          │
│   ¿Olvidaste tu contraseña?              │
│                                          │
└──────────────────────────────────────────┘
```

El branding del tenant (logo, colores) se aplica via SSR como en kiosko —
porque el subdomain ya identifica el tenant.

---

## 9. Migración del PIN actual (paso a paso)

Para no romper producción:

**T0 — Deploy del sistema nuevo (paralelo al viejo)**
- Migration corre, tablas se crean
- Endpoints `/api/auth/*` quedan vivos
- El middleware `requireStaff` actual (que lee PIN cookie) se mantiene
- Se añade nuevo middleware `requireStaffSession` que lee cookie de sesión
- Todos los endpoints existentes aceptan AMBOS por ahora

**T1 — Migración de Marcelino (1 staff, 1 minuto)**
- Script de una vez: crea staff_member para mfranciscomartinez@gmail.com
- Email con password temporal
- Marcelino loguea, fuerza cambio de password

**T2 — Validación (durante ~3 días)**
- Marcelino usa el sistema nuevo en paralelo al PIN viejo
- Si algo falla, vuelve al PIN sin drama

**T3 — Deprecación del PIN (después de 7 días)**
- El middleware del PIN responde 410 Gone con mensaje claro
- Endpoint `/api/staff/login` (el del PIN) se remueve
- Cookie del PIN ya no se acepta

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Marcelino se bloquea por equivocación durante la migración | PIN funciona como fallback 7 días |
| Brute-force ataque distribuido (varios IPs) | RF2 (cuenta) + RNF4 (IP) + monitoreo |
| Email de recovery cae en spam | Resend tiene buena reputación; SPF/DKIM ya configurados |
| DB filtrada expone tokens de recovery activos | Se guarda solo el hash (RNF2) |
| Cookie robada (XSS) | HttpOnly + Secure + sin SPA innerHTML de cosas no-escapadas (regla existente) |
| Olvidamos invalidar sesiones al cambiar password | Test e2e obligatorio cubre este caso |

---

## 11. Métricas de éxito (para revisar 1 semana post-deploy)

- 100% del staff de CCB usando email/password (no PIN)
- 0 incidentes de seguridad reportados
- < 5% de logins fallidos por contraseña olvidada
- Tiempo medio de login < 3s (e2e: load page → autenticado)

---

## 12. Preguntas abiertas para Marcelino

Antes de pasar al `/speckit.plan` (diseño técnico) necesito que valides:

1. **`must_change_password` forzado al primer login** del staff migrado:
   ¿OK? Alternativa: dejar la temporal y avisar pero no forzar.

2. **Duración de "recordarme"**: propongo 30 días. ¿Te parece bien o
   prefieres más/menos?

3. **Login desde nueva IP**: ¿enviar email de notificación o silencioso?
   Pro-email: transparencia. Contra-email: ruido si trabajas desde
   multiples lugares.

4. **Bloqueo escalado** (30min → 1h → 24h): ¿OK esta progresión, o
   prefieres bloqueo plano (siempre 30min) o más agresivo (1h fijo)?

5. **¿Quieres MFA/TOTP** como opcional en este sprint, aunque sea
   marcado como "experimental"? Si sí, lo agrego ahora; si no, queda
   para un sprint futuro.

6. **Recovery del owner**: si un owner pierde acceso Y su email también
   está caído, ¿qué hacemos? Propongo: contacto por DM a soporte +
   verificación humana. Si se vuelve común, automatizamos.

7. **Sobre Marcelino específicamente**: ¿tu email para la cuenta sigue
   siendo `mfranciscomartinez@gmail.com`? ¿Algún otro staff del CCB
   que también tenga acceso al admin?

---

## 13. Siguiente paso

Una vez aprobado este spec (o ajustado según tus respuestas a la sección
12):
1. **`/speckit.plan`** — diseño técnico detallado (estructura de archivos,
   middlewares, decisión final de librería de argon2, etc.)
2. **`/speckit.tasks`** — desglose en tareas implementables (~25-35
   tareas, cada una mergeable independientemente)
3. **Implementación** — branch `develop`, PRs hacia `develop`, tests,
   smoke local, deploy a staging eventualmente, merge a `multitenant`
   cuando esté listo.
