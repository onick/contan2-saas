# 06 · Runbook · cuarentena de SVG históricos (pre-deploy)

> Procedimiento operacional **obligatorio antes de cada deploy** mientras la
> política sea "uploads nuevos rechazan SVG, pero el path estático sigue
> sirviendo lo que ya hay en `data/uploads`".
>
> El operador humano decide la cuarentena; el script solo *inventa* — solo lee.

## Por qué existe este runbook

El hardening commit `497f3c1` removió `image/svg+xml` del `fileFilter` de
multer, así que **uploads nuevos** quedan bloqueados. El commit `60dd781`
añadió validación de contenido (sharp format whitelist + GIF magic byte)
para rechazar SVG disfrazado de PNG/GIF/WebP en los uploads nuevos. Pero
`/uploads/*` sigue siendo path estático: cualquier archivo ya escrito al
volumen antes del hardening — incluyendo SVG renombrado como `.png` por un
atacante en el pasado — sigue siendo servido tal cual.

Este runbook produce evidencia firmada de que el volumen está limpio
(o, si no lo está, qué archivos cuarentenar) **antes** de exponer la rama
a producción.

## Pre-requisitos

- SSH al VPS Coolify con permiso de **lectura** sobre el volumen del
  contenedor (`persistent_storage/<container>/data/uploads`).
- El script `audit-historical-svg.mjs` NO está en producción todavía: vive
  en esta rama. Se transfiere a `/tmp` en el host, se ejecuta una vez, y se
  borra. NO se monta sobre el contenedor; el script lee el volumen desde el
  host.
- Tener `node` en el VPS (lo provee Coolify) o ejecutar el script dentro de
  un contenedor base de Node 24 con bind-mount al volumen.

## Procedimiento (read-only, evidencia firmada)

Las variables `$VPS`, `$VOLUME_PATH` y `$RUN_ID` se setean al inicio:

```bash
# Identificadores de esta corrida
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
VPS="ops@vps.contan2.example"                    # ajustar
VOLUME_PATH="/var/lib/docker/volumes/contan2-saas_uploads/_data"  # ajustar
LOCAL_SCRIPT="backend/scripts/audit-historical-svg.mjs"
REMOTE_SCRIPT="/tmp/audit-historical-svg.${RUN_ID}.mjs"
EVIDENCE_DIR="evidence/svg-audit/${RUN_ID}"
mkdir -p "$EVIDENCE_DIR"
```

### Paso 1 · Calcular checksum local del script

```bash
shasum -a 256 "$LOCAL_SCRIPT" | tee "$EVIDENCE_DIR/checksum.local.txt"
```

Guarda el sha256 del script tal y como existe en la rama. Cualquier
modificación posterior se detecta comparando con esta firma.

### Paso 2 · Transferir el script al VPS

```bash
scp "$LOCAL_SCRIPT" "$VPS:$REMOTE_SCRIPT"
```

El destino es `/tmp/...` con `RUN_ID` en el nombre — no choca con runs
previos, no toca `/app`, no toca el volumen.

### Paso 3 · Verificar integridad del script en el VPS

```bash
ssh "$VPS" "shasum -a 256 $REMOTE_SCRIPT" | tee "$EVIDENCE_DIR/checksum.remote.txt"
```

Comparar manualmente `checksum.local.txt` y `checksum.remote.txt`: deben
coincidir. Si difieren → abortar, investigar man-in-the-middle.

```bash
diff <(awk '{print $1}' "$EVIDENCE_DIR/checksum.local.txt") \
     <(awk '{print $1}' "$EVIDENCE_DIR/checksum.remote.txt") \
  && echo "✓ checksum match"
```

### Paso 4 · Ejecutar inventario (solo-lectura)

```bash
ssh "$VPS" "node $REMOTE_SCRIPT --dir $VOLUME_PATH --json" \
  > "$EVIDENCE_DIR/audit.json"
echo "$?" > "$EVIDENCE_DIR/exit.code"
cat "$EVIDENCE_DIR/exit.code"
```

El script:
- **NO** escribe en el volumen.
- **NO** borra ningún archivo.
- **NO** modifica metadata.
- **SÍ** abre + lee bytes de cada archivo (sniff por contenido — necesario
  para detectar SVG renombrado como `.png`/`.jpg`).
- Emite JSON con el listado completo y exit code estable.

### Paso 5 · Decisión sobre el exit code

| Exit | Significado | Acción |
|---|---|---|
| `0` | Directorio legible + 0 candidatos en `entries` | **Autorizar deploy**. Adjuntar `audit.json` al ticket de release. |
| `10` | Candidatos SVG presentes pero `entries[].flags` vacío en todos | **Bloquear deploy**. Procesar cada entrada (Paso 6). |
| `20` | Al menos una entrada con algún flag | **Bloquear deploy**. Procesar cada entrada (Paso 6). |
| `1`  | Directorio no existe / no es directorio / sin permisos / I/O / cualquier ambigüedad | **Bloquear deploy**. NO se asume "clean" — investigar path, permisos, y reintentar. |

Exit `1`, `10` y `20` son **equivalentes para efectos de "puedo deployar":
ninguno autoriza**. Mientras exista cualquier archivo en `audit.json.entries`
— con o sin flags, con o sin contenido SVG verificado — el deploy queda
bloqueado bajo la política actual de "SVG deshabilitado en uploads nuevos".
La presencia de un solo SVG histórico servido desde `/uploads/*` mantiene
la ventana XSS abierta que motivó este runbook.

Flags reportados en `entries[].flags` (cualquiera dispara exit 20):

| Flag | Significado |
|---|---|
| `script_tag` | `<script ...` literal en el archivo |
| `event_handler` | atributo `onload=`, `onclick=`, etc. |
| `javascript_uri` | `javascript:` literal o entidad codificada (`&#x6A;avascript`) |
| `foreign_object` | `<foreignObject>` (vector típico de HTML embebido) |
| `expression_css` | `expression(` o `url(javascript:)` en atributo `style` |
| `wrong_extension` | SVG **detectado por contenido** cuya extensión NO es `.svg` (renombre malicioso confirmado). Si solo hubo `truncated_audit` sin detección positiva de `<svg`, este flag NO se agrega. |
| `svg_extension_unverified` | archivo `.svg` sin `<svg\b` detectable en los primeros 16 MiB — vacío, binario disfrazado o estructura inválida; **siempre requiere revisión humana** |
| `truncated_audit` | archivo > 16 MiB; el auditor leyó solo el prefijo. **Aplica a cualquier extensión** (`.svg`, `.png`, `.jpg`, `.bin`, etc.) — un atacante puede esconder payload pasado el cap. Bloquea deploy aunque ningún otro flag esté presente: la decisión sobre el contenido es de un humano (`less <file>` / `hexdump`). |
| `read_error` | no se pudo abrir/leer (permisos, FS corrupto). Investigar antes de seguir |

