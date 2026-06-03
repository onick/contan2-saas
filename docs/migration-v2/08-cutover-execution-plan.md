# 08 · Plan de ejecución de cutover v2 → prod

> Diagnóstico + plan para llevar el stack v2 (Fastify `api-v2` + Next `web`) de
> staging a producción **sin downtime ni pérdida de datos**. Construido sobre
> [`03-security-hardening-plan.md`](03-security-hardening-plan.md) y
> [`04-cutover-and-rollback.md`](04-cutover-and-rollback.md), reconciliado con el
> **estado real medido (read-only) el 2026-06-03**.
>
> **Esta fase NO se ejecuta automáticamente.** Cada paso requiere aprobación
> explícita del operador, por-acción. Nada de deploy / Coolify-write / DB-write /
> DNS hasta el OK correspondiente.

## Estado del que partimos (2026-06-03)

- Prod corre **v1** en `contan2-saas-app`, imagen/commit **`0e14b563`**. Auto-deploy **OFF**.
- `multitenant` en `1297334` con v2 completo y **validado E2E en staging**: admin v2,
  kiosko v2 real, scanner v2 real, check-in público real, credencial PNG + Resend
  dry-run, favicon.
- **v2 sigue inerte en prod**: el `Dockerfile` de prod copia solo `backend/` + `frontend/`.

---

## 1 · Mapa prod actual (medido)

| Ítem | Valor real |
|---|---|
| App Coolify prod | `contan2-saas-app` (`f3xck8spocf0o377y9w0vq6n`), **running:healthy**, `multitenant@HEAD`, build dockerfile |
| Imagen viva | `0e14b563` (28-may) · **auto-deploy OFF** (`is_auto_deploy_enabled: None`) |
| FQDNs (todos → v1) | `ccb.contan2.com`, `admin.contan2.com`, `contan2.com`, `www.contan2.com` |
| Dockerfile prod | **single-stage**, copia **solo `backend/` + `frontend/`** (v2 inerte). Node 24, `libvips`+`chromium`+fonts, `server.js` :3000 |
| Env prod | `DATABASE_URL, DB_DRIVER, EMAIL_FROM, RESEND_API_KEY, ROOT_DOMAIN, STAFF_PIN, PUBLIC_URL, NODE_ENV, PORT` |
| DB prod | `qpse1w9v…` (contan2/contan2) · **1 org**, **1211 users**, **9 activities**, **648 attendance** |
| Proxy | Traefik (Coolify), routing **por host**, TLS Let's Encrypt |

**DB prod — chequeos críticos (read-only, 2026-06-03):**

- ✅ **Existe** `attendance_org_user_activity_unique` UNIQUE `(organization_id, user_id, activity_id)` → la **idempotencia del check-in v2 (`ON CONFLICT`) funciona en prod**.
- ✅ `users_org_code_unique` + `users_org_email_lower_unique` → pre-check de email y unicidad de código v2 OK.
- ✅ `users.credential_sent_at` presente (mig 011). ✅ **0 duplicados** `(org,user,activity)`. ✅ **0 actividades oversold**.
- ❌ **`attendance.companions_children` NO existe** (mig 023 pendiente). ❌ **`activities.end_date` NO existe** (mig 024 pendiente).
- ❌ **0 policies RLS** en prod.

---

## 2 · Estrategia de convivencia v1/v2 (recomendada)

**Apps separadas en el proyecto prod de Coolify, espejando staging.** NO modificar
el `Dockerfile` prod ni meter v2 en el contenedor v1.

- **`api-v2-prod`** — interno, sin FQDN, alias de red estable, `Dockerfile apps/api-v2`.
- **`web-v2-prod`** — público, `Dockerfile apps/web`, `API_BASE_URL` → alias interno.
- **v1 queda intacto** sirviendo `ccb/admin/contan2/www`.

**Canary por HOST/dispositivo, no por % de tráfico.** El doc 04 propone weighting
1%→100%, pero eso no encaja con la arquitectura real (apps separadas + tenant-por-host
+ Next SSR que llama a api-v2; Traefik rutea por host, no pondera). Lo realista:

- Levantar v2 prod en un **host paralelo nuevo** (ej. `app.contan2.com` o
  `v2.contan2.com`); v1 sigue en `ccb.contan2.com`.
- **Migrar los dispositivos físicos superficie por superficie** apuntando su URL al
  host v2. Rollback = devolver la URL del dispositivo a v1 (segundos).
- **DB compartida = fuente única** → cero divergencia; lo que v2 escribe lo lee v1
  (y viceversa).

`contan2.com`/`www` (landing) puede quedar en v1 hasta el final.

---

## 3 · Migraciones prod (023 + 024)

