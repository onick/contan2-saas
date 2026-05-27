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

##### A · Merge + deploy del hardening (PRIMERO)

Razón del orden: una vez deploya el hardening, `/api/uploads/image`
deja de aceptar SVG (ni de anónimos ni de sesiones autorizadas). El
volumen no puede recibir SVG nuevos mientras hacemos la limpieza. Si
empezáramos por el volumen, dejaríamos una ventana donde un atacante
puede volver a contaminar lo recién limpiado y, si el deploy fallara,
la contaminación quedaría sin remediación.

```bash
git checkout multitenant
git merge --ff-only security/p0-hardening
# Trigger deploy en Coolify (manual o por webhook)
curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "$COOLIFY_BASE_URL/api/v1/deploy?uuid=f3xck8spocf0o377y9w0vq6n&force=false"
```

Esperar hasta:
- Container nuevo arriba según `docker ps`.
- Healthcheck del contenedor en `running (healthy)`.
- `GET /healthz` en el dominio público devuelve `{ ok: true }`.

Durante este lapso el volumen sigue como en el preflight; los 4 SVG
históricos siguen siendo servidos pero ya fueron clasificados como
benignos en 6.A. La degradación visual sigue ausente porque el código
viejo aún corre hasta que el container nuevo toma el tráfico.

##### B · Smoke de seguridad inmediato post-deploy (sin tocar volumen)

Antes de cualquier escritura al volumen o a la DB, verificar que el
hardening está vivo y bloquea los vectores principales:

| # | Test | Esperado |
|---|---|---|
| B.1 | `POST /api/uploads/image` **anónimo** (sin cookie) | `401` |
| B.2 | `POST /api/uploads/image` con sesión autorizada + archivo `image/svg+xml` | `400` (fileFilter rechaza) |
| B.3 | `POST /api/uploads/image` con sesión autorizada + bytes SVG declarados `image/png` | `400` (sharp format whitelist) |
| B.4 | `GET /uploads/<cualquier-existente>` | header `X-Content-Type-Options: nosniff` presente |

Si **CUALQUIER** smoke falla → abortar antes de C. **No retroceder el
deploy** — el hardening sigue siendo necesario aunque el smoke marque
un fallo parcial. Investigar la divergencia entre lo testeado en CI y
lo observado en producción; fixear; redeployar; reintentar el smoke.

Solo cuando los 4 tests pasen verde, autorizar C.

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

##### D · UPDATE SQL acotado + evidencia manual

Con los rasters servibles bajo `/uploads/<NEW_*>`, ejecutar UPDATE
escópeado por **`id` del tenant** (nunca por LIKE permisivo). Volcar el
SQL literal y el `RETURNING` a evidencia:

```sql
UPDATE organizations
   SET logo_url   = '/uploads/' || :new_primary,
       updated_at = NOW()
 WHERE id          = :tenant_id::uuid
   AND logo_url    LIKE '%' || :old_basename_primary
 RETURNING id, slug, logo_url, updated_at;
```

```sql
UPDATE organizations
   SET email_logo_url = '/uploads/' || :new_email,
       updated_at     = NOW()
 WHERE id              = :tenant_id::uuid
   AND email_logo_url  LIKE '%' || :old_basename_email
 RETURNING id, slug, email_logo_url, updated_at;
```

Cada `RETURNING` debe devolver exactamente **1 fila**. 0 filas → el
asset ya no estaba referenciado (abortar y reportar). >1 fila → query
no acotada (abortar). Las salidas se guardan en
`$EVIDENCE_DIR/review-6A/sql-update-{logo,email}.txt`.

Esta es la única auditoría disponible en este momento porque
`recordAudit()` requiere haber pasado por el endpoint, cosa que no se
hace en este paso.

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

##### G · Smoke funcional final

| # | Test | Esperado |
|---|---|---|
| G.1 | Login admin del tenant + ver sidebar | Logo PRIMARY renderiza, sin broken image |
| G.2 | Cargar `/kiosko` y `/scanner` del tenant | Sin errores de carga del logo |
| G.3 | Generar reporte PDF de actividad | Logo PRIMARY aparece en el header del PDF |
| G.4 | Enviar email de prueba (resend a `mfranciscomartinez@gmail.com`) | Logo EMAIL aparece en el header del email |
| G.5 | `GET /uploads/<NEW_PRIMARY>` desde fuera del tenant | 200 + PNG + nosniff |
| G.6 | `GET /uploads/<OLD_BASENAME>.svg` | 404 (cuarentena efectiva) |

Si todos pasan → ventana cerrada con éxito. Archivar evidencia (incluye
`audit.json` post-cuarentena con exit 0, los `RETURNING` de los UPDATEs,
y la captura de `quarantine.ls.txt`).

##### Rollback (orden corregido)

Tres escenarios según en qué fase falle:

| Falla en | Estado de prod | Acción |
|---|---|---|
| Preflight, A (deploy) o B (smoke seguridad) | Volumen y DB **intactos** (todo era read-only o reverse-able vía Coolify rollback) | Coolify rollback al deployment anterior. Producción vuelve a `multitenant` original. Reportar y replanear. |
| C (scp PNG) o D (UPDATE) | Hardening **desplegado** (no se revierte). PNG pueden estar en volumen sin reference, o reference parcialmente actualizada | **Mantener el hardening en producción.** No restaurar SVG ni revertir UPDATE parcial. Detener y reportar. La remediación se completa manualmente con autorización separada. |
| E (cuarentena) o F (re-audit) | Hardening desplegado. PNG copiados. DB actualizada. Cuarentena parcial o re-audit divergente | **Mantener todo lo avanzado.** No restaurar SVG. El hardening bloquea uploads SVG nuevos, así que la ventana está cerrada incluso si la limpieza queda incompleta. Reportar y completar manualmente con autorización separada. |

Reglas duras del rollback:
- **Nunca restaurar SVG al path público** (`/data/contan2/uploads/`).
  Aunque sean los SVG benignos analizados en 6.A, la política
  organizacional es "SVG deshabilitado en uploads".
- **Nunca revertir el deploy del hardening** una vez que B pasó. El
  hardening es seguridad necesaria; revertirlo reabre la ventana.
- **Nunca revertir el UPDATE SQL** si los PNG copiados se sirven OK.
  Los PNG son válidos bajo cualquier versión del código.

Solo el deploy del código es reversible (vía Coolify rollback) y solo
si nada en C–F llegó a ejecutarse. Una vez que la ventana cruza C, todo
es avance permanente.

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
