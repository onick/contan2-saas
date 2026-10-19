# E2E (Playwright) de contan2 contra staging

Pruebas de extremo a extremo del producto real (`ccb.stg.contan2.com`) y humo de solo lectura de producción.
Plan y hallazgos: `docs/plans/2026-10-16-qa-user-flows-ui.md` y `docs/plans/2026-10-16-qa-consolidado.md`.

## Reglas de seguridad

- Todo lo que escribe o hace login apunta SOLO a `*.stg.contan2.com` o `localhost` (`assertStaging`). Producción solo
  existe en el proyecto `prod-readonly`, que aborta cualquier método distinto de GET/HEAD y no hace login.
- Todo dato creado lleva el prefijo `[E2E] <runId>` y se registra en un ledger (`.artifacts/<runId>/created.ndjson`).
  `global-teardown.ts` lo limpia con throttle y reintento ante 429 y marca lo que no pudo limpiar
  (`created.json` con `cleaned`, y `uncleaned.json`). Lo que quede: `provision/purge-staging.sql` (el orquestador, con OK). El purge también cubre los ciclos/categorías `[E2E]` (viven en la actividad). Tras limpiar, el teardown avisa (`residue.json`) si algún ciclo `[E2E]` sigue visible en `/reports/categories`; no oculta nada.
- Staging tiene datos reales copiados: no se commitean `.artifacts/`, `.auth/` ni `.env.e2e` (gitignored). En CI no hay
  trazas, video ni screenshots (`E2E_NO_MEDIA=1`) y el reporte pasa por `support/scrub-report.mjs` (misma lógica que `support/mask.ts`).

## Preparación

```bash
cp apps/web/e2e/.env.e2e.example apps/web/e2e/.env.e2e   # completar; nunca commitear
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter @contan2/web exec playwright install chromium webkit
```

Cuentas de staging: `provision/make-seed.mjs` genera `provision/seed-staging.sql` (sin secretos en claro, solo hashes y
tokens derivados). Lo aplica el orquestador a la DB de **staging**; es idempotente y se puede re-ejecutar para reabrir
los flujos de un solo uso (reset, invitación, RSVP).

```bash
cd apps/web && node e2e/provision/make-seed.mjs   # lee .env.e2e; agrega a .env.e2e los tokens que falten
```

El seed crea: cuentas `e2e-{admin,operator,consulta,puerta,protocolo,biblioteca,reset}@test.local`, la invitación de
equipo `e2e-invitado@test.local`, 6 invitaciones RSVP con tokens conocidos sobre la actividad `[E2E-SEED] RSVP (no tocar)`
(activa, +365 días; visible en el kiosko) y el tenant `test-tenant` (`test-tenant.stg.contan2.com`) con el owner
`e2e-owner@test-tenant.local`.

## Variables

| Variable | Para qué |
|---|---|
| `E2E_BASE_URL`, `E2E_PLATFORM_URL`, `E2E_PROD_URL` | hosts (por defecto ccb.stg / admin.stg / ccb.contan2.com) |
| `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD` | owner existente de staging |
| `E2E_{ADMIN,OPERATOR,CONSULTA,PUERTA,PROTOCOLO,BIBLIOTECA}_PASSWORD` | cuentas sembradas por rol |
| `E2E_SCANNER_PIN` | PIN del escáner (admite ≤4 intentos por corrida, 8/min) |
| `E2E_RESET_TOKEN`, `E2E_INVITE_TOKEN`, `E2E_INVITE_PASSWORD` | AUTH-10 / AUTH-11 (un solo uso: re-sembrar) |
| `E2E_RSVP_TOKEN` | base de los 6 tokens RSVP: `token(slot) = sha256(base:slot)` (RSVP-01 sin SSH) |
| `E2E_TEST_TENANT_OWNER_PASSWORD` | owner de `test-tenant` (AUTH-15c, PLT-04) |
| `E2E_PLATFORM_EMAIL`, `E2E_PLATFORM_PASSWORD` | plataforma (Q6); el bloque del seed está comentado |
| `E2E_SSH_HOST`, `E2E_SSH_KEY`, `E2E_DB_CONTAINER` | opcional: SELECT por SSH (ya no hace falta para RSVP) |
| `E2E_ROLES` | limita los logins del setup (`owner,admin,...,scanner,platform`); cada login cuenta contra 10/15 min por IP |
| `E2E_WORKERS` | fuerza el número de workers (CI: 1) |
| `E2E_NO_MEDIA=1` | sin trazas/video/screenshots |
| `Q2_RUN_PIN=1` | habilita los tests con PIN real del escáner (solo `webkit-tablet`, una vez por corrida) |

## Sesiones guardadas (`.auth/`)

`global-setup.ts` reutiliza cada `storageState` solo si la sonda (`/app/cuenta/api/me`, `/scanner/api/me`, ...) responde 200;
con 401 hace un login nuevo (PIN del escáner o login de staff) **una sola vez por corrida**. Un cambio en el formato o la
verificación de sesión del producto (p. ej. PR-16) invalida los `.auth/` antiguos: se renuevan solos en el siguiente
arranque, pero si una corrida parcial (`E2E_ROLES`, `--grep`) no los toca, bórralos (`rm -rf e2e/.auth`) antes de repetir.

**Regla: nunca cierres sesión ni revoques con un `storageState` compartido.** Desde PR-16 "Salir" del escáner revoca el token
en el servidor (lista `scanner-revoked`): hacerlo con `.auth/scanner.json` deja inválida la sesión para el resto de la
corrida y las siguientes. Por eso SCN-09 obtiene su propio token con `POST /scanner/api/pin` en un contexto sin estado
(consume 1 intento del límite de PIN, solo con `Q2_RUN_PIN=1`) y está en un `describe` al final de `escaner.spec.ts`.
AUTH-07 (cerrar/revocar sesiones) ya usa sesiones propias de la cuenta `e2e-reset`.

