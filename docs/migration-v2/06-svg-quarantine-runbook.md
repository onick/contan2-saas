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
| `10` | Candidatos SVG presentes pero `entries[].flags` vacío en todos | Revisión humana caso por caso (Paso 6). |
| `20` | Al menos una entrada con algún flag (ver tabla abajo) | **Bloquear deploy** y aplicar cuarentena (Paso 6). |
| `1`  | Directorio no existe / no es directorio / sin permisos / I/O / cualquier ambigüedad | **Bloquear deploy**. NO se asume "clean" — investigar path, permisos, y reintentar. |

Exit `1` y exit `20` son indistinguibles para efectos de "puedo deployar":
ambos bloquean.

Flags reportados en `entries[].flags` (cualquiera dispara exit 20):

| Flag | Significado |
|---|---|
| `script_tag` | `<script ...` literal en el archivo |
| `event_handler` | atributo `onload=`, `onclick=`, etc. |
| `javascript_uri` | `javascript:` literal o entidad codificada (`&#x6A;avascript`) |
| `foreign_object` | `<foreignObject>` (vector típico de HTML embebido) |
| `expression_css` | `expression(` o `url(javascript:)` en atributo `style` |
| `wrong_extension` | SVG por contenido cuya extensión NO es `.svg` (renombre malicioso) |
| `svg_extension_unverified` | archivo `.svg` sin `<svg\b` detectable — empty, binario disfrazado o estructura inválida; **siempre requiere revisión humana** |
| `truncated_audit` | archivo > 16 MiB; el auditor leyó solo el prefijo. Revisar manualmente con `less <file>` |
| `read_error` | no se pudo abrir/leer (permisos, FS corrupto). Investigar antes de seguir |

### Paso 6 · Cuarentena humana (solo si exit 10/20)

Por cada archivo flaggeado en `audit.json`:

a. Mover fuera del path estático (NO borrar — preservar para forensia):
   ```bash
   ssh "$VPS" "sudo mkdir -p /data/svg-quarantine/${RUN_ID} && \
               sudo mv $VOLUME_PATH/<archivo> /data/svg-quarantine/${RUN_ID}/<archivo>"
   ```

b. Identificar dueños de la URL en DB (solo SELECT, jamás UPDATE sin
   confirmación del operador):
   ```sql
   SELECT id, slug, logo_url, email_logo_url
     FROM organizations
    WHERE logo_url LIKE '%<archivo>' OR email_logo_url LIKE '%<archivo>';
   SELECT id, name, image_url
     FROM activities
    WHERE image_url LIKE '%<archivo>';
   ```

c. Confirmar con el operador si la imagen era legítima (entonces re-subir
   versión sanitizada) o desconocida (vaciar el campo). Cualquier UPDATE va
   solo después de explícita autorización; queda registrado.

d. Re-correr Paso 4 contra el volumen ya cuarentenado. El resultado debe
   ser exit `0` antes de autorizar deploy.

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

Estado de producción: **no inspeccionado en este sprint**. Pendiente
ejecutar el procedimiento de los pasos 1-8 vía SSH con autorización
explícita del operador antes del merge/deploy.
