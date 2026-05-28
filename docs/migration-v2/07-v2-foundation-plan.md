# 07 · PR #1 · v2 foundation

> Branch: `migration/saas-platform-v2-parallel`
> Base: `multitenant@0e14b56` (snapshot del stale anterior preservado en `migration-v2-stale-snapshot @ ffd8894`)
> Alcance: setup del monorepo + skeleton `api-v2` + CI base · **cero runtime nuevo en prod**.

## Objetivo

Dejar listo el chasis del stack v2 para que los próximos PRs puedan agregar
funcionalidad real (auth, DB, endpoints) sin estar negociando el setup del
monorepo en cada PR.

## Decisiones de stack (alineadas con doc 01)

| Decisión | Valor | Razón |
|---|---|---|
| Package manager | pnpm 9.15.0 (pin vía `packageManager` field) | Workspaces nativos, estándar de monorepos modernos. Corepack lo enforza |
| Orquestador de tareas | Turborepo 2.x | Cache local, paralelismo, pipelines declarativos |
| TypeScript | 5.7 estricto | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `composite` para project references |
| Runtime | Node 24 LTS | Alinea con el Dockerfile v1 (ya actualizado a Node 24) |
| API framework | Fastify 5 | Decidido en doc 01 |
| Validación | Zod 3.x | Schemas compartidos en `@contan2/contracts` |

## Estructura creada

```
contan2-saas/
├── package.json                          # root del workspace · pnpm@9.15.0
├── pnpm-workspace.yaml                   # apps/* + packages/*
├── turbo.json                            # pipelines: lint/typecheck/test/build/dev
├── tsconfig.base.json                    # TS strict + composite
├── .nvmrc                                # 24
│
├── apps/
│   └── api-v2/
│       ├── package.json                  # @contan2/api-v2
│       ├── tsconfig.json                 # extends base + project refs
│       ├── Dockerfile                    # Node 24 + pnpm, SOURCE_COMMIT mirror del v1
│       └── src/
│           ├── server.ts                 # Fastify factory + entry point
│           └── routes/
│               ├── healthz.ts            # GET /api/v2/healthz
│               └── healthz.test.ts       # 3 casos vitest
│
├── packages/
│   ├── config/
│   │   ├── package.json                  # @contan2/config
│   │   ├── tsconfig.json
│   │   └── src/index.ts                  # loadConfig() + Zod env schema
│   │
│   └── contracts/
│       ├── package.json                  # @contan2/contracts
│       ├── tsconfig.json
│       └── src/index.ts                  # HealthzResponseSchema (single source of truth)
│
├── .github/workflows/
│   └── v2-foundation-ci.yml              # jobs paralelos · paths-filtered
│
└── docs/migration-v2/
    └── 07-v2-foundation-plan.md          # este doc
```

Más `pnpm-lock.yaml` generado por `pnpm install` (committed) y `.gitignore`
extendido con `.turbo/`, `**/dist/`, `**/*.tsbuildinfo`. **Backend/frontend
intactos**: `backend/`, `frontend/`, `Dockerfile` (root),
`.github/workflows/security-tests.yml`, todos los docs 00-06 y los specs
siguen sin tocar.

## Lo que este PR explícitamente NO hace

- ❌ No mueve `backend/` ni `frontend/`
- ❌ No toca runtime v1 (sigue corriendo igual en prod)
- ❌ No agrega Postgres, Redis, R2, RLS, Kysely
- ❌ No agrega auth real ni `packages/auth`
- ❌ No registra `api-v2` en Coolify
- ❌ No buildea ni deploya el Dockerfile de `api-v2`
- ❌ No agrega endpoints CRUD ni middleware de auth

## Cómo correr localmente post-merge

```bash
# Instalar pnpm si no lo tenés (Corepack ya viene con Node 24):
corepack enable
corepack prepare pnpm@9.15.0 --activate

# En el repo:
pnpm install                              # genera pnpm-lock.yaml (commit por separado)
pnpm typecheck                            # tsc -b en todos los packages
pnpm test                                 # vitest en api-v2 (3 tests del healthz)
pnpm build                                # tsc en todos los packages

# Arrancar api-v2 en :3001:
pnpm --filter @contan2/api-v2 dev

# Probar:
curl http://localhost:3001/api/v2/healthz
# → {"ok":true,"service":"api-v2","ts":"2026-...","buildSha":"unknown"}
```

## CI

Workflow nuevo `v2-foundation-ci.yml` separado del `security-tests.yml` del v1.

- **Trigger**: solo cambios en `apps/**`, `packages/**`, configs del workspace, o
  el workflow mismo. PRs que solo tocan `backend/` o `frontend/` NO lo disparan.
