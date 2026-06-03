# 09 · Checklist de ejecución del cutover v2 → prod

> Runbook **operativo, listo para pegar**, derivado de
> [`08-cutover-execution-plan.md`](08-cutover-execution-plan.md). Preparado
> 2026-06-03. **Nada de esto se ha ejecutado.**
>
> **Convención de riesgo:**
> - 🟢 = read-only o local (seguro, no modifica prod ni DB).
> - 🔴 = **escribe en prod / DB** → requiere **OK explícito del operador, por-acción**.
>
> ⚠️ **NO EJECUTAR NINGÚN PASO 🔴 SIN OK EXPLÍCITO.** El operador es el gate.

## Infra de referencia (medida)

- **Prod app:** `contan2-saas-app` · uuid `f3xck8spocf0o377y9w0vq6n` · branch `multitenant` · imagen viva `0e14b563` · auto-deploy OFF.
- **Prod DB container:** `qpse1w9v3db9w18mwqyjfv6w` · user/db `contan2/contan2`.
- **SSH:** `ssh -i ~/.ssh/contabo_key root@217.77.12.180`.
- **Prod FQDNs (v1):** `ccb.contan2.com`, `admin.contan2.com`, `contan2.com`, `www.contan2.com`.
- **Esquema `_migrations`:** `(id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())` · `id` = nombre del archivo sin `.sql`.

---

## 1 · 🟢 Backup `pg_dump` (custom format, copia fuera del VPS)

```bash
TS=$(date +%Y%m%dT%H%M%SZ)
# Dump custom-format streameado a tu máquina (copia off-box). pg_dump corre DENTRO
# del container = misma versión que el server → sin mismatch.
ssh -i ~/.ssh/contabo_key root@217.77.12.180 \
  'docker exec qpse1w9v3db9w18mwqyjfv6w pg_dump -U contan2 -d contan2 -Fc' \
  > ~/contan2-prod-$TS.dump
# Verificar tamaño + integridad del archivo (TOC, sin restaurar)
ls -lh ~/contan2-prod-$TS.dump
pg_restore -l ~/contan2-prod-$TS.dump | head
```
*Lectura pura sobre prod; no modifica nada.*

## 2 · 🟢 Restore-test en Postgres temporal LOCAL (aislado de prod y staging)

```bash
# Postgres throwaway LOCAL (no toca el de prod ni el de staging)
docker run -d --name contan2-restore-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=restore_test postgres:16-alpine
until docker exec contan2-restore-test pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
# Restaurar la copia de prod
cat ~/contan2-prod-$TS.dump | docker exec -i contan2-restore-test \
  pg_restore -U postgres -d restore_test --no-owner --no-privileges
# Verificar counts == baseline prod + ENSAYAR 023/024 sobre la copia real
docker exec contan2-restore-test psql -U postgres -d restore_test -tAc \
  "SELECT 'users='||count(*) FROM users UNION ALL SELECT 'activities='||count(*) FROM activities UNION ALL SELECT 'attendance='||count(*) FROM attendance;"
docker exec contan2-restore-test psql -U postgres -d restore_test -c \
  "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS companions_children SMALLINT NOT NULL DEFAULT 0 CHECK (companions_children >= 0);"
docker exec contan2-restore-test psql -U postgres -d restore_test -c \
  "ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;"
# Limpiar
docker rm -f contan2-restore-test
```
Valida (a) que el backup es restaurable y (b) que 023/024 aplican limpio sobre datos reales de prod.

## 3 · 🟢 SQL read-only final para prod (verificación pre-migración)

```bash
ssh -i ~/.ssh/contabo_key root@217.77.12.180 'docker exec qpse1w9v3db9w18mwqyjfv6w psql -U contan2 -d contan2 -tAc "
-- duplicados (org,user,activity) → debe ser 0
SELECT '\''dup='\''||count(*) FROM (SELECT organization_id,user_id,activity_id FROM attendance WHERE user_id IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1) d;
-- oversold (enrolled>capacity) → debe ser 0
SELECT '\''oversold='\''||count(*) FROM activities WHERE enrolled_count>capacity;
-- columnas 023/024 (0=ausente, 1=presente)
SELECT '\''companions_children='\''||count(*) FROM information_schema.columns WHERE table_name='\''attendance'\'' AND column_name='\''companions_children'\'';
SELECT '\''end_date='\''||count(*) FROM information_schema.columns WHERE table_name='\''activities'\'' AND column_name='\''end_date'\'';
SELECT '\''credential_sent_at='\''||count(*) FROM information_schema.columns WHERE table_name='\''users'\'' AND column_name='\''credential_sent_at'\'';
-- unique indexes críticos
SELECT '\''uniq_idx='\''||string_agg(indexname,'\'','\'') FROM pg_indexes WHERE (tablename='\''attendance'\'' OR tablename='\''users'\'') AND indexdef ILIKE '\''%UNIQUE%'\'';
-- counts baseline
SELECT '\''counts='\''||(SELECT count(*) FROM organizations)||'\''/'\''||(SELECT count(*) FROM users)||'\''/'\''||(SELECT count(*) FROM activities)||'\''/'\''||(SELECT count(*) FROM attendance);
-- migraciones registradas
SELECT '\''max_migration='\''||max(id) FROM _migrations;
"'
```

### Baseline esperado (medido read-only 2026-06-03)

