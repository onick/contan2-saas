# scripts/release/ · Release controlado a Coolify

Flujo local de deploy a producción que **no depende de GitHub Actions ni de
webhooks de GitHub→Coolify** como mecanismo principal. Codifica el procedimiento
que se hizo manualmente 4× el 27-may-2026 (hardening, HSTS, router fix, test
hygiene) en un único comando con evidencia archivada.

GitHub Actions sigue corriendo como CI post-push (notifica si los tests rompen),
pero **no es el gate operacional**. El operador decide cuándo deployar y el
script garantiza que el container vivo en prod realmente contiene el SHA que
pusheó (A.5 dual-verify).

## Por qué existe

Síntomas reportados con el flujo basado en Actions:
- Webhooks GitHub→Coolify a veces se pierden; el push pasa pero el deploy
  nunca arranca hasta que el operador lo dispara manual.
- Notificaciones (email, Slack) llegan tarde; el operador no sabe el estado
  hasta abrir manualmente la UI de Actions.
- Workflows con falsos positivos (ej. `audit-svg` puede confundirse con
  validación de prod cuando sólo audita el checkout).
- No hay forma estándar de archivar evidencia de un deploy específico para
  pegar en un ticket o post-mortem.

Este script resuelve los 4 puntos.

## Setup (una vez)

```bash
cp .env.release.example .env.release
chmod 600 .env.release
$EDITOR .env.release    # completar COOLIFY_API_TOKEN
```

`.env.release` está gitignored; nunca se commitea. El script nunca imprime
el valor de `COOLIFY_API_TOKEN`, sólo los primeros 4 chars + longitud para
confirmar que cargó el correcto.

## Uso típico

```bash
# Deploy estándar (corre tests, push, deploy, A.5 dual):
node scripts/release/deploy-coolify.mjs --branch multitenant

# Skip tests si ya los corriste en otra terminal:
node scripts/release/deploy-coolify.mjs --branch multitenant --skip-tests

# Dry-run · todo el pre-flight pero sin push ni deploy:
node scripts/release/deploy-coolify.mjs --branch multitenant --dry-run

# Sólo verificar A.5 contra el deploy actual (sin tocar nada):
node scripts/release/deploy-coolify.mjs --branch multitenant --verify-only

# Via pnpm script (sólo disponible después de mergear `migration/saas-platform-v2-parallel`,
# que añade el package.json root del monorepo):
pnpm release:deploy -- --branch multitenant
```

Mientras esta rama vive sobre `multitenant` (sin monorepo todavía), usar
siempre `node scripts/release/deploy-coolify.mjs`. El alias `pnpm
release:deploy` se agrega como follow-up cuando el v2 foundation mergee a
`multitenant`.

## Lo que hace, paso por paso

| Fase | Acción | Si falla |
|---|---|---|
| **ENV** | Carga `.env.release`, valida keys requeridas | exit 2 |
| **PRE-FLIGHT** | working tree clean · branch correcta · ahead/behind · SSH alcanzable · Coolify token válido · tests opcional | exit 3/4/5/10/2 |
| **PUSH** | `git push origin <branch>` · verifica que remote SHA matchea EXPECTED | exit 6 |
| **COOLIFY** | POST `/api/v1/deploy?uuid=<APP>` · poll `/api/v1/deployments/<uuid>` hasta `finished`/`failed`/timeout | exit 8 |
| **HEALTHCHECK** | poll `PUBLIC_HEALTHZ_URL` hasta 200 (timeout 2 min default) | exit 9 |
| **A.5 DUAL** | (1) GET `PUBLIC_VERSION_URL` → `.buildSha` == EXPECTED · (2) SSH + `docker inspect` label `org.opencontainers.image.revision` == EXPECTED | exit 7 |
| **EVIDENCE** | escribe `release-evidence/<RUN_ID>/manifest.json` + `summary.md` + artefactos raw | — |

## Exit codes

| Code | Significado |
|---|---|
| 0 | success |
| 1 | error genérico |
| 2 | env / credentials problem (token inválido, app uuid 404, var faltante) |
| 3 | working tree dirty |
| 4 | wrong branch |
| 5 | tests failed |
| 6 | push failed o remote SHA mismatch |
| 7 | A.5 dual mismatch (endpoint o OCI label) |
| 8 | coolify deploy fallido o timed out |
| 9 | healthz timeout |
| 10 | SSH no alcanza el VPS |

## Evidencia

Cada run crea `release-evidence/<RUN_ID>/` con:

```
release-evidence/20260528T010000Z/
├── EXPECTED_SHA              · el commit SHA que se intentó deployar
├── BRANCH                    · branch del deploy
├── manifest.json             · machine-readable, todos los timestamps + phases
├── summary.md                · humano-legible, pegable a Slack/ticket
├── deployment-trigger.json   · response de POST /api/v1/deploy
├── healthz.json              · body de /healthz post-deploy
├── version-endpoint.json     · body de /api/version (lado 1 de A.5)
└── container-info.json       · containerName + OCI label (lado 2 de A.5)
```

`release-evidence/` está gitignored — la evidencia es local del operador.
Pegar `summary.md` a tickets cuando aplique.

## Variables de entorno

Ver `.env.release.example` para la lista completa con comentarios.

Requeridas:
- `COOLIFY_BASE_URL` · `COOLIFY_API_TOKEN` · `COOLIFY_APP_UUID`
- `VPS_SSH_HOST` · `CONTAINER_NAME_PREFIX`
- `PUBLIC_HEALTHZ_URL` · `PUBLIC_VERSION_URL`

Opcionales (tienen defaults):
- `SSH_KEY_PATH` · `TEST_COMMAND` · `POLL_INTERVAL_MS` · `DEPLOY_TIMEOUT_MS` ·
  `HEALTHZ_TIMEOUT_MS` · `EVIDENCE_ROOT`

## Diseño · cero deps externas

El script usa sólo APIs nativas de Node 24+:
- `fetch` para Coolify API y endpoints HTTP
- `child_process.spawn` para git y ssh
- `fs/promises` para evidencia

No agrega `node_modules` al root del repo. Corre con `node` directo, sin tsx,
sin pnpm install previo.

## Anti-patterns evitados

- **No usar shell concat para tokens.** El token va por header, nunca en
  string que pueda terminar en logs/scrollback.
- **No `set -x` en bash.** Es Node.
- **No `--no-verify` en git push.** Si hay pre-push hook, debe correr.
- **No `--force-with-lease` automático.** El script abort si remote difiere.
- **No autorización implícita.** Cada deploy es un comando explícito del
  operador. No hay cron, no hay schedule.

## Cuándo NO usar este script

- Cuando el cambio es runtime crítico que requiere coordinación con el equipo
  (en ese caso, abrir ventana coordinada manual y seguir el runbook
  `docs/migration-v2/04-cutover-and-rollback.md`).
- Cuando el deploy debe ir a un ambiente distinto del default (cambiar
  `COOLIFY_APP_UUID` y `PUBLIC_*` para staging, no reusar la misma config).
- Cuando se quiere bypassear A.5 (no se puede; es el gate final, intencional).

## Roadmap

- [ ] Tests unitarios de las funciones puras (`parseEnvFile`, render de
      summary, etc.). Requiere setup vitest a nivel root.
- [ ] Integración con `pnpm-lock.yaml` para verificar paridad de deps antes
      del push.
- [ ] Modo `--watch-deploy <deployment_uuid>` para retomar polling si la
      conexión se cortó.
- [ ] Notificación opcional a webhook (Slack/Discord) con el summary post-run.