## Límites de staging (rate limits por IP)

| Límite | Valor | Consecuencia |
|---|---|---|
| Login de staff | 10 / 15 min | un login por rol y por corrida (las sesiones se reusan desde `.auth/`); `E2E_ROLES` los acota |
| Lockout por cuenta | 5 fallos / 15 min | AUTH-02 usa 1 intento malo con el owner |
| Forgot / reset | 5 / 15 min compartido | AUTH-14 (`z-rate-limit`) deja la IP limitada ~15 min: **siempre el último** |
| Import de usuarios | 3 / min | `withRateLimitRetry` (respeta `Retry-After`; el limite se comparte entre corridas) |
| Escrituras de actividades | 30 / min | el teardown espacia ≥2,1 s y reintenta ante 429 (máx. 3) |
| Check-in público | 10 / min; lookup/suggest 30 / min | `spend()` de `support/q2-common.ts` |
| RSVP | 10 / min | `spend('rsvp')` |
| PIN del escáner | 8 / min, ≤4 por corrida | `Q2_RUN_PIN=1` solo en webkit-tablet |

Con `--grep @smoke` o `@write` el config usa **1 worker** (el humo también escribe). `E2E_WORKERS` manda sobre todo.
Nunca corras dos corridas a la vez contra el mismo staging (comparten rate limits): el workflow usa `concurrency: e2e-staging`.

## Cómo correr cada ola

Desde `apps/web` (los comandos de `package.json` ya fijan el config):

```bash
# Humo @smoke (setup + desktop-1440): ~20 tests, mezcla lectura y escritura
pnpm e2e:smoke

# Q3 · RBAC (API + UI por rol) y administración
E2E_ROLES=owner,admin,operator,consulta,puerta,protocolo,biblioteca pnpm e2e --project=desktop-1440 \
  specs/q3-rbac specs/q3-admin/admin-*.spec.ts

# Q4 · Reportes, protocolo y puerta;  Q5 · Biblioteca
pnpm e2e --project=desktop-1440 specs/q4-reportes-protocolo-puerta specs/q5-biblioteca

# Q7 · Calidad (a11y, teclado, consistencia, vitals) en los tres viewports
pnpm e2e --project=desktop-1440 --project=tablet-820 --project=mobile-390 specs/q7-quality

# Q2 · Kiosko, escáner y RSVP en iPad (WebKit). Con PIN real: Q2_RUN_PIN=1 (E2E_SCANNER_PIN en .env.e2e)
Q2_RUN_PIN=1 E2E_ROLES=owner,scanner pnpm e2e --project=webkit-tablet specs/q2-publico

# Q1 · Auth (desktop-1440). 02-sesion y 05-cuenta gastan logins reales; ver support/q1-common.ts (presupuesto)
pnpm e2e --project=desktop-1440 specs/q1-auth/0

# Al final de TODO, en este orden: identidad y rate limit de auth (bloquea la IP ~15 min)
pnpm e2e --project=desktop-1440 specs/q3-admin/z-identity-last.spec.ts
pnpm e2e --project=desktop-1440 specs/q1-auth/z-rate-limit.spec.ts

# Producción, solo lectura (sin login, sin setup)
pnpm e2e:prod-ro
```

`pnpm e2e --list` verifica que todo compila sin tocar staging. Informes: `playwright-report/` (HTML),
`e2e/.artifacts/report.json`. Hallazgos de producto y notas: se adjuntan por test (`note()` / `record()`).

## Criterio de verde (revisión 3 del QA)

Los tests afirman el comportamiento correcto: no quedan `test.fail` de bugs ya corregidos. Un test que falla es una
regresión (o un dato de staging distinto), no un "bug conocido". Los skips legítimos: viewport que no aplica, token de
un solo uso ya consumido (re-sembrar), falta de credenciales/PIN y WebKit-macOS sin foco por Tab en botones.

## CI

`.github/workflows/e2e-staging.yml` (secretos `E2E_*`, concurrency `e2e-staging`):

- `smoke`: en cada disparo (`workflow_dispatch`, `schedule` 07:00 UTC = 03:00 RD, `repository_dispatch: staging-deployed`).
  Comprueba `expected_sha` contra `/api/version` si se pasó.
- `nightly-full`: solo schedule o dispatch con `full`. RBAC → calidad en 3 viewports → `q2-publico` en iPad con
  `Q2_RUN_PIN=1` → `z-identity-last` → `z-rate-limit` (siempre el último).
- `prod-readonly`: diario, sin secretos.

Artefactos: 14 días, solo `report.scrubbed.json` y los reportes de teardown (sin trazas, video ni screenshots).

## Estructura

- `playwright.config.ts`, `env.ts`, `global-setup.ts` (un login por rol), `global-teardown.ts` (ledger).
- `fixtures/`: `test.ts` (guardas de solo lectura en prod), `roles.ts`, `data.ts` (prefijo y ledger), `rsvp-seed.ts`, `staging-sql.ts`.
- `support/`: utilidades por ola (`q1-common`, `q2-common`, `q3-api`, `q4-common`, `q5-biblio`, `q7-common`), `mask.ts`, `scrub-report.mjs`.
- `provision/`: `make-seed.mjs` + `seed-staging.sql.tmpl` (cuentas, tokens, RSVP, test-tenant) y `purge-staging.sql`.
- `specs/q0-scaffold`, `q1-auth`, `q2-publico`, `q3-admin`, `q3-rbac`, `q4-reportes-protocolo-puerta`, `q5-biblioteca`, `q7-quality`.
