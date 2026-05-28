---
name: contan2-release-a5
description: Deploy controlado de contan2-saas a producción (Coolify) con el gate A.5 dual-verify. Actívala cuando el usuario pida deployar, hacer release, "subir a prod", verificar el build desplegado, o cuando se vaya a tocar producción de contan2.contom. Envuelve scripts/release/deploy-coolify.mjs; nunca reimplementa el deploy.
---

# Contan2 · Release con A.5 dual-verify

Skill para deployar `contan2-saas-app` a producción de forma controlada y con
evidencia. **No reimplementa nada**: orquesta `scripts/release/deploy-coolify.mjs`,
que ya hace precondiciones → push → trigger Coolify → A.5 dual → healthz y
archiva evidencia en `release-evidence/`.

## Qué es A.5 dual-verify

El SHA que querés en producción debe coincidir **por dos caminos
independientes** antes de declarar éxito:

1. **Endpoint**: `GET https://<host>/api/version` → `buildSha === EXPECTED_SHA`.
2. **Label OCI del contenedor**: `org.opencontainers.image.revision === EXPECTED_SHA`
   (vía SSH al VPS, `docker inspect`).

Si cualquiera de los dos no coincide → **abortar**, no "casi". El script
devuelve exit code `7` en ese caso. Ver `references/a5-runbook.md` para el
procedimiento completo y todos los exit codes.

## REGLAS DURAS (no negociables)

1. **Autorización por-deploy**: cada deploy a producción requiere autorización
   explícita del usuario *para ese deploy*. Un "sí" anterior no autoriza el
   siguiente. Nunca deployes proactivamente.
2. **Si prod física está detrás de `origin/multitenant`, reportar la brecha
   antes de deployar y pedir confirmación explícita.** Antes de disparar,
   comparar el SHA vivo en prod (`/api/version`) contra `origin/multitenant`.
   Si prod está atrás (commits sin desplegar), parar, reportar exactamente qué
   commits entrarían, y esperar confirmación. No asumas que "ponerse al día"
   es lo deseado.
3. **A.5 es no-skippable**: nunca declares un deploy exitoso sin las dos
   verificaciones en verde. Si el script aborta en exit 7, reportá el mismatch
   tal cual; no lo presentes como éxito parcial.
4. **`--dry-run` primero** cuando haya cualquier duda sobre estado/branch/SHA.
   Es gratis y muestra el plan sin tocar nada.
5. **Fast-forward only**: el deploy va sobre `multitenant`. Nunca force-push a
   `multitenant`. Si el push no es ff, parar e investigar (no `--force`).
6. **No tocar a mano**: ni DB de producción, ni el volumen, ni la UI de
   Coolify, ni `docker` en el VPS salvo el `inspect` read-only que hace el
   propio script. Sin migraciones improvisadas, sin emails de prueba a
   terceros (solo a la casilla del operador si hace falta).
7. **Nunca imprimas** tokens, cookies ni secretos en el reporte. Enmascarar
   emails. La evidencia local en `release-evidence/` está gitignored — no la
   commitees.
8. **Nunca `--no-verify`** ni saltar hooks/firmas.

## Flujo típico

```bash
# 1. (opcional, recomendado) plan sin efectos
node scripts/release/deploy-coolify.mjs --branch multitenant --dry-run

# 2. solo verificar qué hay vivo ahora (A.5 contra lo desplegado)
node scripts/release/deploy-coolify.mjs --branch multitenant --verify-only

# 3. deploy real (requiere autorización explícita para ESTE deploy)
node scripts/release/deploy-coolify.mjs --branch multitenant
```

`--skip-tests` existe pero **no lo uses** salvo que el usuario lo pida
explícitamente y los tests ya hayan corrido en CI sobre el mismo SHA.

## Antes de reportar éxito

- [ ] Endpoint `/api/version.buildSha` == SHA esperado
- [ ] Label OCI `revision` == SHA esperado
- [ ] `/healthz` OK
- [ ] Evidencia archivada en `release-evidence/<timestamp>/`
- [ ] Reporte con emails enmascarados, sin secretos

Si falta cualquiera → no es éxito. Reportá el estado real y el exit code.
