# 06 · Runbook · cuarentena de SVG históricos

> Procedimiento operacional **obligatorio antes de cada deploy** mientras la
> política sea "uploads nuevos rechazan SVG, pero el path estático sigue
> sirviendo los SVG ya escritos en `backend/data/uploads`".
>
> Este runbook se debe ejecutar en el ambiente target — typicamente prod —
> sin acceso destructivo. El operador humano decide la cuarentena; el script
> solo *inventaría*.

## Por qué existe este runbook

El hardening commit `497f3c1` (security/p0-hardening) removió `image/svg+xml`
del fileFilter de multer, así que **uploads nuevos** quedan bloqueados. Pero
`backend/server.js` sigue exponiendo `/uploads/*` como contenido estático:
cualquier SVG que se haya subido **antes** del hardening sigue siendo servido
con su contenido tal cual.

Esto deja una ventana residual de XSS si en el pasado se subió un SVG con
`<script>`, `onload=`, `javascript:` o `<foreignObject>`. La regex de
`sanitizeSvg` que tenemos no se aplicó retroactivamente al volumen.

## Antes de cada deploy a producción

Pre-requisito: tener acceso SSH de solo lectura al volumen `/data/uploads`
del contenedor en Coolify (ver `reference_production_infra.md`).

1. **Inventariar.** En la máquina target, dentro del contenedor o con un
   bind-mount al volumen de uploads:
   ```bash
   cd /app/backend
   node scripts/audit-historical-svg.mjs --json > /tmp/svg-audit.json
   echo "exit: $?"
   ```
   - Exit `0` → sin SVG en el volumen. **Continuar deploy normal**.
   - Exit `10` → SVG presentes pero sin flags automáticos de riesgo. Revisar
     la lista (`cat /tmp/svg-audit.json`) y decidir caso por caso (paso 2).
   - Exit `20` → SVG con flags de riesgo (`script_tag`, `event_handler`,
     `javascript_uri`, `foreign_object`, `expression_css`). **Bloquear deploy
     y aplicar paso 2**.
   - Exit `1` → error de I/O. Investigar y reintentar.

2. **Cuarentena humana del SVG sospechoso.** Para cada archivo flaggeado:

   a. Copiar el archivo a un directorio *fuera* del path estático servido
      por Express, conservando el path original como nota:
      ```bash
      mkdir -p /data/svg-quarantine
      mv /data/uploads/<archivo>.svg /data/svg-quarantine/<archivo>.svg
      ```
      A partir de ese momento la URL pública `/uploads/<archivo>.svg`
      devuelve 404 — los consumidores (tenant settings, branding) deben
      apuntarse a una versión rasterizada (paso b) o a un placeholder.

   b. Identificar qué fila de qué tabla referencia ese URL:
      ```sql
      -- En psql contra la DB de prod (solo SELECT, no UPDATE sin revisión):
      SELECT id, slug, logo_url, email_logo_url
        FROM organizations
       WHERE logo_url LIKE '%<archivo>.svg' OR email_logo_url LIKE '%<archivo>.svg';
      SELECT id, name, image_url
        FROM activities
       WHERE image_url LIKE '%<archivo>.svg';
      ```

   c. Si la organización dueña confirma la imagen es legítima, generar una
      versión PNG sanitizada localmente (con `sharp` desde un script
      auxiliar — no implementado en este sprint, se queda como TODO) y
      reemplazar la URL en la fila correspondiente con `UPDATE ... SET
      logo_url = '/uploads/<nuevo>.png'`. Si la organización confirma que
      es desconocida o se subió por error, vaciar el campo (`SET logo_url
      = NULL`) y notificar.

3. **Re-inventariar después de cuarentena.** Repetir paso 1; el resultado
   debe ser exit `0` para autorizar el deploy.

4. **Guardar el reporte JSON** del paso 1 en el log del incidente — sirve
   como evidencia de que se hizo la verificación antes del deploy.

## Cuándo se puede retirar este runbook

Cuando una de estas dos condiciones se cumpla:

- (a) Se integre un sanitizer SVG robusto (DOMPurify+jsdom o un sanitizer
  SVG dedicado), se aplique retroactivamente al volumen completo (un solo
  pase) y el endpoint `/api/uploads/image` se re-habilite para `image/svg+xml`
  con esa sanitización en el `optimizeImage` step.
- (b) Se decida que el sistema nunca aceptará SVG y se ejecute un pase único
  de conversión a PNG (o eliminación) para todos los SVG históricos, con
  audit log de cada cambio.

Mientras ninguna de las dos haya pasado, este runbook es parte del checklist
de deploy.

## Ambientes destino

| Ambiente | Path del volumen | Acceso |
|---|---|---|
| local (dev) | `backend/data/uploads/` | directo |
| local (test) | `backend/data/uploads/` (compartido con dev) | directo |
| docker-compose.test | `backend/data/uploads/` montado en el container app | docker exec |
| producción Coolify | `persistent_storage/<container>/data/uploads` | SSH al VPS + acceso al volumen |

## Resultado del inventario en local (referencia para CI)

Resultado de la última corrida en este checkout (ambiente local de
desarrollo, no producción):

```
$ node backend/scripts/audit-historical-svg.mjs
[audit-svg] directorio: backend/data/uploads
[audit-svg] SVG encontrados: 0
[audit-svg] ✓ sin SVG en el volumen — deploy permitido
$ echo $?
0
```

Estado de producción: no inspeccionado en este sprint. Pendiente correr el
script vía SSH contra el volumen `data/uploads` del contenedor en Coolify
con autorización explícita del operador.