**Ambas aditivas, `IF NOT EXISTS`, v1 las ignora.** Chequeos previos corridos
(read-only): columnas ausentes ✔, 0 duplicados ✔, unique index presente ✔,
0 oversell ✔, uniqueness users ✔.

- **Backup primero (OBLIGATORIO)**: snapshot lógico de la DB prod (`pg_dump`) +
  restaurarlo en staging para verificar, **antes** de tocar nada. (Regla dura:
  proteger la DB de prod — nada sin esto.)
- **Cuándo**: inmediatamente antes de levantar la primera superficie v2 que
  escriba (kiosko). **023 es prerequisito duro**; 024 va junto (bajo costo, lo usa
  el admin de actividades).
- **Quién/cómo**: dos caminos —
  1. **psql directo** `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` + `INSERT INTO
     _migrations` (como en staging). Control total, reversible. **← recomendado**,
     con backup + OK explícito por-acción.
  2. Dejar que el runner de v1 las aplique en su próximo deploy (v1 corre
     `runMigrations` al arrancar) — implica redeploy de v1, que preferimos evitar
     en este corte.
- **Reversibilidad**: columnas aditivas → no hay que revertir; si se aborta v2,
  v1 las ignora.

---

## 4 · Seguridad / hardening (gaps reales encontrados)

| Tema | Estado real | Acción pre-prod |
|---|---|---|
| **Rate-limit con IP real** | api-v2 es `Fastify({logger})` **sin `trustProxy`** → detrás de Traefik `req.ip` = IP del proxy → **todos comparten bucket** (rate-limit roto) | **Setear `trustProxy`** (o parsear `X-Forwarded-For`) antes de prod. **Gap real, cambio chico.** |
| **`x-forwarded-host`** | `TRUST_FORWARDED_HOST=1` + `resolveTenantFromHost` valida contra DB | OK; mantener el flag **solo** detrás del proxy confiable |
| **`SCANNER_SECRET`** | seteado en staging; **falta en prod** | Generar secreto prod propio (no reusar el de staging) |
| **`RESEND_API_KEY`** | **ya está en prod** (v1 manda correos reales) → v2 enviaría **correos reales** en cada check-in nuevo | Ver sección 5 (gating) |
| **Cookies / dominios** | `scanner_session` host-only + `secure` en prod ✔. `contan2_session` (admin) lo comparte v1 | Si v2 va en **otro host** que v1, el admin **re-loguea** en el host v2 (cookie host-scoped) — decidir dominio de cookie o aceptar re-login |
| **RLS** | **0 policies** en prod | Defensa en profundidad (V011 del doc 03). App ya filtra por `organization_id`; con 1 tenant el riesgo es bajo, pero **recomendado antes de onboard multitenant real** |
| **Logs sin PII** | email service ya usa `maskEmail` ✔ | Verificar que el logger de Fastify no vuelque body con email/código |
| **Traceabilidad build** | `buildSha=unknown` (falta "Include Source Commit in Build") | Activarlo en la app v2 prod |

---

## 5 · Resend real (gating contra envíos masivos)

- **Hoy en prod**: `RESEND_API_KEY` presente → v2 enviaría real. **Blast radius por
  diseño = 1 correo por visitante NUEVO con email** (el existente no reenvía; no hay
  bucle ni bulk). Bajo, pero hay que controlarlo.
- **Probar primero en staging real**: setear temporalmente `RESEND_API_KEY` en
  `api-v2-staging` + check-in nuevo con email **de prueba** → verificar correo + que
  marca `credential_sent_at`; luego quitar la key.
- **Activar prod**: recién cuando el dry-run staging y el envío real staging estén OK.
- **`credential_sent_at`**: se marca **solo si `sent===true`** (implementado y
  validado). Si más adelante se agrega reenvío, gatear por `credential_sent_at IS NULL`.
- **Evitar masivos**: **nunca** correr backfill/bulk desde v2; la única ruta de
  envío es el check-in unitario. Opcional: flag `CREDENTIAL_EMAIL_ENABLED` para
  apagar el email v2 sin tocar la key compartida.

---

## 6 · Rollback (fortaleza del shared-DB + aditivo)

- **App**: v1 sigue vivo e intacto. Rollback = **apuntar el host/dispositivo de
  vuelta a v1** (o apagar las apps v2). **< 5 min, sin tocar v1.**
- **DB**: migraciones **aditivas** → no requieren rollback; v1 ignora
  `companions_children`/`end_date`.
- **Si v2 ya escribió check-ins**: esas filas de `attendance`/`users` son **válidas
  para v1** (mismo esquema, mismo unique index, `credential_sent_at` lo lee v1).
  **Cero limpieza, cero divergencia.**
- **Apagar v2 → volver a v1**: cambiar routing de host. Los datos que v2 escribió
  quedan y son compatibles.
- **Snapshot pre-corte** es el seguro por si algo inesperado corrompe (improbable
  con aditivo).