| Check | Valor |
|---|---|
| duplicados attendance | **0** |
| oversold activities | **0** |
| `attendance.companions_children` | **ausente (0)** → 023 pendiente |
| `activities.end_date` | **ausente (0)** → 024 pendiente |
| `users.credential_sent_at` | **presente (1)** |
| unique indexes | `attendance_org_user_activity_unique`, `users_org_code_unique`, `users_org_email_lower_unique` |
| counts (orgs / users / activities / attendance) | **1 / 1211 / 9 / 648** |
| `max(_migrations.id)` | ≤ `022_…` (023/024 NO registradas) |

Si algún valor difiere del baseline al re-verificar, **detener** y revisar antes de migrar.

## 4 · 🔴 Aplicar 023/024 (SOLO con OK explícito)

Prerequisito duro: pasos 1–3 OK. Ambas son aditivas/idempotentes; en `attendance`
(648 filas) el `ADD COLUMN ... DEFAULT 0` es metadata-only en PG11+ (sin reescritura).

```bash
# (a) ALTER idempotentes en PROD
ssh -i ~/.ssh/contabo_key root@217.77.12.180 'docker exec qpse1w9v3db9w18mwqyjfv6w psql -U contan2 -d contan2 -c "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS companions_children SMALLINT NOT NULL DEFAULT 0 CHECK (companions_children >= 0);"'
ssh -i ~/.ssh/contabo_key root@217.77.12.180 'docker exec qpse1w9v3db9w18mwqyjfv6w psql -U contan2 -d contan2 -c "ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;"'
# (b) registrar en _migrations (id = nombre del archivo sin .sql)
ssh -i ~/.ssh/contabo_key root@217.77.12.180 'docker exec qpse1w9v3db9w18mwqyjfv6w psql -U contan2 -d contan2 -c "INSERT INTO _migrations (id) VALUES ('\''023_attendance_companions_children'\''),('\''024_activities_end_date'\'') ON CONFLICT (id) DO NOTHING;"'
# (c) verificar
ssh -i ~/.ssh/contabo_key root@217.77.12.180 'docker exec qpse1w9v3db9w18mwqyjfv6w psql -U contan2 -d contan2 -tAc "SELECT id FROM _migrations WHERE id LIKE '\''02[34]_%'\'' ORDER BY id;"'
```

**Reversibilidad:** aditivas → v1 las ignora; no requieren down-migration. Rollback = no-op (dejar las columnas).

## 5 · Variables necesarias para apps v2 prod

### `contan2-api-v2-prod` (interno, sin FQDN)
| Var | Valor |
|---|---|
| `DATABASE_URL` | DB de prod (string interno de Coolify) |
| `ROOT_DOMAIN` | `contan2.com` |
| `TRUST_FORWARDED_HOST` | `1` |
| `TRUST_PROXY` | `1` *(de #29; default ya es 1, setear explícito)* |
| `SCANNER_SECRET` | **nuevo aleatorio de prod** (no reusar el de staging) |
| `RESEND_API_KEY` | **dejar SIN setear al inicio** (dry-run) → setear recién tras validar envío real |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | remitente de prod |
| `PORT` / `NODE_ENV` | `3001` / `production` |
| `custom_network_aliases` | `contan2-api-v2-prod` |

### `contan2-web-v2-prod` (público)
| Var | Valor |
|---|---|
| `API_BASE_URL` | `http://contan2-api-v2-prod:3001` |
| `ROOT_DOMAIN` | `contan2.com` |
| `PORT` / `HOSTNAME` / `NODE_ENV` | `3000` / `0.0.0.0` / `production` |

## 6 · Nombres de apps prod v2 propuestos

En el proyecto Coolify prod (`contan2-saas`, `l8f7s7ph8waevndsrkjhj878`) o un proyecto v2-prod nuevo:
- **`contan2-api-v2-prod`** — interno, `apps/api-v2/Dockerfile`, branch `multitenant`.
- **`contan2-web-v2-prod`** — público, `apps/web/Dockerfile`, branch `multitenant`.
- **v1 (`contan2-saas-app`) intacto.**

## 7 · Hosts canary propuestos

- **v2 en host paralelo nuevo**, v1 sigue en `ccb.contan2.com`:
  - `app.contan2.com` (o `v2.contan2.com`) → **`contan2-web-v2-prod`**. El wildcard
    `*.contan2.com` **ya resuelve al VPS** → no hace falta DNS nuevo; solo rutear en
    Traefik/Coolify + TLS Let's Encrypt.
- **Canary por dispositivo/superficie** (un solo web-v2 sirve todas las rutas):
  1. **Kiosko**: tablet → `app.contan2.com/kiosko`
  2. **Scanner**: teléfonos staff → `app.contan2.com/scanner`
  3. **Admin**: operadores → `app.contan2.com/app`
- **Rollback por fase**: devolver la URL del dispositivo a `ccb.contan2.com` (v1).
  Segundos, sin tocar v1.

---

## ⚠️ Advertencia final

**No ejecutar ningún paso 🔴 (ni el redeploy/levantado de apps v2 prod) sin OK
explícito del operador, por-acción.** Los pasos 🟢 (backup, restore-test local,
SQL read-only) son seguros y no modifican prod ni la DB. Este documento es el
runbook; la decisión de ejecutar es siempre del operador.

Relacionado: [`08-cutover-execution-plan.md`](08-cutover-execution-plan.md),
[`03-security-hardening-plan.md`](03-security-hardening-plan.md),
[`04-cutover-and-rollback.md`](04-cutover-and-rollback.md).
