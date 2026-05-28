# A.5 dual-verify · runbook

Detalle operativo del gate A.5 y del script `scripts/release/deploy-coolify.mjs`.
Esto es referencia; la skill (`SKILL.md`) tiene las reglas duras.

## Infra (resumen)

- App Coolify: `contan2-saas-app`, UUID `f3xck8spocf0o377y9w0vq6n`.
- Deploy trigger: `POST /api/v1/deploy?uuid=<uuid>&force=false`.
- Poll: `GET /api/v1/deployments/<deployment-uuid>` hasta estado terminal.
- Host prod (tenant ancla): `https://ccb.contan2.com`; plataforma:
  `https://admin.contan2.com`. Versión: `GET /api/version` → `{ buildSha, ... }`.
- VPS: Contabo, acceso SSH. El label OCI se lee con
  `docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' <container>`.

Las credenciales reales (token Coolify, host SSH, etc.) viven en `.env.release`
(gitignored). El script las carga con `--env <path>` (default `.env.release`).
**Nunca** hardcodear ni imprimir esos valores.

## Las dos verificaciones independientes

A.5 = dos caminos que no comparten origen de error:

1. **Endpoint HTTP** — qué dice la app de sí misma:
   `GET /api/version` → `buildSha`. Cubre "el código corriendo se compiló de
   este SHA".
2. **Label OCI del contenedor** — qué dice el runtime del contenedor:
   `org.opencontainers.image.revision`. Cubre "la imagen efectivamente
   desplegada/levantada es de este SHA" (atrapa casos de imagen vieja
   re-tagueada, cache, rollback silencioso).

Ambas deben igualar `EXPECTED_SHA` (el SHA local/remoto que se quiso deployar).
Coincidencia parcial = fallo.

## Exit codes del script

| Code | Significado |
|------|-------------|
| 0 | ok |
| 1 | error genérico |
| 2 | problema de env/credenciales |
| 3 | working tree sucio |
| 4 | branch equivocado |
| 5 | tests fallaron |
| 6 | push o SHA remoto no coincide |
| 7 | **A.5 dual mismatch** (endpoint u OCI label) |
| 8 | deploy Coolify falló / timeout |
| 9 | healthz timeout |
| 10 | SSH inalcanzable |

## Chequeo de brecha prod vs origin (regla dura #2)

Antes de un deploy real:

```bash
# SHA vivo en prod
curl -fsS https://ccb.contan2.com/api/version | jq -r .buildSha

# SHA de la rama que se deployaría
git rev-parse origin/multitenant
```

Si el SHA vivo != `origin/multitenant`, listar la brecha y pedir confirmación:

```bash
git log --oneline <sha-vivo>..origin/multitenant
```

Reportar exactamente esos commits **antes** de disparar. No "ponerse al día"
por iniciativa propia.

## Procedimiento

1. `--dry-run` → revisar plan (branch, SHA, precondiciones).
2. Verificar brecha prod vs `origin/multitenant` (arriba).
3. Con autorización explícita: deploy real.
4. El script hace: working-tree limpio → branch correcto → tests (salvo
   `--skip-tests`) → push ff → verificar SHA remoto → trigger Coolify → poll →
   healthz → **A.5 dual** → evidencia.
5. Confirmar las dos verificaciones en verde. Si exit 7 → reportar mismatch,
   no es éxito.

## Evidencia

Se archiva en `release-evidence/<timestamp>/` (gitignored): manifest, summary,
y artifacts crudos (respuestas de version endpoint, docker inspect, healthz).
Útil para post-mortem. No commitear.
