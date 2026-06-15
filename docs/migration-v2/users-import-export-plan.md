# Usuarios · Importar / Exportar · plan (v2)

> Plan aprobado 2026-06-15. Decisiones del usuario incorporadas. Construir sobre
> la sección Usuarios v2 existente; cero cambios en v1. Pipeline de PRs chicos.

## Decisiones (cerradas)

1. **Formato de import**: CSV **y** Excel (.xlsx) desde el inicio.
2. **Duplicado por email**: **saltar y reportar** (nunca pisa al existente).
3. **Credenciales al importar**: **NO** se envían; queda como paso separado
   (botón "Enviar credenciales pendientes" / cohorte `noCredential` ya existente).
4. **Export**: honra el filtro vigente (cohorte+estado+búsqueda) con opción "todos".

## Principios

- Owner/admin only en ambos (extracción y creación masiva de PII). Operator no.
- Todo auditado: `user.exported`, `user.imported` (con conteos, sin PII).
- Reusar lo construido: `services/csv.ts` (anti-inyección), ExcelJS branded de
  `reports/`, `@fastify/multipart` (5MB, ya registrado), patrón `cover-upload`
  (magic bytes), patrón `credentials-bulk` (serial, summary honesto, dry-run).
- Código de visitante: `generateUserCode(org.codePrefix)` — continuidad de QR.
- Set-based, sin N+1. Topes explícitos con aviso honesto si trunca.

## EXPORTAR

### PR-E1 · API
- `GET /api/v2/users/export.(xlsx|csv)?cohort=&status=&q=&scope=view|all`
  - owner/admin; `scope=view` (default) aplica los mismos filtros del listado;
    `scope=all` ignora cohorte/búsqueda (pero respeta `status`).
  - **xlsx** branded (logo + color de marca + header congelado + autofilter),
    una hoja "Visitantes". **csv** con `csvRow/csvCell` + BOM.
  - Columnas: `Código, Nombre, Apellido, Email, Teléfono, Visitas, Última visita,
    Credencial enviada, Estado (Activo/Archivado), Fecha de registro`.
  - Tope 50,000 filas; si excede, exporta las primeras N + nota en una celda/log.
  - `relayReport`-style (content-disposition con filename `padron-<slug>-<fecha>`).
  - Audit `user.exported` { scope, cohort, status, rows, format }.
  - Rate-limit (ej. 6/min por org+IP).
  - Tests: xlsx re-parseable con las columnas; csv saneado; 403 operator; honra filtro.

### PR-E2 · Web
- Botón "Exportar" en `/app/usuarios` (solo owner/admin) → menú: Excel / CSV,
  y toggle "Vista actual / Todo el padrón".
- Descarga binaria vía BFF relay (patrón de reportes). Arrastra `cohort/status/q`
  de la URL vigente.

## IMPORTAR

### PR-I1 · API
- **Servicio** `users-import.ts`:
  - Parse CSV (split robusto, comillas) y **.xlsx** (ExcelJS read, primera hoja).
  - Mapeo de headers tolerante: `Nombre/firstName/first_name`, `Apellido/...`,
    `Email/correo`, `Teléfono/telefono/phone`. Plantilla canónica documentada.
  - Validación por fila: firstName+lastName requeridos; email formato (opcional);
    phone opcional; normaliza email lower/trim.
  - Dedup **duro por email** (contra DB, case-insensitive) y **dentro del archivo**.
  - **Aviso blando por nombre**: marca posible duplicado si firstName+lastName ya
    existe (sin bloquear) — atiende el caso histórico "nombres dobles".
  - Clasifica cada fila: `new | duplicate-email | duplicate-in-file | invalid (razón) | name-warning`.
- `GET /api/v2/users/import/template.(csv|xlsx)` — plantilla con headers + 1 ejemplo.
- `POST /api/v2/users/import?commit=false|true` (multipart):
  - owner/admin; rate-limit (ej. 3/min); tope 5,000 filas; 5MB (multipart).
  - `commit=false` → **vista previa**: `{ rows:[{rowNum, ...norm, status, reason?}], summary:{total,new,duplicates,invalid,nameWarnings} }`. CERO escrituras.
  - `commit=true` → crea SOLO las `new` (tx por lotes; una fila mala no tumba el lote;
    re-valida server-side; código por usuario; NO envía credencial). Audit `user.imported`.
  - Respuesta de commit: summary `{created, skipped, failed}` honesto.
- Tests: preview clasifica (new/dup-email/dup-in-file/invalid/name-warning); commit
  crea solo nuevos y no envía credencial; 403 operator; xlsx y csv; tope/limite.

### PR-I2 · Web
- Drawer "Importar visitantes" en `/app/usuarios` (owner/admin):
  - "Descargar plantilla" (csv/xlsx).
  - File picker → sube a preview → **tabla** con conteos arriba (N nuevos · M
    duplicados · K inválidos · J posibles dobles) y filas con su estado/razón.
  - Botón "Importar N nuevos" → commit → summary honesto + "Ahora podés enviarles
    la credencial desde 'Enviar credenciales pendientes'".
  - Estados honestos (parse error, archivo vacío, sólo duplicados → nada que crear).

## Orden de entrega
E1 → E2 (export, read-only, bajo riesgo) → I1 → I2. Cada uno: CI 8/8, staging,
verificación con datos reales, OK explícito antes de push/merge/deploy.

## Riesgos / notas
- xlsx read agrega superficie de parseo → validar tipos de celda (números/fechas
  que Excel guarda raro → coaccionar a string y trim).
- Email duplicado dentro del archivo: el primero gana, los siguientes `duplicate-in-file`.
- PII: el export del padrón completo es extracción masiva → owner/admin + audit.
- No re-enviar credenciales en import evita un blast accidental de cientos de emails.