---

## 7 · Canary (orden recomendado, por dispositivo/host)

**1) Kiosko v2 → 2) Scanner v2 → 3) Admin v2** (blast-radius creciente).

| Fase | Qué se mueve | Validación | Éxito / Fallo |
|---|---|---|---|
| **0 · Pre** | (nada) backup DB + migs 023/024 + `trustProxy` + `SCANNER_SECRET` prod + buildSha | smoke staging completo verde | counts DB == baseline; migs aplicadas |
| **1 · Kiosko** | tablet(s) del kiosko → host v2 | registro nuevo (código real) + hallado + companions + cupo + dry-run/real email | 0 5xx, attendance crece consistente, sin oversell · **Fallo**: URL tablet → v1 |
| **2 · Scanner** | teléfonos de staff → host v2 (PIN prod) | login PIN, scan QR real, check-in, dup/cupo/no-encontrado | igual + cookie scanner OK · **Fallo**: URL → v1 |
| **3 · Admin** | operadores → host v2 `/app` | login (cookie), listados reales, branding, identidad, reportes | sin leak cross-tenant, conteos == v1 · **Fallo**: → v1 |

Cada fase: **monitoreo activo + counts DB antes/después + health**. No avanzar de
fase sin la anterior estable N horas.

---

## 8 · Checklist final antes de producción

- [ ] **Backup**: `pg_dump` prod + restaurado/verificado en staging
- [ ] **Migraciones**: 023 + 024 aplicadas a prod (con backup) + registradas en `_migrations`
- [ ] **Hardening**: `trustProxy` en api-v2, `SCANNER_SECRET` prod, buildSha trazable, logs sin PII
- [ ] **Resend**: validado real en staging con email de prueba; decisión de gating en prod
- [ ] **Apps v2 prod**: `api-v2-prod` (interno, healthy) + `web-v2-prod` (TLS, host paralelo) levantadas
- [ ] **Smoke v2 prod (lectura)**: `/healthz`, `/kiosko`, `/scanner`, `/app` 200; tenant por host correcto
- [ ] **DB counts** baseline registrados (users 1211, activities 9, attendance 648)
- [ ] **Auth**: cookie admin funciona en host v2 (o plan de re-login); scanner PIN prod OK
- [ ] **Healthchecks + observabilidad**: health verde, logs estructurados, alerta de 5xx
- [ ] **DNS/TLS**: host v2 resuelve + cert LE OK; rollback DNS conocido
- [ ] **Rollback ensayado**: apuntar un dispositivo v2→v1 y volver, < 5 min
- [ ] **Aprobación explícita** del operador por-fase (gate humano, como el doc 04)

---

## 9 · Riesgos bloqueantes (resumen)

1. **`trustProxy` / rate-limit roto** — sin `trustProxy`, `req.ip` es la IP del proxy
   → el rate-limit del check-in/scanner/lookup no aísla por cliente real. **Arreglar
   antes de exponer escritura pública.** (Primer PR ejecutable.)
2. **`RESEND_API_KEY` ya presente en prod** — v2 enviaría correos reales en cada
   check-in nuevo. Validar real en staging + decidir gating antes de prod.
3. **Backup obligatorio antes de migraciones** — `pg_dump` + restore verificado en
   staging antes de cualquier `ALTER` en prod. Innegociable.
4. **v2 prod como apps separadas** — NO modificar el contenedor v1; levantar
   `api-v2-prod` + `web-v2-prod` aparte (espejo de staging). v1 intocable.

---

## 10 · Recomendación de secuencia (no ejecutar aún)

1. **Cerrar gaps de código primero** (PRs chicos a `multitenant`, validados en
   staging): **`trustProxy`** en api-v2 y (opcional) **flag de email**. Pre-requisitos
   de hardening, no de infra. → **El primer PR ejecutable es `trustProxy`/rate-limit,
   chico y aislado.**
2. **Backup prod + aplicar 023/024** (con OK por-acción).
3. **Levantar `api-v2-prod` + `web-v2-prod`** en host paralelo, smoke de lectura.
4. **Validar Resend real en staging**, decidir gating prod.
5. **Canary kiosko → scanner → admin**, con monitoreo y rollback listo por fase.

**Riesgo mayor** = el gap de `trustProxy`/rate-limit y el `RESEND_API_KEY` ya presente
en prod. **Lo más a favor** = la DB prod ya tiene el unique index crítico y es 100%
compatible aditivamente, así que el rollback es trivial.

---

Relacionado: [`03-security-hardening-plan.md`](03-security-hardening-plan.md),
[`04-cutover-and-rollback.md`](04-cutover-and-rollback.md),
[`05-authorization-matrix.md`](05-authorization-matrix.md),
[`07-v2-foundation-plan.md`](07-v2-foundation-plan.md).
