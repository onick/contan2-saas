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

#### Paso 6.B · Remediación con escritura (REQUIERE AUTORIZACIÓN EXPLÍCITA)

Solo después de que el operador apruebe el plan de 6.A:

B1. **Asset legítimo referenciado → conversión a PNG/WebP off-prod.**
    Tomar la copia local del archivo, rasterizar con `sharp` desde un
    script local (no en prod), subir el PNG resultante vía
    `POST /api/uploads/image` autenticado, y luego `UPDATE` la fila para
    apuntar al nuevo URL:
    ```sql
    UPDATE organizations SET logo_url = '/uploads/<nuevo>.png' WHERE id = ...;
    -- equivalentes para email_logo_url y activities.image_url
    ```
    Cada UPDATE queda registrado en `tenant_audit_log` por el mismo flujo
    del endpoint que lo dispara. Reanudar inmediatamente con B3.

B2. **Sin remediación viable o sospechoso → cuarentena.**
    Mover el SVG fuera del path estático (NO borrar — preservar para
    forensia), vaciar las referencias en DB si las hay:
    ```bash
    ssh "$VPS" "sudo mkdir -p /data/svg-quarantine/${RUN_ID} && \
                sudo mv $VOLUME_PATH/<basename> /data/svg-quarantine/${RUN_ID}/<basename>"
    ```
    ```sql
    UPDATE organizations SET logo_url = NULL WHERE id = ... AND logo_url LIKE '%<basename>';
    ```
    A partir de ese momento `/uploads/<basename>` devuelve 404 y los
    consumidores ven el placeholder por defecto.

B3. **Re-correr el inventario.** Repetir Pasos 1–5 contra el volumen ya
    procesado. El resultado debe ser exit `0` (entries vacío) antes de
    autorizar el merge/deploy. Si aún hay candidatos, volver a 6.A para
    los restantes.

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
