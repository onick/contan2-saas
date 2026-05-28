# @contan2/auth

Validación de identidad del stack v2. **Read-only en PR #3**: valida la
cookie de sesión que crea v1, no la crea ni la revoca.

## Cookie compartida con v1

v2 lee la **misma** cookie `contan2_session` que setea v1. El token plano
(64 hex) va en la cookie; en `staff_auth_sessions` vive su `sha256` hex.
`hashToken()` replica byte-a-byte el de v1
(`backend/src/services/auth/passwordService.js`), así que una sesión
iniciada en `ccb.contan2.com/login` (v1) valida en `/api/v2/auth/me` sin
re-login. Bidireccional.

## API

```ts
import { resolveStaffSession } from '@contan2/auth';
import { createDb } from '@contan2/db';

const db = createDb();
const resolved = await resolveStaffSession(db, token);
// null → 401 (sin sesión / inválida / expirada / revocada / staff no activo)
// { staff, sessionId } → 200
```

| Export | Qué hace |
|---|---|
| `hashToken(plain)` | sha256 hex · idéntico a v1 |
| `validateStaffSession(db, token)` | sesión viva (no revocada, no expirada) o null |
| `loadActiveStaffById(db, id)` | staff sólo si `deleted_at IS NULL` y `status='active'` |
| `publicStaff(row)` | shape exacto de v1 (10 campos) |
| `resolveStaffSession(db, token, opts?)` | sesión + staff en uno; null si algo falla |

## Paridad con v1

`publicStaff` devuelve exactamente:
`{ id, organizationId, email, fullName, status, role, mustChangePassword, mfaEnabled, lastLoginAt, createdAt }`

Reglas de v1 reproducidas:
- staff `suspended`/`deleted` → null (→ 401)
- sesión revocada/expirada → null (→ 401)

## Cross-tenant (preparado, no activo)

`resolveStaffSession(db, token, { organizationId })` rechaza sesiones de
otra org. api-v2 todavía NO resuelve tenant por subdominio, así que en
PR #3 no se pasa `organizationId`. Cuando se active, este resolver debería
distinguir 403 (cross-tenant) de 401 (inválida) — hoy ambos colapsan a null.

## NO incluido en PR #3

- Login / logout / change-password / reset (mutaciones — v1 sigue dueño)
- Creación/revocación de sesiones en v2
- Seteo de cookies desde v2
- Platform admin auth
- RLS
- Tenant resolution por subdominio
