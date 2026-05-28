# Contan2 v2 · convenciones

Referencia para trabajar en el monorepo v2. La skill (`SKILL.md`) tiene las
reglas; esto es el detalle técnico.

## Layout

```
apps/web        Next.js 16 (React 19, Tailwind v4 CSS-first @theme)
apps/api-v2     Fastify (consume @contan2/db, @contan2/auth)
packages/db     Kysely + tipos manuales + parity test
packages/auth   verificación de sesión compartida con v1
```

Producción v1 NO incluye esto: el `Dockerfile` raíz solo hace
`COPY backend ./backend` + `COPY frontend ./frontend`. v2 es inerte en prod.

## Kysely · tipos manuales

No usamos codegen; los tipos se mantienen a mano en `packages/db/src/schema.ts`
y se protegen con `schema-parity.test.ts` (introspección de
`information_schema`). Convenciones:

- Autoincrement / `BIGSERIAL` → `Generated<string>` (bigint llega como string).
- Timestamps → `ColumnType<Date, string | undefined, never>` (se leen como
  Date; se insertan como string ISO opcional; nunca se updatean directo).
- Columnas JSON/JSONB → `JSONColumnType<...>`.
- Export del cliente tipado: `export type DbClient = Kysely<Database>`. Los
  consumidores (p.ej. api-v2) importan `DbClient` desde `@contan2/db`, **no**
  importan `kysely` directo (rompe el typecheck del consumidor).

Si agregás/quitás columnas: actualizá `schema.ts` **y** el set `EXPECTED` del
parity test en el mismo PR.

## Sesión compartida con v1 (read-only)

v2 reusa la sesión de v1 sin re-loguear:

- Cookie: `contan2_session` (misma que v1).
- Hash de token: `hashToken(token) = sha256(token).hex` — **byte-idéntico** a
  v1. No cambiar el algoritmo ni el encoding.
- Tablas leídas: `staff_auth_sessions` (token_hash, expires_at, revoked_at),
  `staff_members`, `organizations`. v2 **no escribe** en estas tablas.

`GET /api/v2/auth/me` resuelve el staff actual a partir de esa cookie.

## Resolución de tenant

- `parseHost(host)` extrae el subdominio contra `ROOT_DOMAIN` (de
  `process.env`). En tests, setear `process.env.ROOT_DOMAIN` antes de importar
  el módulo o usar `vi.stubEnv`.
- `RESERVED_SUBDOMAINS` incluye `admin` (plataforma), `www`, etc. — esos no son
  tenants.
- Dev fallback: `localhost` → tenant `ccb` (tenant ancla).
- `GET /api/v2/org/branding` devuelve el branding del tenant resuelto.

## Tailwind v4 (apps/web)

- CSS-first: tokens en `@theme` dentro de `app/globals.css`, no `tailwind.config`.
- Breakpoints usados: base / `md` (768px = 48rem) / `xl` (1280px = 80rem).
- El `lint` de los paquetes es placeholder (`echo`) para evitar fricción de
  `eslint-config-next`; no es señal de calidad — la verificación real es
  typecheck + build + tests.