### Paso 6 · Procesamiento de candidatos (cuando exit es 10 o 20)

**Regla de procesamiento (inequívoca):** se debe procesar **cada candidato
listado en `audit.json.entries`**, tenga flags o no. Un candidato sin flags
NO está exento; el script es heurístico y exit `10` significa "encontré
SVG histórico", no "limpio". La distinción exit 10/20 solo determina la
urgencia del análisis, no si se procesa.

El Paso 6 se divide en dos sub-pasos con autorizaciones independientes:

#### Paso 6.A · Revisión read-only (no requiere autorización para escritura)

Para cada `entry` en `audit.json.entries` ejecutar, dejando producción
intacta:

A1. **Copiar el archivo** del volumen productivo a evidencia local. El SVG
    NO se mueve, NO se renombra; solo se copia por SCP/SSH `cat`:
    ```bash
    ssh "$VPS" "cat $VOLUME_PATH/<basename>" > "$EVIDENCE_DIR/files/<basename>"
    ```

A2. **Calcular SHA-256** local de cada copia y agrupar duplicados (mismo
    hash ⇒ asset idéntico re-subido):
    ```bash
    shasum -a 256 "$EVIDENCE_DIR/files/"* > "$EVIDENCE_DIR/sha256.txt"
    ```

A3. **Inspeccionar el contenido como texto** — NUNCA abrir el SVG
    productivo directamente en navegador (un `<script>` dispararía
    payload). Inspección permitida: `cat`, `less`, `xmllint --noout`,
    `grep -i 'script\|on[a-z]\+=\|javascript:\|foreignObject'`.

A4. **SELECT read-only** en la DB de producción para localizar referencias.
    Buscar el basename (no el path completo, porque las URLs en DB son
    relativas tipo `/uploads/<basename>`):
    ```sql
    SELECT id, slug, logo_url, email_logo_url
      FROM organizations
     WHERE logo_url LIKE '%<basename>'
        OR email_logo_url LIKE '%<basename>';

    SELECT id, name, image_url
      FROM activities
     WHERE image_url LIKE '%<basename>';
    ```
    Identificadores sensibles (slugs reales, UUIDs) se redactan al
    publicar el reporte.

A5. **Clasificar** cada candidato según el resultado de A1–A4:
    - **Asset legítimo referenciado**: el SVG está apuntado por alguna fila
      en `organizations` o `activities`; el contenido es benigno (sin
      `<script>`, sin `on*`, sin `javascript:`, sin `<foreignObject>`).
    - **Asset legítimo no referenciado**: archivo presente en el volumen
      sin ninguna fila apuntándolo; contenido benigno (probable upload
      huérfano por flujo abortado).
    - **Sospechoso**: cualquier flag de riesgo presente en el archivo, o
      contenido que no parezca un SVG legítimo.

El Paso 6.A NO requiere autorización para escritura. Solo lee del VPS
(`cat`) y de la DB (`SELECT`). Su salida es un plan de remediación
candidato a candidato.

#### Paso 6.B · Remediación con escritura (ventana coordinada · REQUIERE AUTORIZACIÓN EXPLÍCITA)

##### Contexto temporal (orden corregido)

Esta ventana se ejecuta para cerrar la última ventana XSS heredada antes
de declarar FASE 1.A terminada. Dos hechos del entorno fijan el orden:

1. **Producción aún corre `multitenant`** sin el hardening:
   `/api/uploads/image` sigue público y acepta `image/svg+xml`. Mientras
   ese endpoint esté vivo, un anónimo puede insertar SVG nuevos al volumen
   en cualquier momento.
2. **Un `UPDATE` SQL directo NO dispara `recordAudit()` ni
   `invalidateTenantCache()`.** La pista de auditoría y la invalidación
   de caché se gestionan manualmente (evidencia textual del SQL + restart
   del contenedor en el deploy).

Consecuencia operativa: **el deploy del hardening tiene que ocurrir antes
de tocar el volumen**. Si limpiáramos primero, un atacante podría volver
a poluir el volumen entre el re-audit y el deploy — y si el deploy fallara,
la ventana quedaría abierta indefinidamente con la nueva contaminación.

La ventana se divide en: **pre-window setup** (offline, ya hecho), un
**preflight read-only** justo antes de empezar, y la **ventana de
ejecución** en orden estricto A → G.

##### Pre-window setup (offline, sin tocar producción)

Estos pasos se ejecutan en una sesión anterior, antes de pedir
autorización para la ventana. Su salida queda archivada en
`$EVIDENCE_DIR/review-6A/raster/`:

1. **Generar PNG/WebP offline** desde la copia local de cada SVG
   legítimo en `$EVIDENCE_DIR/review-6A/files/`:
   ```js
   sharp(svgPath, { density: 300 })
     .resize({ width: 1080, fit: 'inside', withoutEnlargement: false })
     .png({ compressionLevel: 9 })
     .toFile(outPath);
   ```
   - `density: 300` para bordes nítidos.
   - PNG con alpha preserva transparencia para sidebars oscuros.

