---
name: contan2-v2-pr-workflow
description: Disciplina de PRs incrementales para la migración v2 de contan2 (monorepo Next.js 16 + Fastify + Kysely en apps/ y packages/). Actívala al trabajar en código v2 — nuevos paquetes, api-v2, apps/web, resolución de tenant, branding. Cubre cómo correr los tests de integración (vitest directo, no turbo), convenciones de tipos Kysely y la sesión compartida con v1.
---

# Contan2 · Workflow de PRs v2

La migración v2 (de Express+Vanilla a Next 16 + Fastify + Kysely, monorepo
pnpm+Turbo) avanza en PRs chicos e incrementales sobre `multitenant`. Esta
skill codifica cómo trabajar sin romper producción v1.

## REGLAS DURAS

1. **Plan primero**: para cualquier cambio no trivial, plan + diagnóstico
   antes de editar. Confirmá alcance con el usuario.
2. **Sin push hasta reporte**: commit local, reportá diff stat + estado, y
   esperá OK para push. Nunca merge ni deploy sin autorización explícita.
3. **Cero v1**: no tocar `backend/` ni `frontend/` (la app v1 en producción).
   El v2 vive solo en `apps/` y `packages/`. El `Dockerfile` de prod **no**
   copia `apps/`/`packages/`, así que v2 no corre en prod todavía — pero eso
   no es licencia para tocar v1.
4. **Read-only sobre datos compartidos**: v2 lee las tablas y la cookie de v1
   (`organizations`, `staff_members`, `staff_auth_sessions`, cookie
   `contan2_session`). No escribe ahí. Ver `references/v2-conventions.md`.
5. **No force-push a `multitenant`**, nunca `--no-verify`.

## Tests de integración (clave — esto confunde)

Turbo corre en **strict-env mode**, así que **no propaga `DATABASE_URL`** a las
tasks. Por eso los tests de integración (los que tocan Postgres) se corren con
`vitest` directo en el paquete, no con `pnpm test` desde la raíz.

```bash
# Postgres efímero para tests (puerto 5433, tmpfs)
docker compose -f docker-compose.test.yml up -d
node scripts/seed-test-fixtures.mjs   # si el paquete lo necesita

# Correr el test de integración con DATABASE_URL explícito
cd packages/db   # o el paquete que toque
DATABASE_URL=postgres://...@localhost:5433/... npx vitest run

# Teardown
docker compose -f docker-compose.test.yml down
```

- Sin `DATABASE_URL`, los tests de integración hacen **skip** (no fallan):
  `const run = DATABASE_URL ? describe : describe.skip`. Eso es a propósito.
- El drift guard (`packages/db/test/schema-parity.test.ts`) introspecciona
  `information_schema` y verifica que las columnas declaradas en `schema.ts`
  existan en la DB real. Si cambiás `schema.ts`, actualizá el set `EXPECTED`.

## Checklist de PR v2

- [ ] Solo `apps/`/`packages/`; cero diffs en `backend/`/`frontend/`.
- [ ] `pnpm typecheck` y `pnpm build` verdes (Turbo).
- [ ] Tests de integración corridos con vitest directo + Postgres efímero, o
      con skip honesto si no aplica.
- [ ] Si tocaste `schema.ts`: parity test actualizado y verde.
- [ ] Commit local, diff stat reportado, **sin push** hasta OK.