- **Jobs paralelos**: `lint`, `typecheck`, `test`, `build`.
- **Cache**: store de pnpm cacheado por GitHub Actions vía `actions/setup-node`
  con `cache: 'pnpm'`. Primera ejecución ~2min, subsecuentes <30s.
- **Lint hoy**: scripts `lint` retornan `echo placeholder` con exit 0. Real
  ESLint se agrega en un PR follow-up junto con prettier.

## Lockfile

`pnpm-lock.yaml` está committed (generado por `pnpm install` durante este PR).
CI puede correr `pnpm install --frozen-lockfile` desde el primer push.

## Definition of Done de este PR

- [x] 20 archivos nuevos + `.gitignore` extendido (sin tocar backend/frontend)
- [x] `pnpm install` corre limpio (~8s, 109 packages)
- [x] `pnpm build` produce `dist/` en api-v2, config, contracts
- [x] `pnpm test` · 3 tests del healthz verdes, config/contracts pasan sin tests (`--passWithNoTests`)
- [x] `pnpm typecheck` pasa en strict mode
- [ ] `pnpm --filter @contan2/api-v2 dev` arranca el server en `:3001` (verificable manual)
- [ ] CI workflow se ejecuta sin errores en GitHub Actions (al primer push)

## Riesgos identificados

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Conflicto pnpm/npm en root del repo | Baja | `pnpm-workspace.yaml` NO lista `backend/*`. `backend/node_modules` (npm) sigue siendo island independiente |
| `tsconfig` strict rompe imports legacy | N/A | Solo aplica a archivos nuevos en `apps/api-v2`, `packages/*`. v1 sigue siendo JS sin tsc |
| Dockerfile api-v2 falla en build sin lockfile | Alta hasta primer `pnpm install` | Esperado. Build manual del Dockerfile solo procede una vez `pnpm-lock.yaml` está committed |
| `verbatimModuleSyntax` choca con `import` de Fastify | Verificado vía Fastify v5 docs | Usado `import Fastify, { type FastifyInstance }` correcto |
| CI primer run lento (no cache) | Baja | `actions/setup-node` cache:pnpm acelera subsecuentes |

## Próximo PR (PR #2)

Borrador de alcance (no comprometer fecha):
- `packages/db/` con Kysely + script que genera types desde Postgres staging
  contra el schema actual (DB-first, no schema-first).
- Read-only por ahora — sin migrations nuevas, sin RLS todavía.
- Agregar dependency a `@contan2/db` en `api-v2` para validar el wiring.
- Endpoint placeholder `GET /api/v2/_internal/db-check` que hace un `SELECT 1`
  contra Postgres staging, gateado por env var de CI.

PR #2 todavía no introduce auth ni endpoints públicos reales. Eso es PR #3
(`packages/auth` + cookie compartida con v1 + primer endpoint v2 con sesión).

## Requisito transversal · Responsive (NO negociable para v2)

Todo el frontend v2 (`apps/web`) debe ser responsive desde el diseño, no como
parche posterior. Es criterio de aceptación de paridad — un módulo no se
declara migrado si no pasa el smoke visual por viewport.

Estrategia por superficie:

| Superficie | Enfoque | Razón |
|---|---|---|
| **Scanner QR** | **mobile-first** | El staff escanea desde el teléfono en la puerta; es el caso primario |
| **Kiosko / check-in** | **tablet-first** | Corre en tablets montadas en recepción (Cinema Marquee se diseñó para esa relación de aspecto) |
| **Admin SPA** (panel del tenant) | **desktop/tablet** | Gestión: tablas, formularios, reportes; el operador usa laptop o tablet grande |
| **Platform admin** (`admin.contan2.com`) | **responsive** | Super admin puede entrar desde cualquier device; no asumir desktop |

Requisitos duros:
- **Breakpoints documentados** en `packages/ui` (tokens compartidos), no
  hardcodeados ad-hoc por componente. Un solo set de breakpoints para todo v2.
- **Smoke visual por viewport antes de cutover**: cada superficie se verifica en
  al menos mobile (~375px), tablet (~768px) y desktop (~1280px) — Playwright con
  viewports fijos + screenshot diff. Sin ese smoke verde no se autoriza el
  cutover de esa superficie (ver `04-cutover-and-rollback.md`).
- La matriz de paridad (`02-functional-parity-matrix.md`) debe marcar cada
  módulo como responsive-verified, no solo funcional-verified.

## Relacionado

- [00 · Auditoría](./00-current-state-audit.md)
- [01 · Arquitectura objetivo](./01-target-architecture.md)
- [02 · Matriz de paridad](./02-functional-parity-matrix.md)
- [04 · Cutover y rollback](./04-cutover-and-rollback.md)
- [05 · Matriz de autorización](./05-authorization-matrix.md)