2. **Verificar localmente** cada raster generado:
   - Firma `89 50 4E 47 0D 0A 1A 0A` (magic bytes PNG).
   - `sharp.metadata().format === 'png'` (defensa contra "sharp escribió
     algo raro").
   - Dimensiones razonables (típico 800–1200 px ancho).
   - SHA-256 calculado y archivado.
   - Tamaño coherente (10–80 KiB para logo simple).

3. **Nombres productivos** fijados antes de la ventana:
   - `${RUN_ID}-<tenant>-logo-primary.png` para `logo_url`.
   - `${RUN_ID}-<tenant>-logo-email.png` para `email_logo_url`.
   - El prefijo `RUN_ID` traza el archivo de vuelta al ticket de remediación.

Cualquier verificación que falle → regenerar offline, no pedir
autorización hasta tener artefactos válidos.

##### Preflight read-only (justo antes de la ventana, sin tocar nada)

Re-validar que el estado del volumen sigue siendo exactamente el que
analizamos en 6.A. Si algo cambió entre 6.A y este momento, abortar.

1. **Re-correr Pasos 1–5** del runbook completos (scp del auditor,
   checksum, ejecutar `--json`, archivar exit code). Producción NO se
   modifica; solo se lee.

2. **Comparar `entries[]`** del nuevo `audit.json` contra la lista
   esperada **exacta**:
   - `1778861296455-89dba8565c66.svg`
   - `1778861352720-bf8e54ab45e6.svg`
   - `1778862794499-2816b97ae427.svg`
   - `1778862797957-26be9ddf429c.svg`

   Si aparece **un quinto archivo**, o **falta uno**, o cualquier
   entrada trae **flags no vistos en 6.A** → abortar la ventana.

3. **Recalcular SHA-256 remoto** y exigir match con los hashes ya
   archivados en 6.A:
   ```bash
   ssh "$VPS" "sha256sum $VOLUME_PATH/<basename>"
   ```
   Hashes esperados (de la revisión 6.A original):
   - **ASSET A** (`<file1>` + `<file2>`):
     `f348a06735fbe5029cd8344308aa9ee09167a875d73a4d0c00902070407259b9`
   - **ASSET B** (`<file3>` + `<file4>`):
     `e0c312cefe2c21693199bd1bddd09aede2e1bb6035db6c04169e47b194e727f5`

   Cualquier hash distinto significa que el archivo cambió entre 6.A y
   ahora — el contenido analizado ya no es el contenido productivo. ABORTAR.

4. **Resultado del preflight**: solo si exit es `10`, las 4 entries son
   exactamente las esperadas, y los 4 hashes hacen match, entonces se
   procede con la ventana. Si cualquier condición falla, abortar,
   reportar, y re-abrir 6.A para el nuevo estado.

##### A · Merge + push + deploy del hardening (PRIMERO)

Razón del orden: una vez desplegado el hardening, `/api/uploads/image`
deja de aceptar SVG (ni de anónimos ni de sesiones autorizadas). El
volumen no puede recibir SVG nuevos durante la limpieza. Si empezáramos
por el volumen, dejaríamos una ventana donde un atacante puede volver a
contaminarlo y, si el deploy fallara, la contaminación quedaría sin
remediación.

Importante: Coolify deploya desde `origin/multitenant`, no desde el
working tree local. **El push a origin es obligatorio** antes de
disparar el deploy.

```bash
# A.1 · Snapshot del SHA esperado (el HEAD de security/p0-hardening)
EXPECTED_SHA="$(git rev-parse security/p0-hardening)"
echo "EXPECTED_SHA=$EXPECTED_SHA" | tee "$EVIDENCE_DIR/deploy/expected_sha.txt"

# A.2 · Merge + push
git checkout multitenant
git merge --ff-only security/p0-hardening
git push origin multitenant

# A.3 · Verificar que el remoto YA tiene el SHA esperado antes del deploy
git ls-remote origin refs/heads/multitenant | awk '{print $1}' \
  | tee "$EVIDENCE_DIR/deploy/remote_multitenant_sha.txt"
# Debe matchear $EXPECTED_SHA; si no, abortar el deploy.

# A.4 · Trigger deploy en Coolify (token desde backend/.env)
export $(grep -E "^(COOLIFY_API_TOKEN|COOLIFY_BASE_URL)" backend/.env | tr -d '"' | xargs)
curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "$COOLIFY_BASE_URL/api/v1/deploy?uuid=f3xck8spocf0o377y9w0vq6n&force=false" \
  | tee "$EVIDENCE_DIR/deploy/coolify-trigger.json"
```

Esperar hasta:
- Container nuevo en `docker ps` con timestamp posterior a `coolify-trigger.json`.
- Healthcheck del contenedor en `running (healthy)`.
- `GET /healthz` desde el dominio público devuelve `{ ok: true }`.

##### A.5 · Verificación del SHA desplegado (obligatorio antes de B)

Antes de probar nada o tocar datos, confirmar que el contenedor activo
fue construido desde `$EXPECTED_SHA`. Se exigen **dos checks
coincidentes**, no opcionales.

Pre-requisito de build (configuración Coolify):

1. En la app `f3xck8spocf0o377y9w0vq6n`, **Application Settings → Build**,
   activar la opción **"Include Source Commit in Build"**. Esto hace que
   Coolify pase `SOURCE_COMMIT=<sha>` como build arg durante el `docker
   build`.

2. El Dockerfile en esta rama declara:
   ```dockerfile
   ARG SOURCE_COMMIT=unknown
   LABEL org.opencontainers.image.revision="$SOURCE_COMMIT"
   ENV BUILD_SHA="$SOURCE_COMMIT"
   ```
   Si la opción de Coolify no está activa, el build no recibe
   `SOURCE_COMMIT` y los tres puntos quedan en `unknown` — el operador
   debe abortar (no se puede certificar identidad).

3. Build manual fuera de Coolify (debug o redeploy local):
   ```bash
   docker build --build-arg "SOURCE_COMMIT=$(git rev-parse HEAD)" \
                -t contan2-saas:$(git rev-parse --short HEAD) .
   ```

Mecanismos de verificación obligatorios — **ambos deben coincidir con
`$EXPECTED_SHA`**:

1. **`/api/version`** (endpoint público implementado en commit `f16ac12`):
   ```bash
   curl -s https://ccb.contan2.com/api/version | tee "$EVIDENCE_DIR/deploy/version-endpoint.json"
   # Esperado: {"buildSha":"<EXPECTED_SHA>","ts":"..."}
   ```

2. **Label OCI del container**: `org.opencontainers.image.revision`
   inyectado al build:
   ```bash
   APP_CONTAINER=$(ssh "$VPS" "docker ps --format '{{.Names}}' | grep ^f3xck8spocf" | head -1)
   ssh "$VPS" "docker inspect $APP_CONTAINER --format '{{ index .Config.Labels \"org.opencontainers.image.revision\" }}'" \
     | tee "$EVIDENCE_DIR/deploy/container-revision-label.txt"
   ```

Verificación dura:

```bash
ENDPOINT_SHA=$(jq -r .buildSha "$EVIDENCE_DIR/deploy/version-endpoint.json")
LABEL_SHA=$(cat "$EVIDENCE_DIR/deploy/container-revision-label.txt" | tr -d '[:space:]')

[ "$ENDPOINT_SHA" = "$EXPECTED_SHA" ] || { echo "endpoint sha mismatch"; exit 1; }
[ "$LABEL_SHA"    = "$EXPECTED_SHA" ] || { echo "label sha mismatch";    exit 1; }
```

Si **cualquiera** de los dos devuelve `unknown`, vacío, o un SHA distinto,
abortar **antes** de probar el smoke de seguridad B o tocar el
volumen/DB. Un container con SHA divergente no es certificable como el
hardening verificado en CI.

(Opcional, evidencia adicional, no bloqueante): el deployment record en
la Coolify API:
```bash
curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "$COOLIFY_BASE_URL/api/v1/applications/f3xck8spocf0o377y9w0vq6n/deployments?limit=1" \
  | tee "$EVIDENCE_DIR/deploy/coolify-deployments.json"
```

El endpoint y el label fueron añadidos en commits `f16ac12` y `780c0e7`
(rename a `SOURCE_COMMIT`). Cualquier deployment anterior reporta
`unknown` y NO pasa A.5.

Durante este lapso el volumen sigue como en el preflight; los 4 SVG
históricos siguen siendo servidos pero ya fueron clasificados como
benignos en 6.A. La degradación visual sigue ausente porque el código
viejo aún corre hasta que el container nuevo toma el tráfico.

##### AUTH-SMOKE SESSION · Sesión owner para B.2/B.3/D/G (autorización SEPARADA)

Antes de ejecutar B.2 (svg+xml autorizado → 400), B.3 (bytes SVG
declarados png autorizado → 400), D (`PATCH /api/org/branding`), y la
parte autenticada de G, se necesita una sesión owner del tenant. Crearla
**NO es read-only**: el login:

- Inserta una fila en `staff_auth_sessions` (token hash + expires_at + ua + ip).
- Inserta una entrada `auth.login` en `tenant_audit_log` con el actor y la IP enmascarada.
- Puede disparar notificación de "nueva IP" si el detector de IPs nuevas
  está activo (depende de la config del tenant; revisar en
  `Application Settings → Notifications` de Coolify si aplica).

Procedimiento (autorización separada, **una sola** sesión reutilizable
para B.2, B.3, D, y G autenticada):

```bash
# Crear el jar local efímero ANTES del login para que cookies y permisos
# sean estrictos desde el principio.
COOKIE_JAR="$EVIDENCE_DIR/cookies-owner.txt"
( umask 077 && : > "$COOKIE_JAR" )   # 0600

# Login owner del CCB. La sesión queda viva hasta logout o expiración (12h
# por default si rememberMe=false).
curl -s -c "$COOKIE_JAR" \
     -X POST -H 'Content-Type: application/json' \
     --data "{\"email\":\"$CCB_OWNER_EMAIL\",\"password\":\"$CCB_OWNER_PASSWORD\",\"rememberMe\":false}" \
     https://ccb.contan2.com/api/auth/login \
     | tee "$EVIDENCE_DIR/auth-smoke/login.json"
# Esperado: 200, body.ok=true, body.staff.email = $CCB_OWNER_EMAIL.

# Confirmar la sesión está viva y atribuida al tenant correcto.
curl -s -b "$COOKIE_JAR" \
     https://ccb.contan2.com/api/auth/me \
     | tee "$EVIDENCE_DIR/auth-smoke/me.json"
# Esperado: 200, body.staff.role='owner', body.staff.organizationId=<CCB UUID>.

# Confirmar que el audit log registró el auth.login.
curl -s -b "$COOKIE_JAR" \
     'https://ccb.contan2.com/api/audit-log?action=auth.login&limit=3' \
     | tee "$EVIDENCE_DIR/auth-smoke/audit-login.json"
# Esperado: al menos una entry reciente con action='auth.login' y el
# email enmascarado del owner.
```

Esta cookie se reutiliza en B.2, B.3, D, y G-auth. **No se hace login
de nuevo dentro de la ventana** para no crear sesiones residuales.

###### Cleanup post-ventana (después de G o tras abortar)

```bash
# Revocar la sesión en el server (deja audit auth.logout).
curl -s -b "$COOKIE_JAR" -X POST \
     https://ccb.contan2.com/api/auth/logout \
     | tee "$EVIDENCE_DIR/auth-smoke/logout.json"

# Borrar el jar local. La cookie es un secreto operacional efímero.
rm -f "$COOKIE_JAR"
ls -la "$EVIDENCE_DIR/cookies-owner.txt" 2>&1 || echo "✓ cookie jar removido"
```

El logout es obligatorio aún si la ventana abortó — una sesión owner
viva con cookie en disco es riesgo operacional. El revoke server-side
elimina la fila de `staff_auth_sessions`; la cookie local se borra para
que no quede en `$EVIDENCE_DIR` archivable.

##### B · Smoke de seguridad inmediato post-deploy

Antes de cualquier escritura intencional al volumen o a la DB, verificar
que el hardening está vivo y bloquea los vectores principales. El smoke
se parte en dos bloques porque **B.3 NO es read-only**. B.2 y B.3
**requieren la cookie de AUTH-SMOKE SESSION**.

###### B-anon-read-only (B.1, B.4) — sin auth, sin tocar volumen ni DB

| # | Test | Esperado |
|---|---|---|
| B.1 | `POST /api/uploads/image` **anónimo** (sin cookie) | `401`. La request muere en `requireStaffSession` antes de llegar a multer; el fileFilter no se ejecuta, no se abre archivo en el volumen. |
| B.4 | `GET /uploads/<cualquier-existente>` | header `X-Content-Type-Options: nosniff` presente |

Estos dos son verdaderamente read-only y no requieren cookie. La
autorización de B-anon-read-only es implícita en la autorización del
post-deploy smoke (un solo bloque).

###### B-auth-read-only (B.2) — usa cookie de AUTH-SMOKE SESSION

| # | Test | Esperado |
|---|---|---|
| B.2 | `POST /api/uploads/image` con cookie de owner del jar + archivo declarado `image/svg+xml` | `400`. El `fileFilter` de multer rechaza por mimetype **antes** de cualquier escritura a disco. |

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -b "$COOKIE_JAR" \
  -X POST -F 'image=@/tmp/innocent.svg;type=image/svg+xml' \
  https://ccb.contan2.com/api/uploads/image
# Esperado: 400
```

B.2 NO escribe al volumen (fileFilter rechaza pre-write), pero SÍ
consume la sesión owner — está cubierto por la autorización de
AUTH-SMOKE SESSION, no requiere autorización adicional.

###### B-destructive (B.3) — prueba con escritura temporal · AUTORIZACIÓN SEPARADA

| # | Test | Esperado |
|---|---|---|
| B.3 | `POST /api/uploads/image` con cookie del jar + bytes SVG declarados `image/png` | `400`. Sharp detecta `format='svg'` en metadata, no está en el whitelist `{png,jpeg,jpg,webp}`, el archivo recién escrito por multer se borra (`deleteSilently`) y el handler responde `HttpError(400)`. |

Por qué NO es read-only: el `fileFilter` mira solo el `Content-Type`
declarado por el cliente. Como el cliente miente con `image/png`,
multer **escribe el archivo al volumen** con un nombre tipo
`<Date.now()>-<randomBytes(6).toString('hex')>.png`. La detección real
del SVG ocurre en `optimizeImage` cuando sharp lee los bytes; ahí se
borra el archivo. Pero entre el momento del write y el delete hay un
estado intermedio en el FS — operacionalmente es una prueba destructiva
controlada.

Procedimiento de B.3 con autorización separada (reusa el `$COOKIE_JAR`
ya creado en AUTH-SMOKE SESSION):

```bash
# B.3.pre — snapshot del listado de /data/contan2/uploads antes del test
ssh "$VPS" "ls /data/contan2/uploads | sort" > "$EVIDENCE_DIR/smoke/uploads-before-B3.txt"

# B.3 — ejecutar el POST con bytes SVG + content-type image/png
curl -s -o /dev/null -w '%{http_code}\n' \
  -b "$COOKIE_JAR" \
  -X POST -F 'image=@/tmp/svg-disguised.png;type=image/png' \
  https://ccb.contan2.com/api/uploads/image \
  | tee "$EVIDENCE_DIR/smoke/B3-http-status.txt"
# Esperado: 400

# B.3.post — confirmar que el listado del volumen está IDÉNTICO al pre
ssh "$VPS" "ls /data/contan2/uploads | sort" > "$EVIDENCE_DIR/smoke/uploads-after-B3.txt"
diff "$EVIDENCE_DIR/smoke/uploads-before-B3.txt" \
     "$EVIDENCE_DIR/smoke/uploads-after-B3.txt"
# Esperado: salida vacía. Si difiere, abortar y reportar — significa
# que el archivo intermedio NO fue limpiado.
```

Si `diff` no es vacío → abortar: el handler no limpió el archivo
temporal y el volumen tiene un asset huérfano que NO existía pre-deploy.

Alternativa preferida cuando hay staging: ejecutar B.3 únicamente contra
staging (mismo binario), y en producción aceptar B.1, B.2, B.4 más una
verificación read-only del fileFilter vía test de integración en CI
(que ya existe: `test/security/uploads-svg.test.js` cubre el camino con
DB Postgres real).

###### Resultado conjunto

Si **CUALQUIER** test (B.1, B.2, B.3, B.4) falla → abortar antes de C.
**No retroceder el deploy** — el hardening sigue siendo necesario aunque
el smoke marque un fallo parcial (ver Rollback). Investigar la
divergencia entre lo testeado en CI y lo observado en producción;
preparar fix; re-mergear; re-pushear; re-deployar; reintentar.

Solo cuando los 4 tests pasen verde y el `diff` de B.3 sea vacío,
autorizar C.

##### C · Copiar los PNG offline al volumen productivo

Solo si A + B pasaron. Los PNG ya verificados localmente se copian al
volumen con los nombres productivos fijados en pre-window setup:

```bash
scp -i ~/.ssh/contabo_key \
  "$EVIDENCE_DIR/review-6A/raster/$NEW_PRIMARY" \
  "$VPS:$VOLUME_PATH/$NEW_PRIMARY"

scp -i ~/.ssh/contabo_key \
  "$EVIDENCE_DIR/review-6A/raster/$NEW_EMAIL" \
  "$VPS:$VOLUME_PATH/$NEW_EMAIL"

ssh "$VPS" "stat -c '%a %U:%G %s %n' $VOLUME_PATH/$NEW_PRIMARY $VOLUME_PATH/$NEW_EMAIL" \
  | tee "$EVIDENCE_DIR/review-6A/raster/server-stat.txt"
```

Verificar:
- Permisos `644 root:root` consistentes con el resto del volumen.
- `sha256sum` remoto de cada PNG matchea el archivado en pre-window.
- `GET /uploads/<NEW_PRIMARY>` desde el dominio público → 200 PNG con
  nosniff (el hardening ya está activo).

Si algún check falla → abortar antes de D. Los PNG copiados se pueden
borrar del volumen si la verificación remota falla, sin tocar DB.

##### D · Actualizar branding vía `PATCH /api/org/branding` (ruta canónica)

Con el hardening desplegado, los handlers de branding ya están
disponibles. Esta es la ruta canónica para actualizar `logoUrl` y
`emailLogoUrl` porque:

- Es la única que invalida `resolveTenant` cache para el tenant y su
  custom domain (vía `invalidateTenantCache(slug)` + `invalidateTenantCache(customDomain)`).
- Desde commit `b191773` (`feat(security): branding · recordAudit en
  PATCH /api/org/branding + tests`), el handler también escribe a
  `tenant_audit_log` con `action='branding.updated'`, `targetId`,
  `targetLabel`, y `metadata.diff` con el `from`/`to` de cada campo
  cambiado. La pista de auditoría queda completa sin SQL externo.

NO usar UPDATE SQL directo como ruta normal. Un UPDATE crudo NO invalida
cache y NO deja entrada en `tenant_audit_log` — eran las dos razones
para evitarlo en versiones anteriores del runbook.

Mecánica (reusa el `$COOKIE_JAR` de AUTH-SMOKE SESSION; no se hace login
de nuevo):

```bash
# D.1 · PATCH logoUrl + emailLogoUrl en UNA sola llamada (atomicidad).
# Desde commit 9c15010 el handler envuelve UPDATE + INSERT audit en una
# transacción única (BEGIN/COMMIT/ROLLBACK). Si el audit falla, el
# UPDATE se revierte y la respuesta es 5xx — la DB nunca queda con
# branding nuevo y audit faltante.
HTTP_STATUS=$(curl -s -o "$EVIDENCE_DIR/review-6A/patch-branding.json" \
  -w '%{http_code}' \
  -b "$COOKIE_JAR" \
  -X PATCH -H 'Content-Type: application/json' \
  --data "{
    \"logoUrl\":      \"/uploads/$NEW_PRIMARY\",
    \"emailLogoUrl\": \"/uploads/$NEW_EMAIL\"
  }" \
  https://ccb.contan2.com/api/org/branding)
echo "PATCH branding HTTP: $HTTP_STATUS" | tee -a "$EVIDENCE_DIR/review-6A/patch-branding.status"
# Esperado: 200, body.ok=true, body.organization.logoUrl === '/uploads/<NEW_PRIMARY>',
#                              body.organization.emailLogoUrl === '/uploads/<NEW_EMAIL>'.

# D.2 · Confirmar entrada en audit log (debe existir ya, no podemos
# llegar a este punto con un 200 y sin audit gracias a la transacción).
curl -s -b "$COOKIE_JAR" \
  'https://ccb.contan2.com/api/audit-log?action=branding.updated&limit=5' \
  | tee "$EVIDENCE_DIR/review-6A/audit-log-branding-updated.json"
# Esperado: 1 entry con targetType='organization', targetLabel='ccb',
# metadata.fields incluye 'logoUrl' + 'emailLogoUrl', metadata.diff.logoUrl.to
# matchea '/uploads/<NEW_PRIMARY>'.
```

Evidencia archivada (la cookie sigue viva hasta el cleanup post-G):
- `patch-branding.json` y `patch-branding.status` (response del PATCH).
- `audit-log-branding-updated.json` (confirmación de auditoría).
- El jar `$COOKIE_JAR` se borra en el cleanup de AUTH-SMOKE SESSION
  después de G o tras abortar.

Si el PATCH devuelve status ≠ 200, abortar antes de E. NO continuar
con cuarentena mientras la DB no haya quedado actualizada (la
transacción garantiza "todo o nada", pero un 5xx significa que el
estado final NO es el deseado).

##### E · Cuarentena de los 4 SVG conocidos

Con las referencias DB ya apuntando a los PNG nuevos, los SVG están
desreferenciados. Moverlos al directorio de cuarentena (NO borrar):

```bash
ssh "$VPS" "sudo mkdir -p /data/svg-quarantine/${RUN_ID}"
for f in <los 4 basenames>; do
  ssh "$VPS" "sudo mv $VOLUME_PATH/$f /data/svg-quarantine/${RUN_ID}/$f"
done
ssh "$VPS" "ls -la /data/svg-quarantine/${RUN_ID}/" \
  | tee "$EVIDENCE_DIR/review-6A/quarantine.ls.txt"
```

Mover **los 4** (los 2 referenciados ya redirigidos + los 2 huérfanos)
en este paso, no antes. Los huérfanos pueden moverse aquí mismo porque
no requieren UPDATE asociado.

##### F · Re-auditar el volumen

Re-correr Pasos 1–5 del runbook. Esperado:

- `scannedFiles` = (count anterior − 4 SVG cuarentenados + 2 PNG nuevos).
  Para CCB: 19 − 4 + 2 = **17**.
- `svgCandidates` = `0`.
- `entries[]` vacío.
- Exit `0`.

Si exit ≠ 0 → detenerse y reportar. **NO restaurar SVG desde
cuarentena.** La presencia de un SVG inesperado en este punto indica
una segunda mano sobre el volumen entre B y E y requiere investigación.

##### G · Smoke funcional final (mezcla de públicos + autenticados)

G se parte en dos sub-bloques porque la cobertura completa requiere
endpoints públicos (no auth) **y** verificaciones autenticadas que
reusen el `$COOKIE_JAR` ya creado.

###### G-public (read-only sin sesión, sin efectos)

| # | Test | Qué verifica | Esperado |
|---|---|---|---|
| G.4 | `GET /api/credentials/<code>.png` (público) | El PNG de credencial usa `services/credential.js → loadOrgLogoDataUri()`, que lee `organization.logoUrl` (**PRIMARY**, no `emailLogoUrl`). Verifica que el logo PRIMARY se incrusta correctamente. **NO verifica el logo EMAIL**. | Imagen ≥ 1 KiB, content-type `image/png`, logo PRIMARY embebido (inspección visual offline) |
| G.5 | `GET /uploads/<NEW_PRIMARY>` y `<NEW_EMAIL>` | El path estático sirve ambos PNG con headers correctos | 200 + PNG + `X-Content-Type-Options: nosniff` |
| G.6 | `GET /uploads/<OLD_BASENAME>.svg` (los 4 cuarentenados) | La cuarentena fue efectiva | 404 |

G-public NO requiere autorización adicional — son GETs públicos sin
auth ni efectos.

###### G-auth (reusa `$COOKIE_JAR` de AUTH-SMOKE SESSION)

Estos tests usan la **misma cookie** que B.2/B.3/D, ya creada en
AUTH-SMOKE SESSION. Eso significa:

- **No requieren login adicional** (no se crean sesiones extra).
- Sí están autenticados: cada GET deja `last_seen` actualizado en la
  fila de `staff_auth_sessions`, pero NO crea fila nueva ni audit
  entry adicional.
- Quedan implícitamente autorizados por AUTH-SMOKE SESSION; no es una
  nueva autorización separada.

| # | Test | Qué verifica | Esperado |
|---|---|---|---|
| G.1 | `GET /api/auth/me` + `GET /api/org/branding` con `$COOKIE_JAR` | Sesión sigue válida; el endpoint refleja el nuevo `logoUrl`/`emailLogoUrl` después de D | 200 en ambos; `logoUrl === '/uploads/<NEW_PRIMARY>'`, `emailLogoUrl === '/uploads/<NEW_EMAIL>'`. La sesión owner sigue viva. |
| G.2 | (Opcional) Carga browser real de `/kiosko/<tenant>` y `/scanner/<tenant>` con sesión browser independiente | Logo PRIMARY renderea en superficies públicas servidas por SSR | Sin broken image. **Atención**: abrir un browser logueado del tenant CREA otra sesión y otra entry `auth.login` en audit. Clasificarse como "autenticación browser adicional" si se ejecuta; no es read-only. |
| G.3 | (Opcional) Browser real: Generar preview del reporte PDF | `logoUrl` (PRIMARY) aparece en header del PDF | Logo PRIMARY presente |

G.1 es la verificación canónica via `$COOKIE_JAR` (sin sesiones nuevas).
G.2 y G.3 son opcionales y, si se ejecutan, requieren login adicional
del browser — clasificados como "browser-auth con efectos" en el
checklist final, no parte del smoke automatizable.

Cobertura faltante en G: **el logo EMAIL** (asset B) NO se verifica
end-to-end en G-public ni G-auth porque ningún flujo lo materializa
sin enviar email. La única superficie es `sendCredentialEmail()` vía
`loadEmailLogoDataUri()`. Para verificarlo en vivo → `G-email` abajo,
con autorización **explícita y separada**.

Si todos los G-public + G.1 pasan → autorizar `G-email` si se desea
cobertura end-to-end de EMAIL, o cerrar la ventana con la cobertura
parcial.

Inmediatamente después: ejecutar el **cleanup de AUTH-SMOKE SESSION**
(logout + `rm -f $COOKIE_JAR`). Archivar evidencia:
- `audit.json` post-cuarentena con exit 0.
- Response del PATCH branding + audit-log mostrando `branding.updated`.
- Captura de `quarantine.ls.txt`.
- Login/me responses del bloque AUTH-SMOKE SESSION (sin la cookie).
- Logout response.

##### G-email · Validación end-to-end del logo EMAIL (autorización SEPARADA)

**Único camino para verificar el logo EMAIL en vivo.** G.4 verifica
PRIMARY a través del PNG de credencial; el logo EMAIL solo se materializa
en el HTML del email construido por `sendCredentialEmail()`, que llama a
`loadEmailLogoDataUri(organization)` y prefiere `emailLogoUrl` sobre
`logoUrl`.

Este paso **NO es read-only** (consume cuota de Resend, deja log de
envío externo, llega a un buzón real) y queda fuera del smoke
automático.

| # | Test | Esperado |
|---|---|---|
| GE.1 | `POST /api/credentials/<code-test>/send` autenticado como owner del CCB hacia un visitante seed cuyo `email = mfranciscomartinez@gmail.com` | 200 + entry `credential.sent` en `tenant_audit_log` + email recibido con logo EMAIL (asset B, color) renderizado en el header del HTML |

Inspección manual del email recibido:
- Header del email: debe mostrar el **logo EMAIL** (variante color azul
  + gris, ASSET B), NO el PRIMARY (blanco invisible sobre fondo claro).
- El adjunto `credencial-<code>.png` muestra el logo PRIMARY (consistente
  con G.4).
- Subject: `Tu credencial · <code>`.

Pre-condiciones:
- Existe un usuario seed/visitante de prueba en el CCB cuyo `email` es
  `mfranciscomartinez@gmail.com`, para no spammear a un usuario real del
  tenant.
- La política de email del proyecto sigue siendo "solo
  mfranciscomartinez@gmail.com como destino de pruebas".

Autorización requerida: **separada de G.1–G.6**. Se ejecuta solo si los
smokes read-only pasaron Y el operador autoriza explícitamente el envío
real.

Si GE.1 falla por problema visual (logo email no aparece, layout roto)
o por upstream Resend, **no se revierte nada**: G.5 ya verificó que el
asset EMAIL es servible desde `/uploads/<NEW_EMAIL>`, y el rollback se
restringe a investigar el problema del cliente de email sin tocar
branding/cuarentena.

Alternativa sin envío real (preview offline): no implementada en esta
rama. Para incorporarla habría que exponer un endpoint
`GET /api/admin/email-preview?type=credential` que renderiza el HTML
con los tokens del tenant sin tocar Resend. Queda como mejora futura
documentada; mientras tanto, GE.1 es la única verificación
end-to-end del logo EMAIL y requiere autorización explícita.

##### Rollback (orden corregido)

La pregunta clave es **si el container hardenizado quedó activo**.
Mientras ese container no haya pasado el healthcheck, todo es reversible
sin tocar volumen/DB. Una vez activo, el hardening queda y se diagnostica
hacia adelante.

| Falla en | ¿Hardening activo? | Volumen / DB | Acción |
|---|---|---|---|
| Preflight read-only | n/a | intactos | Detener, reportar lo que cambió desde 6.A, reabrir 6.A para reanálisis. No tocar nada. |
| A.1–A.4 (merge, push, trigger) | NO | intactos | `git push origin multitenant` no se revierte (es solo metadata). Si el trigger Coolify no llegó a publicar imagen, no hay container nuevo; el código viejo sigue sirviendo. Replanear deploy. |
| A.5 (verificación de SHA desplegado) | NO certificable | intactos | Container con SHA incorrecto o no verificable → **NO probar B, NO tocar C–G**. Rollback Coolify al deployment anterior conocido. Investigar por qué el SHA no coincide con `$EXPECTED_SHA` (build cache, branch incorrecto, race en push). Replanear. |
| B (smoke de seguridad) — el container hardenizado **ya tomó tráfico** | **SÍ** | intactos | **MANTENER el hardening en producción.** No revertir Coolify a `multitenant` vulnerable — un fallo parcial del smoke (ej. `nosniff` ausente por proxy intermedio) no justifica reabrir el vector de uploads SVG. Detener C–G, diagnosticar la divergencia entre CI y prod, preparar fix, re-mergear, re-pushear, re-deployar. Reintentar B contra el deploy corregido. |
| C (scp PNG) o D (PATCH branding) | SÍ | escritura parcial: PNG puede estar en volumen sin referencia DB, o referencia parcialmente actualizada | **Mantener el hardening.** No restaurar SVG. No revertir el PATCH parcial (si solo se actualizó `logoUrl` y no `emailLogoUrl`, el `emailLogoUrl` viejo apunta al SVG histórico — sigue siendo benigno según 6.A). Detener y completar manualmente con autorización separada. |
| E (cuarentena) o F (re-audit) | SÍ | branding actualizada, cuarentena parcial o re-audit divergente | **Mantener todo lo avanzado.** No restaurar SVG. El hardening bloquea uploads SVG nuevos, así que la ventana XSS queda cerrada incluso si la limpieza del volumen queda incompleta. Reportar y completar manualmente con autorización separada. |
| G (smoke funcional read-only) | SÍ | todo escrito | Si G.1–G.6 muestran un problema visual (logo roto en sidebar, broken image), recoger evidencia y abrir autorización separada para investigar/revertir branding (solo el `PATCH` se puede revertir, NO restaurar el SVG). Si todo bien, ventana cerrada. |
| G-email (envío real) | SÍ | todo escrito | Falla aquí solo afecta cliente de email externo. Recoger evidencia, replanear envío, no revertir nada. |

Reglas duras del rollback (priorizadas):

1. **Si el hardening pasó B exitoso → nunca revertir a `multitenant` vulnerable.**
   Aun cuando una fase ulterior falle, revertir reabriría la ventana XSS
   en `/api/uploads/image`. Cualquier defecto se diagnostica y se cubre
   con un nuevo deploy hacia adelante.
2. **Nunca restaurar SVG al path público** (`/data/contan2/uploads/`).
   Aunque sean los benignos analizados en 6.A, la política organizacional
   es "SVG deshabilitado en uploads".
3. **Nunca revertir el PATCH de branding** si los PNG copiados se sirven
   OK. Los PNG son válidos bajo cualquier versión del código; un revert
   reapunta a un SVG que ya no debería existir.

Solo el deploy del código es reversible (vía Coolify rollback) **y solo
si A.5 no logró certificar el SHA o si B ni siquiera llegó a ejecutarse**.
Apenas el hardening esté activo y B pase, todo es avance permanente —
los problemas se resuelven con un nuevo deploy, no con un retroceso.

Resumen de autorizaciones requeridas en este runbook:

| Sub-paso | Tipo | ¿Autorización requerida? |
|---|---|---|
| 1–5 | Read-only (scp + ssh + node read-only) | Una vez (autoriza el inventario) |
| 7–8 | Cleanup del script en `/tmp` + archivo de evidencia local | Implícita en la autorización del inventario |
| 6.A | Read-only (scp cat + SELECT + análisis offline) | Una vez (autoriza la revisión de los candidatos) |
| 6.B | Modificación de producción (`mv`, `UPDATE`) | **Separada y explícita**, archivo por archivo o por lote |

### Paso 7 · Cleanup (solo del script temporal)

```bash
ssh "$VPS" "rm -f $REMOTE_SCRIPT"
```

**Solo se borra el script de `/tmp`.** Nunca se tocan `/data/uploads`,
`/data/svg-quarantine`, ni ningún path productivo. Si el cleanup falla
(VPS sin permisos al `/tmp` del usuario, lo que sería raro), no bloquea
el deploy — `/tmp` se purga eventualmente, y el script no expone ningún
secreto al estar en disco.

### Paso 8 · Archivar evidencia

```bash
ls -la "$EVIDENCE_DIR/"
# debe contener:
#   checksum.local.txt
#   checksum.remote.txt
#   audit.json
#   exit.code
```

Adjuntar el directorio al ticket de release. La evidencia incluye qué
archivos vivían en el volumen al momento del audit, sin tocar ninguno.

## Cuándo se puede retirar este runbook

Cuando una de estas dos condiciones se cumpla:

- (a) Se integre un sanitizer SVG robusto (DOMPurify+jsdom o un sanitizer
  SVG dedicado), se aplique retroactivamente al volumen completo (un solo
  pase) y el endpoint `/api/uploads/image` se re-habilite para
  `image/svg+xml` con esa sanitización.
- (b) Se decida que el sistema nunca aceptará SVG y se ejecute un pase único
  de conversión a PNG (o eliminación) para todos los SVG históricos, con
  audit log de cada cambio.

Mientras ninguna de las dos haya pasado, este runbook es parte del checklist
de deploy.

## Ambientes destino

| Ambiente | Path del volumen | Acceso |
|---|---|---|
| local (dev) | `backend/data/uploads/` | directo |
| docker-compose.test | volumen efímero del contenedor de tests | (no aplica — datos descartables) |
| producción Coolify | `persistent_storage/<container>/data/uploads` | SSH al VPS según los pasos arriba |

## Resultado del inventario en local (referencia para CI)

Última corrida en este checkout (ambiente local de desarrollo, no producción):

```
$ node backend/scripts/audit-historical-svg.mjs --json
{
  "dir": "/.../backend/data/uploads",
  "scannedFiles": 7,
  "svgCandidates": 0,
  "withRiskFlags": 0,
  "entries": []
}
$ echo $?
0
```

Y como prueba de detección, plantando un SVG malicioso con extensión `.png`
en un directorio temporal:

```
$ echo '<svg><script>alert(1)</script><foreignObject>...</foreignObject></svg>' > /tmp/fake/logo.png
$ node backend/scripts/audit-historical-svg.mjs --dir /tmp/fake
[audit-svg] candidatos SVG: 1
  /tmp/fake/logo.png  ext=.png  ...  [script_tag,javascript_uri,foreign_object,wrong_extension]
[audit-svg] ✗ BLOQUEAR DEPLOY
$ echo $?
20
```

Bypass cubierto: SVG malicioso con prólogo > 4 KiB ya no se cuela. Tests
correspondientes en `backend/test/security/audit-svg-script.test.js`:

- `.svg` con 5000 espacios antes de `<svg><script>` → `script_tag` + exit 20
- `.png` con `<!-- ` 4500 chars ` -->` antes de SVG → `script_tag` +
  `wrong_extension` + exit 20
- `.svg` vacío → `svg_extension_unverified` + exit 20 (jamás silencioso)

Bypass del cap de 16 MiB también cerrado — cualquier archivo > 16 MiB
entra al reporte con `truncated_audit` aunque ni siquiera tenga `<svg`
en el prefijo leído. Tests:

- `.png` > 16 MiB con SVG payload pasado el cap → exit 20 + `truncated_audit`
  (sin `wrong_extension` — no se confirmó SVG, solo "no pudimos auditar")
- archivo binario > 16 MiB sin `<svg` → exit 20 + `truncated_audit`
  (requiere revisión manual igual)
- `.svg` > 16 MiB → exit 20 + `truncated_audit` + `svg_extension_unverified`

Estado de producción: **no inspeccionado en este sprint**. Pendiente
ejecutar el procedimiento de los pasos 1-8 vía SSH con autorización
explícita del operador antes del merge/deploy.
