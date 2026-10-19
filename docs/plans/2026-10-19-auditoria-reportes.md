# Auditoría del módulo de Reportes · 2026-10-19

Auditor: agente senior (solo lectura de código y de staging). Código en `integration` @ `ed60fd6`. Staging: `https://ccb.stg.contan2.com`, sesión del owner, solo GET. No se tocó producción ni ninguna base de datos.

Complementa (no repite) la crítica visual `docs/plans/2026-10-19-reportes-ux-critica.md` (hallazgos REP-U\*): aquí el foco es datos, seguridad, rendimiento y organización del código.

---

## Resumen ejecutivo

El módulo funciona y es rico (dashboard, 9 descargas branded, asistente), y la ocupación ya tiene una sola fórmula (personas / aforo). Pero **los números no son confiables todavía para rendir cuentas**. Las cinco cosas más importantes:

1. **Las salas permanentes (Ada Balcácer, Sala VR) se cuelan en los reportes generales**: entran al mes en que se creó la sala con **todo su histórico de visitas** y con un aforo de 100.000, que hunde la ocupación (staging, julio: aforo 100.008 → 0 %; últimos 12 meses: 1 %). En producción, el reporte de julio seguiría creciendo cada día con las visitas de la Puerta (REP-A01).
2. **Las actividades canceladas cuentan como "Actividades realizadas"** y su aforo entra al cálculo de ocupación (staging, octubre: 4 de las 5 "actividades" están canceladas) (REP-A02).
3. **"Asistencias" significa cosas distintas según el archivo**: el dashboard y el informe de período cuentan registros (junio: 64); el registro mensual oficial cuenta personas con acompañantes (junio: 79) (REP-A03).
4. **Fechas mal rotuladas**: el CSV y el Excel de asistencia ponen la fecha en UTC (la función del 14 de mayo a las 10 p. m. sale como 15 de mayo), y el Excel de protocolo muestra "Thu Jun 18" en inglés, sin año y desordenado (REP-A04, REP-A05).
5. **El Asistente compara el mes consigo mismo** en su sugerencia principal ("Compara este mes con el mes anterior"), y los informes de período no tienen tope de rango (aceptan 100 años y fechas imposibles) (REP-A06, REP-A07).

Además: el Excel mensual cubre la estructura básica del formato del departamento, pero no el libro anual (hojas Ene–Dic y "Resumen Mensual" de meses × tipos). Hay dos motores de período en paralelo y unas 470 líneas de código muerto en la web. No hay hallazgos S0.

---

## 1. Mapa del módulo

### 1.1 Superficies

| # | Reporte | Pantalla (web) | BFF `/app/reportes/api/…` | API `/api/v2/…` | Servicio de datos | Formato | Quién puede |
|---|---|---|---|---|---|---|---|
| 1 | Dashboard del período | `/app/reportes` (`ReportesDashboard.tsx`) | `summary` | `reports/period-summary` | `services/reports/period-summary.ts` | JSON | Página: owner, admin, puerta, operator, consulta (`lib/shell/nav.ts:99`). API: **cualquier staff**, incluidos protocolo y biblioteca (`routes/reports.ts:96-116`) |
| 2 | Informe de período | botón "Descargar PDF" / "Exportar Excel" | `period?kind=pdf\|xlsx\|preview` | `reports/period.pdf`, `period.xlsx`, `period/preview` | `services/reports/report-data.ts` (`buildPeriodSummary`) | PDF (Chromium), XLSX, JSON | owner, admin, puerta (`CAN_GENERATE_REPORTS`, `routes/reports.ts:83`) |
| 3 | Asistencia por actividad / por ciclo | tarjeta "Reporte por ciclo o categoría" + "Exportar CSV" | `attendance?format=json\|csv\|xlsx\|pdf&category=` | `reports/attendance-by-activity` | `services/report-data.ts` (`attendanceByActivity`) | JSON, CSV, XLSX, PDF | owner, admin, puerta |
| 4 | Registro mensual (formato del departamento) | tarjeta "Reporte mensual (formato registro)" | `month?year&month` | `reports/month.xlsx` | `services/reports/monthly-register*.ts` | XLSX | owner, admin, puerta |
| 5 | Informe por actividad | Actividades → detalle → "Exportar Excel" (`AttendeesSection.tsx:147`); PDF solo desde el Asistente | `activity/<id>.xlsx\|pdf` | `reports/activity/:file` | `report-data.ts` (`loadActivityReportData`) + plantillas `activity-*` | XLSX, PDF | owner, admin, puerta |
| 6 | Protocolo | Protocolo → descarga (`ProtocolDashboard.tsx:219`, sin rango) | `protocol?from&to` | `reports/protocol.xlsx` | `services/reports/protocol-report.ts` | XLSX | owner, admin, protocolo |
| 7 | Categorías (para filtros) | dropdown "Todos los ciclos" | `categories` | `reports/categories` | consulta directa en la ruta | JSON | cualquier staff |
| 8 | Asistente de reportes | botón "Asistente" (solo con permiso de export) | `agent` (POST) | `reports/agent` | `services/reports/agent.ts` | JSON + links | API: cualquier staff (`routes/reports-agent.ts:20`) |
| 9 | Puerta · estadísticas | `/app/puerta/reportes` (`PuertaStats.tsx`) | `/app/puerta/api/stats` | `puerta/stats` | `routes/puerta-stats.ts` | JSON | `PADRON_READ_ROLES` |
| 10 | Puerta · export | Puerta | — | `puerta/export.xlsx` | `services/puerta-export.ts` | XLSX | `PADRON_READ_ROLES` |

Nota: el encargo mencionaba `REPORT_ROLES / REPORT_EXPORT_ROLES` en `apps/api-v2/src/rbac-roles.ts`. **No existen ahí**: solo están en la web (`apps/web/lib/shell/nav.ts:95,99`). La API usa dos `Set` locales en `routes/reports.ts:83,85` (ver REP-A14).

### 1.2 Flujo

```
Navegador ──GET same-origin──▶ Next (BFF)  /app/reportes/api/*
   │                             │  relayReport(): reenvía cookie contan2_session
   │                             │  + x-forwarded-host/for; relay binario (stream)
   │                             ▼
   │                        api-v2 (Fastify)  /api/v2/reports/*
   │                             │ requireTenantStaff (host→tenant, cookie→staff)
   │                             │ [rol: CAN_GENERATE_REPORTS | PROTOCOL_REPORT_ROLES | ninguno]
   │                             │ reportLimiter 20/min por org+IP (compartido por TODOS los reportes)
   │                             │ withTenant(orgId) → RLS (app_v2)
   │                             ▼
   │          ┌──────────────────┴───────────────────────────────┐
   │          │ period-summary.ts      (dashboard + asistente)   │  SQL agregado, 8 consultas
   │          │ reports/report-data.ts (informe de período, act.)│  carga filas en memoria
   │          │ report-data.ts         (asistencia por actividad)│  SQL agregado + cota 5.000
   │          │ monthly-register.ts    (registro mensual)        │  SQL agregado, TZ local
   │          │ protocol-report.ts     (protocolo)               │
   │          └──────────────────┬───────────────────────────────┘
   │                             ▼
   │            ExcelJS (xlsx) · csv.ts (BOM, anti-inyección) · HTML → Chromium (pdf-renderer singleton)
   │                             │ writeReportAudit → tenant_audit_log (sin PII)
   ◀──────── attachment; filename=… ─┘
```

Los tres motores de datos de período (`period-summary`, `reports/report-data`, `report-data`) calculan lo mismo por caminos distintos. Esa es la raíz de varias inconsistencias.

---

## 2. Hallazgos

Severidad: **S0** bloquea · **S1** dato incorrecto o riesgo · **S2** inconsistencia o deuda · **S3** pulido. Esfuerzo: S (≤ ½ día), M (1–2 días), L (> 2 días).

### S1 · Datos incorrectos o riesgo

#### REP-A01 · S1 · Las salas permanentes contaminan los reportes generales
- **Evidencia (código):** ningún motor de período filtra `is_permanent`: `services/reports/period-summary.ts:68-103` (totales, únicos, serie, hora, nuevos), `services/reports/report-data.ts:64-77`, `services/report-data.ts:93-113`. Solo lo filtran `/reports/categories` (`routes/reports.ts:130`), el registro mensual (`monthly-register.ts:105`) y el Asistente al buscar actividades (`agent.ts:190`). Las visitas de la Puerta se guardan como filas de `attendance` sobre la actividad-sala (`routes/puerta.ts:186-201`), y el período se recorta por `activities.date`. Resultado: **todas** las visitas de una sala (de cualquier fecha) caen en el período que contiene la fecha de creación de la sala, y en ningún otro.
- **Evidencia (staging):** `GET /app/reportes/api/attendance?from=2026-07-01&to=2026-07-31&format=json` → filas "Ada Balcácer" (capacity **100000**) y "Sala VR" (8); totales `capacity: 100008, occupancyPct: 0`. `summary` de julio: `activities: 2` (las dos salas). Rango de 12 meses (2025-10-20..2026-10-19): `capacity: 101714, occupancyPct: 1`.
- **Impacto CCB:** en producción, la Puerta está viva desde el 2026-07-08. El reporte de julio suma cada día las visitas de agosto a octubre de las salas, y cualquier rango que incluya julio ve la ocupación aplastada. Los demás meses no reflejan a los visitantes de las salas. El dashboard general y el de la Puerta no se pueden conciliar.
- **Corrección:** un predicado compartido `eventActivities()` (`a.is_permanent = false`) aplicado en los tres motores y en `attendanceByActivity`. Las salas se reportan solo por `/puerta/stats`, que ya usa `registered_at`. Si el dueño quiere un total "todo el centro", agregar una sección aparte "Salas permanentes (Puerta)" con personas por `registered_at` del período, nunca mezclada en ocupación (pregunta P1).
- **Esfuerzo:** S (+ tests).

#### REP-A02 · S1 · Las actividades canceladas (y borradores) cuentan como realizadas y diluyen la ocupación
- **Evidencia:** ningún motor filtra `status`: `period-summary.ts:68-82`, `reports/report-data.ts:64-70`, `report-data.ts:93-113`, `monthly-register.ts:96-114`. El Excel de período rotula el KPI "Actividades realizadas" (`period-excel-report.ts:108`).
- **Staging:** octubre (01–19) → `activities: 5`, de las cuales 4 están `cancelada` (12 meses: 4 canceladas de 22). El aforo de las canceladas entra al denominador: `capacity: 64` → ocupación 2 %.
- **Impacto:** el CCB reporta funciones que no se hicieron y una ocupación menor a la real. En el registro mensual, las canceladas aparecen como filas con asistencia 0.
- **Corrección:** excluir `cancelada` y `borrador` de conteo, aforo y ocupación en los cuatro servicios. Opcional: mostrar "N canceladas" como dato aparte en el informe de período.
- **Esfuerzo:** S.

#### REP-A03 · S1 · "Asistencias" mide registros en unos archivos y personas en otros
- **Evidencia:** dashboard, Asistente e informe de período: `attendances` = filas de check-in (`period-summary.ts:80`, `reports/report-data.ts:166`). Ocupación = personas (`metrics.ts:7`). Registro mensual: `asistencia` = `sum(1 + niños + adultos)` (`monthly-register.ts:111`). Asistencia por actividad: ambas columnas ("Check-ins" y "Personas"). Puerta: todo en personas (`puerta-stats.ts:1-4`). El contrato `PeriodSummaryResponse` ni siquiera trae `people` (`packages/contracts/src/index.ts:1295-1312`).
- **Staging:** junio 2026 → dashboard "Asistencias" **64**; registro mensual de junio, "Total:" **79**. Mayo–junio → dashboard 661; CSV "Personas" 676; registros mensuales 597 + 79 = 676.
- **Impacto:** el departamento compara su Excel mensual con el dashboard y los números no cuadran. En una actividad se puede ver "10 asistencias · 50 % de ocupación" con aforo 40, porque la ocupación sí cuenta acompañantes (`period-pdf-template.ts:76-77`).
- **Corrección:** agregar `people` a `PeriodSummaryResponse.kpis/prev/byType/topActivities/daily` y a `buildPeriodSummary`. La cifra principal pasa a ser **personas**, con "registros" como secundaria (igual que la decisión 6.5 de la puerta). Rotular siempre "Personas" y "Registros (check-ins)"; no usar "Asistencias" a secas (pregunta P2).
- **Esfuerzo:** M.

#### REP-A04 · S1 · La fecha de la actividad sale en UTC en CSV, Excel y PDF de asistencia
- **Evidencia:** `routes/reports.ts:193` y `services/report-excel.ts:68` usan `r.date.slice(0, 10)` sobre un ISO en UTC. Pasa lo mismo en el gráfico "Personas por fecha de función" del PDF (`attendance-pdf-template.ts:94`), en los nombres de archivo (`activity-excel-report.ts:492`, `activity-pdf-template.ts:384`) y en los textos del Asistente (`agent.ts:294,424`).
- **Staging (mayo–junio):** "5to Ciclo de Cine Dominicano | CuCú" (`2026-05-15T02:00Z` = 14-may 22:00 DR) → CSV y XLSX `2026-05-15`; "Los Congos de Villa Mella" (22-may 22:00 DR) → `2026-05-23`; "Ladrón de bicicletas" (2-jun 22:00 DR) → `2026-06-03`. Son 3 de 15 filas. El Excel de período, en cambio, rotula bien "14 may de 2026 · 10:00 p. m.".
- **Impacto:** toda función de las 20:00 en adelante (la cartelera nocturna de cine) queda con el día siguiente. La del 31 a las 22:00 aparece con fecha del mes siguiente dentro de un reporte del mes correcto.
- **Corrección:** usar `ymdInTz(r.date)` de `services/reports/fmt.ts` en CSV, XLSX, PDF, nombres de archivo y Asistente. En XLSX, escribir la celda como `Date` real con `numFmt` (como hace `monthly-register-excel.ts:65`).
- **Esfuerzo:** S.

#### REP-A05 · S1 · El Excel de protocolo rotula la fecha "Thu Jun 18" y ordena mal
- **Evidencia:** `protocol-report.ts:86,105,107` hace `String(r.activityDate)` sobre un `Date`, lo que da `"Thu Jun 18 2026 22:00:00 GMT+0000 …"`. Después `.slice(0, 10)` (`:197,203`) y un orden por comparación de cadenas (`:114`).
- **Staging:** `GET /app/reportes/api/protocol` → hoja "Por actividad", columna Fecha: `["Thu Jun 18","Thu Jun 18","Fri Jun 19","Fri Jun 12"]`, en inglés, sin año, en UTC y fuera de orden.
- **Impacto:** el reporte "formal" de rendición de cuentas de protocolo no se puede entregar tal cual.
- **Corrección:** guardar `activityDate` como ISO, ordenar por `Date`, escribir una celda `Date` con `numFmt 'dd/mm/yyyy'` en la zona del tenant y agregar un test exceljs sobre la columna Fecha.
- **Esfuerzo:** S.

#### REP-A06 · S1 · El Asistente compara "este mes" contra sí mismo
- **Evidencia:** `agent.ts:63` busca primero `/\b(este mes|mes actual|el mes)\b/`. En "el mes anterior" encuentra "el mes" antes de llegar a la regla de "mes anterior" (`:65`), así que la parte B resuelve a este mes. La sugerencia está en `HELP` (`agent.ts:282`) y en los chips de la UI (`ReportsAgent.tsx:27`). El test solo verifica el `kind` (`test/reports-agent.test.ts:53`). Verificado con la expresión regular tal cual: `"el mes anterior"` → coincide `"el mes"`.
- **Impacto:** la consulta que el producto ofrece primero devuelve "asistencias parejas" con delta 0 %. Es un dato falso presentado con autoridad.
- **Corrección:** evaluar primero las reglas más específicas ("mes pasado|mes anterior") o anclar `el mes` a `^el mes$`. Agregar test: `resolvePeriod('el mes anterior')` → mes calendario anterior. Ver también REP-A11 (comparar mes parcial contra mes completo).
- **Esfuerzo:** S.

#### REP-A07 · S1 · Los informes de período no tienen tope de rango y aceptan fechas imposibles
- **Evidencia:** `parsePeriodQuery` (`routes/reports.ts:47-75`) no aplica `MAX_REPORT_RANGE_DAYS`, a diferencia de `parseRange` (`services/report-data.ts:52`). `Date.parse('2026-02-31')` se corre al 3-mar. `from > to` se compara después de sumar 1 día a `to`, así que `from = to + 1` pasa.
- **Staging:** `period?kind=preview&from=2000-01-01&to=2099-12-31` → **200, 1,39 MB** (serie `byDay` de 36.525 días, 2,1 s). Con el mismo rango, `summary` → 400 "máx 366 días". `period?kind=preview&from=2026-02-31&to=2026-03-02` → 200 con rango 03-mar→03-mar vacío. `from=2026-10-02&to=2026-10-01` → 200 vacío.
- **Impacto:** un PDF de período con rango enorme carga en memoria todas las asistencias y renderiza una tabla gigante en Chromium. Staging ya tuvo 502 con 512 MB. Las fechas inválidas devuelven un informe vacío en vez de un error claro.
- **Corrección:** reemplazar `parsePeriodQuery` por `parseRange` (que ya valida y acota) más el parseo de `types`/`categories`. Validar el calendario de verdad (redondeo ida y vuelta `ymd → Date → ymd`) en `parseRange`. El protocolo con "todo el histórico" usa su propio camino sin tope, o un tope mayor explícito.
- **Esfuerzo:** S.

#### REP-A08 · S1 · Datos personales en el informe de período y en staging
- **Evidencia:** el informe de período incluye "Top visitantes" con **correo y teléfono** en el Excel (`period-excel-report.ts:301-331`) y con correo en el PDF (`period-pdf-template.ts:81-88,176-183`). Lo puede descargar el rol `puerta` (`routes/reports.ts:83`). El PDF de actividad lista correo y teléfono de cada asistente (`activity-pdf-template.ts:104-105`).
- **Staging:** el Excel de mayo–junio trae 20 filas con correos y teléfonos con aspecto real (no se reproducen aquí). **Staging parece tener una copia de datos reales del padrón.**
- **Impacto:** el informe de período es el que se manda a dirección y a financiadores. Llevar correos y teléfonos de personas en un PDF que circula fuera del centro es un riesgo de privacidad. Si staging tiene PII real, cualquier fuga de staging es una fuga del CCB.
- **Corrección:** quitar correo y teléfono del informe de período (dejar código, nombre y visitas). Dejar el PDF de actividad sin correo y teléfono por defecto, con una opción "incluir contacto" solo para owner/admin y auditada. Confirmar con el dueño si staging debe anonimizarse (pregunta P3).
- **Esfuerzo:** S (código) + decisión.

### S2 · Inconsistencias y deuda

#### REP-A09 · S2 · Dos motores de "período" con reglas distintas
- **Evidencia:** `services/reports/period-summary.ts` (dashboard, Asistente) frente a `services/reports/report-data.ts` `buildPeriodSummary` (PDF, Excel, preview). Diferencias:
  - `previousRange` distinto. El de `report-data.ts:183-192` tiene un error de un día: `prevFrom = prevTo − span`. Staging: preview de julio → período anterior `2026-05-30..2026-06-30` (32 días); oct 01–19 → `09-11..09-30` (20 días), contra `09-12..09-30` del dashboard.
  - `deltaPct` distinto: `routes/reports.ts:341-344` devuelve 100 cuando el período anterior es 0; `period-summary.ts:16` devuelve `null`.
  - Serie por día: el dashboard agrupa por `activities.date` (`:117`); el preview agrupa por `checked_in_at` (`report-data.ts:97-98`).
  - Top: 8 contra 5. Agregación: SQL contra filas en memoria (`report-data.ts:81-87`, sin cota).
- **Impacto:** el mismo rango da comparaciones distintas según la superficie. Cada arreglo hay que hacerlo dos veces (los PR-1 y PR-9 ya pagaron este costo).
- **Corrección:** un solo `PeriodEngine` en SQL (el de `period-summary.ts`) que devuelva también `activities[]`, `byMonth`, `topUsers` y `people`. Las plantillas PDF/Excel consumen su salida. Borrar `buildPeriodSummary`, el `previousRange` duplicado y `/reports/period/preview` (solo lo usa código muerto, REP-A15).
- **Esfuerzo:** M.

#### REP-A10 · S2 · El delta de ocupación se muestra en % relativo, no en puntos
- **Evidencia:** `period-summary.ts:226` aplica `deltaPct(cur.occupancyPct, prev.occupancyPct)`. Pasar de 40 % a 50 % se muestra "+25 %".
- **Corrección:** `deltas.occupancyPts = cur − prev` y rotularlo "+10 pts". Lo mismo en el Asistente (`agent.ts:330`).
- **Esfuerzo:** S.

#### REP-A11 · S2 · Contra qué se compara "Este mes"
- **Evidencia:** el preset "Este mes" es del 1 a hoy (`presets.ts:17`). El período anterior son los N días previos (`period-summary.ts:19-25`): con 19 días, se compara contra el 12–30 de septiembre, no contra el 1–19 de septiembre. El Asistente compara el mes en curso (parcial) contra el mes anterior completo (`agent.ts:122-126`), así que a mitad de mes siempre "baja".
- **Corrección:** decidir la regla (pregunta P4). Recomendación: para presets de mes o año, "mismo tramo del período anterior" (1–19 de septiembre) y, opcionalmente, "mismo tramo del año anterior". Para rangos libres, los N días previos. Mostrar siempre el rango comparado (el dashboard ya lo hace en la leyenda).
- **Esfuerzo:** S.

#### REP-A12 · S2 · "Nuevo" y "Primera visita" no significan lo mismo
- **Evidencia:** dashboard: nuevo = cuya primera asistencia **histórica** cae dentro del período (`period-summary.ts:158-179`). Staging mayo–junio: 526 nuevos y 0 recurrentes, aunque junio solo da 21 y 32. Informe de actividad: "Primera visita" = total histórico de asistencias igual a 1, contando **visitas posteriores** (`activity-excel-report.ts:208`, `activity-pdf-template.ts:73`), así que un informe viejo cambia con el tiempo. Los anónimos cuentan como "Recurrentes" en el KPI (`returning = total − newcomers`) pero como "Primera visita" en la fila (`categoryFor(0)`).
- **Corrección:** una sola definición: "primera visita al centro = no tiene asistencias anteriores a la fecha de esta actividad". Contar los anónimos aparte ("sin identificar"). Rotular el donut del dashboard "Primera vez en el período / Ya venían antes".
- **Esfuerzo:** M.

#### REP-A13 · S2 · El Excel mensual aún no es el formato oficial del departamento
Comparado con el libro "Registro_Actividades_Culturales" (memoria del formato, decisión 6.6):

| Elemento oficial | Hoy (`monthly-register-excel.ts`) | Brecha |
|---|---|---|
| Libro anual con hojas `Ene`…`Dic` | Un archivo por mes, una hoja `Mayo 2026` | **Falta** el libro anual (`/reports/year.xlsx?year=`) |
| "Resumen Mensual" = filas meses × columnas tipo + Total mensual + fila TOTAL ANUAL | Hoja "Resumen Mensual" de **un** mes: por tipo y por programa | Falta el pivote meses × tipos y el total anual |
| 8 columnas No/Fecha/Mes/Semana/Tipo/Programa/Nombre/Asistencia | Igual (`:23-26`); Fecha es celda `Date` | OK (mejor que el original) |
| AutoFilter en el encabezado (A2:H) | No hay `autoFilter` | Falta |
| Fila "Total:" con `=SUM` | Valor fijo (`:71`) | Si el departamento edita una fila, el total no se recalcula |
| Listas ocultas `Lista_Tipo_Actividad`, `Lista_Program`, `Lista_Mes`, `Lista_Semana` | Una hoja oculta "Listas" con Tipo y Programa | Faltan Mes y Semana. Programa solo lista los programas **presentes en el mes**, no el vocabulario completo (`:81`) |
| Vocabulario de Programa ("Ciclo de Cine Dominicano", "Ciclo de Cine Clásico", "Temporada de Teatro", "Ciclo de Cine de Embajada", "Proyecciones fuera de ciclo", "Otras Obras de teatro", "Actividades Especiales") | "Cine Dominicano · 5to ciclo", "Cine Clásico", o vacío | Nombres distintos al vocabulario. Las actividades sin programa quedan en blanco (el oficial usa "Actividades Especiales") |
| Tipos del resumen: Cine/Proyecciones · Teatro/Escénicas · Talleres · Charlas · Actividades Especiales | Cine · Teatro · Talleres · Charlas · Otras Actividades | Etiquetas del resumen distintas |
| Semana 1–5 | `weekOfMonth` lunes a domingo (`monthly-register.ts:47-51`) puede dar **6** (p. ej. 30 y 31 de marzo de 2026: el 1 cae domingo) | Fuera del vocabulario 1–5 |
| — | Incluye canceladas con 0 (REP-A02) | Ruido |

- **Staging:** el registro de mayo trae las 8 columnas, `Total: 597`, "Resumen Mensual" (Cine 5/315, Charlas 1/39, Otras 2/243) y "Listas" oculta con validación de datos en E/F (16 celdas).
- **Corrección:** libro anual + `autoFilter` + `SUM` + vocabulario completo desde `programs` + listas Mes y Semana + mapeo de etiquetas acordado + semana tope 5 (o la regla del departamento). Confirmar el vocabulario con el departamento (pregunta P5).
- **Esfuerzo:** M.

#### REP-A14 · S2 · RBAC sin fuente única y abierto de más en la API
- **Evidencia:** `rbac-roles.ts` no define roles de reportes. `routes/reports.ts:83,85` usa Sets locales y la web usa los suyos (`nav.ts:95,99`). `period-summary`, `categories` y `agent` solo piden `requireTenantStaff`, así que **protocolo y biblioteca** (roles confinados) pueden leer los agregados del centro por API, aunque la página los bloquea. Los comentarios de cabecera desactualizados ("owner/admin", `routes/reports.ts:4`, `:273`) no mencionan a `puerta`. No se pudo verificar en vivo con otros roles: las sesiones de `e2e/.auth/{consulta,operator,protocolo,biblioteca,puerta}.json` estaban vencidas (307 → /login) y no se inició sesión para no escribir.
- **Corrección:** `REPORT_READ_ROLES` (owner, admin, puerta, operator, consulta) y `REPORT_EXPORT_ROLES` (owner, admin, puerta) en `rbac-roles.ts`, con `requireRole` en las 9 rutas y el Asistente. La web importa el mismo vocabulario (o un test de paridad API–web).
- **Esfuerzo:** S.

#### REP-A15 · S2 · Código muerto y rutas huérfanas
- **Evidencia:** `components/reportes/PeriodReport.tsx` (258 líneas), `ActivityReportCard.tsx` (44) y `AttendanceReport.tsx` (163) + `AttendanceReport.test.tsx` no se importan desde ninguna página (`grep` sin resultados fuera de su propio test). `/reports/period/preview` y el BFF `period?kind=preview` solo los usa `PeriodReport.tsx`. Coincide con REP-U13.
- **Corrección:** borrarlos junto con su test y el endpoint de preview (o reutilizar `ActivityReportCard` en el dashboard, ver REP-A22).
- **Esfuerzo:** S.

#### REP-A16 · S2 · Colores fijos en el código y un riesgo de configuración por tenant (pedido del dueño)
- **Evidencia:** `ReportesDashboard.tsx` tiene 12 hex fijos: `'#e65100'` para la serie "Este período", para la porción "Nuevos" y para las barras por hora, además de `PALETTE` y `TYPE_COLOR` (`:34-44,135,273,360`). `PuertaStats.tsx` tiene otros 12. `PeriodReport.tsx:127` (muerto) usa `bg-brand-strong text-white`, y `components/shell/Unavailable.tsx:33` (el "Reintentar" de Reportes cuando cae la API) también, mientras el kit usa `bg-brand text-brand-fg` (`SplitButton.tsx:61`). El dueño se quejó de que "los botones de Reportes tienen un color que no es el que usamos".
- **Riesgo de configuración (dato de DB, no de código):** en **producción**, la organización `ccb` tiene `primary_color '#e65100'` y `secondary_color '#ff6f00'` (valores viejos). En staging están los oficiales `#f39228` / `#31a3db`. Por eso en prod los CTA salen naranja oscuro con texto negro y el anillo de foco no es azul. Los PDF y Excel toman `primaryColor` y `secondaryColor` del tenant (`pdf-shell.ts:34-38`, `period-excel-report.ts:59-63`), así que en prod también salen con la paleta vieja.
- **Corrección:**
  - Serie principal con `var(--color-brand)`.
  - Botones solo con tokens del kit (`bg-brand text-brand-fg`), incluido `Unavailable`.
  - Una paleta categórica de gráficas definida **una vez** como tokens en `globals.css` (`--chart-1…--chart-8` + `--chart-prev`), validada en claro y oscuro, consumida por Reportes, Puerta y Segmentos.
  - Que Identidad ofrezca la paleta oficial CCB como preset.
  - Que el dueño actualice el color de prod desde Identidad (acción de configuración, no de código).
- **Esfuerzo:** M.

#### REP-A17 · S2 · Las descargas fallidas abren una página con JSON crudo
- **Evidencia:** todas las descargas son `<a href>` (`ReportesDashboard.tsx:168-176,443-451,502`; `ReportsAgent.tsx:19-23`). Ante 400/403/429/502, el navegador navega a `{"error":"…"}`. El PDF tarda de 2,3 a 6,1 s de mediana (Apéndice A) sin ningún indicador.
- **Corrección:** un helper `downloadReport(href)` con `fetch` → blob → `a.download`, estado "Generando…" en el botón y aviso con el mensaje de la API (429: "espera un momento").
- **Esfuerzo:** S.

#### REP-A18 · S2 · Un solo límite de 20 por minuto para todos los reportes
- **Evidencia:** `reportLimiter` (`routes/reports.ts:86`), con clave `org:IP`, lo comparten la asistencia, el mes, la actividad, el período y el protocolo. Una oficina detrás de una sola IP pública comparte 20 descargas por minuto. `period-summary` y `categories` no tienen límite.
- **Corrección:** clave por `org:staffId` (la sesión ya está resuelta), límites separados para PDF (caro) y XLSX/CSV (barato), y un límite holgado en `period-summary`.
- **Esfuerzo:** S.

#### REP-A19 · S2 · Duplicación y tipado débil en los servicios
- **Evidencia:**
  - `toArgb`/`hexToARGB` en 7 archivos (`report-excel.ts:24`, `monthly-register-excel.ts:18`, `protocol-report.ts:120`, `puerta-export.ts:39`, `segment-export.ts:21`, `period-excel-report.ts:37`, `activity-excel-report.ts:60`, `users-export.ts:133`).
  - `TYPE_LABELS` en 4 servicios + `filters.ts` de la web. `STATUS_LABELS` en 4.
  - La zona horaria se resuelve de tres formas: `REPORT_TZ` validada (`fmt.ts:8`), y `process.env.CHECKIN_TZ ?? …` sin validar en `monthly-register.ts:17`, `agent.ts:18` y `reports-agent.ts:14` (con una TZ inválida, `AT TIME ZONE` revienta en SQL).
  - Cuatro plantillas "PORT VERBATIM" con `@ts-nocheck` (`activity-excel-report.ts` 494 líneas, `activity-pdf-template.ts` 386, `period-excel-report.ts` 341, `period-pdf-template.ts` 209). Es el mismo riesgo de la memoria "git add aborta + @ts-nocheck": un import roto compila y falla en runtime.
  - Archivos de más de 400 líneas: `ReportesDashboard.tsx` (512, con `CategoryReport` y `MonthlyRegisterCard` adentro), `DateRangePicker.tsx` (412), `activity-excel-report.ts` (494), `routes/reports.ts` (451), `agent.ts` (431).
- **Corrección:** `services/reports/labels.ts` (tipos, estados, ARGB, TZ) y `excel-kit.ts` (banda, encabezado, anchos). Quitar `@ts-nocheck` plantilla por plantilla, con tipos de entrada. Partir `ReportesDashboard.tsx` en `KpiRow`, `CategoryReportCard` y `MonthlyRegisterCard`, y `routes/reports.ts` en un plugin por superficie.
- **Esfuerzo:** M (gradual).

#### REP-A20 · S2 · Informe por actividad: unidades mezcladas
- **Evidencia:** "Asistencias X de Y inscritos" (`activity-pdf-template.ts:258-260`): `enrolledCount` cuenta grupos completos (acompañantes) y `total` cuenta registros. "Asistentes (N)" cuenta solo los que entraron, pero la tabla también lista los reservados (`:305-306`). "Cupo enrolled/capacity" mezcla reservas y presentes.
- **Corrección:** "Personas en sala 15 de 20 de aforo · 4 registros · 2 reservas sin llegar", con la tabla separada en "Asistieron" y "Reservados".
- **Esfuerzo:** S.

#### REP-A21 · S2 · Asistente: cobertura y vocabulario
- **Evidencia:**
  - "asistencias de octubre" y "cuántas personas vinieron en julio" fallan: `STRIP` (`agent.ts:146`) no quita "asistencias/personas/vinieron", así que el resto se busca como nombre de actividad y responde "No encontré…" (REP-U10). Verificado con la expresión regular: el resto queda `"asistencias"`.
  - No entiende tipos ("cine de julio"), salas o Puerta, protocolo, ni "top visitantes".
  - Mezcla "asistencias", "check-ins" y "personas" según el intent (`:310` contra `:383`).
  - Las comparaciones se calculan en secuencia (`:317,351,406`).
  - Riesgo de inyección: bajo. Todo va parametrizado, `normText` quita `%` y `_` antes del `LIKE`, el cuerpo tiene tope de 300 caracteres (`contracts:1864`), solo lectura, 60/min.
  - No se probó en vivo: es POST y la consigna fue solo GET.
- **Utilidad real:** alta para "reporte de X en PDF" y "cómo le fue a X". Hoy es frágil en lo que más preguntará el CCB (totales de un mes).
- **Corrección:** stopwords de métricas (asistencias, personas, visitantes, cuántos, vinieron), intent `metric_query` (período → KPI pedido en personas), filtro por tipo, comparar mes en curso contra el mismo tramo, y vocabulario único (REP-A03). Tests de tabla con 30 frases reales del CCB.
- **Esfuerzo:** M.

#### REP-A22 · S2 · Lo que le falta al dashboard para el equipo del CCB (funcional)
- "Informe por actividad" solo ofrece las 8 del top (`ReportesDashboard.tsx:336-338`) y no tiene botón de descarga. El PDF por actividad solo se llega por el Asistente.
- No hay tabla de actividades del período (nombre, fecha, tipo, ciclo, personas, aforo, %), que es lo que el departamento copia a su Excel.
- No hay vista por sala o lugar, ni por ciclo (hay filtro pero no desglose), ni comparación interanual.
- El CSV no respeta tipos ni varios ciclos y se deshabilita (`filters.ts:72-79`). Debería respetar todos los filtros del dashboard (ver PR-R4).
- `MonthlyRegisterCard` toma mes y año del **dispositivo**, no de Santo Domingo (`ReportesDashboard.tsx:468-472`), y permite meses futuros.
- El aviso de error dice "las cifras de abajo son del período anterior" (`:245`): confunde, porque "período anterior" ya es un concepto del dashboard.
- "Ocupación promedio" es en realidad una ocupación ponderada (personas totales / aforo total).
- Las categorías se piden dos veces (`:96-103` y `CategoryReport` `:383-397`).
- **Esfuerzo:** M (con la propuesta de organización de REP-U).

#### REP-A23 · S2 · Protocolo: "personas" con acompañantes declarados, no reales
- **Evidencia:** `protocol-report.ts:82,99-110` usa `invitations.plus_ones`, no los `companions_*` del check-in. "Confirmados" excluye a los que asistieron (`:100`), aunque la etiqueta sugiere el total de confirmados. Sin rango, la descarga desde Protocolo trae todo el histórico (`ProtocolDashboard.tsx:219`).
- **Corrección:** personas reales = `1 + companions` cuando asistió, y `1 + plus_ones` como "esperadas". "Confirmados (incluye asistentes)". La descarga usa el rango del dashboard de Protocolo.
- **Esfuerzo:** S.

### S3 · Pulido

- **REP-A24 · S3 · Truncado silencioso** en el export de Puerta: `.limit(50_000)` sin aviso (`routes/puerta.ts:290`). El de usuarios sí avisa con `x-export-truncated`. Corrección: misma cabecera y una nota en la hoja. **S.**
- **REP-A25 · S3 · Datos E2E en staging:** las actividades y categorías `[E2E] …` aparecen en los reportes de octubre y en el dropdown de ciclos (`/reports/categories` → `"[E2E] E2E-20261016-1542-m54p Ciclo"`). Corrección: limpiar al terminar cada corrida, o un prefijo excluible en staging. **S.**
- **REP-A26 · S3 · Fechas imposibles en `parseRange`:** `2026-02-31` se corre al 3-mar; en el dashboard da el error "from debe ser anterior…", que confunde. Se cierra con REP-A07. **S.**
- **REP-A27 · S3 · Rendimiento (sin urgencia):**
  - Los tiempos están bien para el volumen actual (Apéndice A).
  - Riesgos a futuro: `buildPeriodSummary` carga todas las filas de asistencia en memoria; `newVsReturning` recorre todo el histórico de la organización en cada consulta (`period-summary.ts:161-175`); el filtro de ciclo normalizado no usa índice.
  - El renderer de Chromium no limita páginas concurrentes (`pdf-renderer.ts:32-48`). Agregar un semáforo de 2 renders simultáneos protege la memoria (el antecedente del 502 con 512 MB).
  - Bundle de `/app/reportes`: 814 KB de JS sin comprimir en la primera carga (mediana de 43 rutas: 767 KB). Build local del 16-oct, `.next/diagnostics/route-bundle-stats.json`. Aceptable.
  - Índices existentes cubren `activities(date)`, `(org, status, date)`, `attendance(org, activity)`, `(org, user)` y `(checked_in_at)`.
  - **M.**
- **REP-A28 · S3 · Tests que faltan:**
  - Exclusión de salas permanentes y de canceladas en los cuatro motores.
  - Fecha DR en el CSV y el XLSX de asistencia.
  - Columna Fecha del protocolo.
  - `previousRange` del preview.
  - Tope de rango en `period.*`.
  - `resolvePeriod('el mes anterior')`.
  - RBAC por rol (protocolo y biblioteca → 403) en `period-summary` y `agent`.
  - "Semana ≤ 5".
  - `AttendanceReport.test.tsx` prueba código muerto.
  - Los e2e `@write` siembran datos en staging (REP-A25).
  - **S–M.**

---

## 3. Coherencia de datos (valores reales de staging)

Rangos: **A** = 2026-10-01..2026-10-19 (el pedido; staging tiene poca actividad real en octubre) y **B** = 2026-05-01..2026-06-30 (el período con más datos reales). "Periodo PDF/XLSX" usa el mismo motor que `period/preview` (`buildPeriodSummary`), y el JSON del preview se usa como lectura de sus cifras (el XLSX se re-parseó con exceljs; el PDF no se pudo extraer a texto porque no hay `pdftotext`/`pdftoppm` en el equipo, así que se verificó tamaño, páginas y plantilla). Asistente: no se llamó (es POST); por código usa `periodSummary` → mismas cifras que el dashboard.

| KPI | Rango | Dashboard (`summary`) | Período (preview → PDF/XLSX) | Asistencia por actividad (JSON = CSV = XLSX) | Registro mensual | Asistente (por código) | ¿Coincide? |
|---|---|---|---|---|---|---|---|
| Actividades | A | 5 | 5 (XLSX —) | 5 | 5 filas (oct.) | 5 | Sí, pero **4 son canceladas** (REP-A02) |
| Registros de check-in | A | 1 | 1 | 1 | — | 1 | Sí |
| Personas | A | — (no existe) | — | 1 | 1 | — | — |
| Visitantes únicos | A | 1 | 1 | — | — | 1 | Sí |
| Ocupación | A | 2 % | 2 % | 2 % (aforo 64) | — | 2 % | Sí (inflada por canceladas) |
| Período anterior | A | 09-12..09-30 (19 d) | **09-11..09-30 (20 d)** | — | — | 09-12..09-30 | **No** (REP-A09) |
| Actividades | B | 15 | 15 (XLSX "Actividades realizadas" 15) | 15 | 8 + 7 = 15 | 15 | Sí |
| Registros de check-in | B | **661** | 661 (XLSX "Asistencias totales" 661) | 661 ("Check-ins") | — | 661 | Sí |
| Personas | B | — | — | **676** | **597 + 79 = 676** | — | **El dashboard no lo muestra; el registro mensual sí** (REP-A03) |
| Junio, "asistencia" | jun | **64** | 64 | 64 check-ins / 79 personas | **79** | 64 | **No** (REP-A03) |
| Visitantes únicos | B | 526 | 526 | — | — | 526 | Sí |
| Ocupación | B | 41 % | 41 % | 41 % (676 / 1642) | — | 41 % | Sí (fórmula única, decisión 6.4) |
| Nuevos / recurrentes | B | 526 / 0 | — | — | — | — | Definición distinta a la del informe de actividad (REP-A12) |
| Período anterior | B | 03-01..04-30 (61 d) | **02-28..04-30 (62 d)** | — | — | — | **No** (REP-A09) |
| Fecha de "CuCú" (14-may 22:00 DR) | B | (serie diaria por día DR) | "14 may de 2026 · 10:00 p. m." | **2026-05-15** | 14/05/2026 | — | **No** (REP-A04) |
| Salas en julio | jul | 2 actividades (Ada, VR) | 2 | 2 (aforo 100.008, 0 %) | excluidas | 2 | **Incoherente con Puerta** (REP-A01) |
| Invariantes internas | B | serie diaria = por tipo = por hora = 661 | byDay 661 | total CSV = suma de filas | Total = suma | — | Sí |

Conclusión: las cifras **coinciden entre superficies cuando miden lo mismo** (fórmula de ocupación única, totales iguales). Fallan cuatro cosas: (1) qué se cuenta (canceladas, salas), (2) en qué unidad ("asistencias" = registros o personas), (3) contra qué período se compara, y (4) cómo se rotula la fecha.

---

## 4. Plan propuesto (bloques para agentes Sonnet)

Orden por valor y riesgo. Cada bloque es un PR a `integration` con su suite completa (api + web) en verde antes de hacer push (memoria "correr el suite completo").

### PR-R1 · `fix/reports-scope-and-dates` · S1 · S–M · sin decisiones
Cubre REP-A01 (excluir salas), REP-A02, REP-A04, REP-A05, REP-A06, REP-A07 y REP-A26.
- Archivos: `services/reports/period-summary.ts`, `services/reports/report-data.ts`, `services/report-data.ts`, `services/reports/monthly-register.ts` (canceladas), `routes/reports.ts` (`parsePeriodQuery` → `parseRange`; CSV con `ymdInTz`), `services/report-excel.ts` (Fecha como `Date` en DR), `services/reports/attendance-pdf-template.ts:94`, `activity-*`/`period-*` (nombres de archivo con `ymdInTz`), `services/reports/protocol-report.ts`, `services/reports/agent.ts` (orden de reglas + fechas DR).
- Aceptación:
  - Fixture con una sala permanente (aforo 100000, visitas en dos meses) y una actividad cancelada: dashboard, preview, CSV y registro mensual las excluyen, y la ocupación del fixture no cambia al agregarlas.
  - Actividad 22:00 DR → `Fecha` = día DR en CSV, XLSX, PDF y nombre de archivo.
  - Protocolo: columna Fecha `Date` dd/mm/yyyy ordenada desc.
  - `resolvePeriod('el mes anterior')` = mes anterior.
  - `period.pdf?from=2000-01-01&to=2099-12-31` → 400. `from=2026-02-31` → 400.
  - e2e REP-01\*, REP-03\* en verde.
- Nota: las cifras de los meses con salas y canceladas cambian en prod. Avisar al CCB.

### PR-R2 · `fix/reports-rbac-pii` · S1 · S · **decisión P3**
Cubre REP-A08, REP-A14 y REP-A18.
- Archivos: `apps/api-v2/src/rbac-roles.ts` (`REPORT_READ_ROLES`, `REPORT_EXPORT_ROLES`, `PROTOCOL_REPORT_ROLES`), `routes/reports.ts`, `routes/reports-agent.ts`, `period-excel-report.ts`/`period-pdf-template.ts` (sin correo ni teléfono), `activity-*` (contacto opcional), `rate-limit` con clave por staff, `apps/web/lib/shell/nav.ts` (importa o testea paridad).
- Aceptación: protocolo y biblioteca → 403 en `period-summary`, `categories` y `agent`; el informe de período no contiene `@` ni teléfonos (test de regex sobre XLSX y HTML); limitadores separados PDF y XLSX; test de paridad de roles API–web.

### PR-R3 · `refactor/reports-single-engine` · S2 · M · **decisiones P2 y P4**
Cubre REP-A03, REP-A09, REP-A10, REP-A11, REP-A12 y REP-A20.
- Un `PeriodEngine` SQL (base: `period-summary.ts`) con `people` en todos los agregados, `activities[]`, `byMonth`, `topUsers` (sin PII de contacto) y `previousRange` según la regla de P4. `period-*` y el Asistente lo consumen. Se borran `buildPeriodSummary`, el `previousRange` duplicado y `/reports/period/preview`. Contrato `PeriodSummaryResponse` + `people`. Delta de ocupación en puntos. Definición única de primera visita.
- Archivos: `services/reports/period-summary.ts`, `services/reports/report-data.ts`, `routes/reports.ts`, `packages/contracts/src/index.ts`, `period-excel-report.ts`, `period-pdf-template.ts`, `activity-*`, `agent.ts`, `ReportesDashboard.tsx` (KPI principal personas).
- Aceptación: test "una cifra, cuatro salidas" (dashboard, XLSX, PDF HTML y Asistente dan las mismas personas, registros, únicos, ocupación y período anterior para un fixture con acompañantes); el período anterior del preset "Este mes" = mismo tramo del mes anterior (si P4 = sí).

### PR-R4 · `feat/reports-excel-oficial` · S2 · M · **decisión P5**
Cubre REP-A13.
- `GET /reports/year.xlsx?year=` (hojas Ene–Dic + "Resumen Mensual" meses × tipos + TOTAL ANUAL con `SUM`), `autoFilter`, `Total:` con `=SUM`, listas ocultas Tipo/Programa/Mes/Semana con vocabulario completo desde `programs`, semana tope 5, mapeo de etiquetas del departamento. El mensual reutiliza el mismo constructor de hoja.
- Archivos: `services/reports/monthly-register.ts`, `monthly-register-excel.ts`, `routes/reports.ts`, tarjeta en el dashboard (año), e2e REP-03e (quitar `fixme`).
- Aceptación: exceljs re-parsea 14 hojas (12 meses + Resumen + Listas ocultas); la suma de "Resumen Mensual" = suma de los totales mensuales = personas del `PeriodEngine` del año; validación de datos en E/F/C/D apuntando a las listas.
- Va **después de PR-R1** (canceladas y salas) y **de PR-R3** (personas).

### PR-R5 · `fix/reports-downloads-ux` · S2 · S–M · sin decisiones
Cubre REP-A17, REP-A22 (partes funcionales) y REP-A15.
- `downloadReport()` con estado "Generando…" y error legible; tabla de actividades del período con descarga PDF/Excel por fila; selector de actividad sobre todas las del período (no solo las 8 del top); CSV que respeta tipos y ciclos (`attendance-by-activity` acepta `types` y `categories[]`, misma semántica que el dashboard), sin estado deshabilitado; `MonthlyRegisterCard` con `todayYmd(DEFAULT_TZ)`; textos de error y de ocupación honestos; borrar `PeriodReport`, `ActivityReportCard`, `AttendanceReport` y su test; partir `ReportesDashboard.tsx`.
- Coordinar con la propuesta de organización de `2026-10-19-reportes-ux-critica.md` (REP-U01/U02) para no tocar dos veces el encabezado.
- Aceptación: un 429 muestra un aviso sin salir de la página; CSV con `types=cine&categories=A,B` = mismas filas que el dashboard filtrado.

### PR-R6 · `chore/reports-tokens-colors` · S2 · S–M · sin decisiones
Cubre REP-A16.
- Tokens `--chart-1…8`, `--chart-prev` en `globals.css` (claro y oscuro); `ReportesDashboard.tsx`, `PuertaStats.tsx` y `charts/primitives` sin hex; `Unavailable.tsx` con `bg-brand text-brand-fg`; preset "Paleta oficial CCB" en Identidad. Ejecución en prod (no es código): el dueño actualiza `primary_color`/`secondary_color` de `ccb` a `#f39228`/`#31a3db` desde Identidad.
- Aceptación: `grep '#[0-9a-f]{6}'` en `components/reportes` y `components/puerta/PuertaStats.tsx` = 0; contraste AA del texto sobre la marca (texto oscuro, memoria del token `#f39228`).

### PR-R7 · `feat/reports-agent-v3` · S2 · M · sin decisiones (depende de PR-R3)
Cubre REP-A21.
- Intent de métrica por período, filtro por tipo, salas/Puerta, vocabulario único, comparaciones en paralelo, tabla de 30 frases reales como test.

### PR-R8 · `chore/reports-hardening` · S3 · M
Cubre REP-A19, REP-A23, REP-A24, REP-A25, REP-A27 y REP-A28.
- `labels.ts` / `excel-kit.ts`, TZ única validada, quitar `@ts-nocheck` de las 4 plantillas, semáforo en `pdf-renderer`, aviso de truncado en Puerta, protocolo con personas reales, limpieza de datos E2E y tests faltantes.

### Preguntas para el dueño (cerradas)

- **P1.** ¿Las visitas a las salas permanentes deben **sumarse** a los totales del centro en el informe de período, como sección aparte "Salas (Puerta)", o quedan **solo** en Puerta · Reportes? *(Recomendación: sección aparte, nunca en la ocupación.)*
- **P2.** ¿La cifra principal de Reportes pasa a ser **personas** (con acompañantes), con "registros" como dato secundario, igual que en la puerta? *(Recomendación: sí; así cuadra con el registro mensual del departamento.)*
- **P3.** ¿Quitamos correo y teléfono del informe de período y los dejamos solo como opción auditada para owner/admin en el informe por actividad? ¿Anonimizamos los datos personales de staging? *(Recomendación: sí y sí.)*
- **P4.** Con "Este mes" (1 al 19), ¿comparamos contra el **1 al 19 del mes anterior** en vez de los 19 días previos? *(Recomendación: sí para presets de mes y año.)*
- **P5.** ¿Adoptamos el vocabulario exacto del departamento en el Excel (Programa: "Ciclo de Cine Dominicano", …, "Actividades Especiales"; tipos del resumen "Cine/Proyecciones", "Teatro/Escénicas", …) y entregamos el libro anual Ene–Dic? *(Recomendación: sí, confirmando la lista con el departamento.)*

---

## Apéndice A · Tiempos medidos en staging (mediana de 3 GET)

Rango 2026-05-01..2026-06-30, sesión owner, 3 rondas separadas por 65 s para no gatillar el límite de 20/min.

| Endpoint (BFF) | Estados | Mediana | Tamaño |
|---|---|---|---|
| `summary` (period-summary) | 200 ×3 | 0,92 s | 7,3 KB |
| `categories` | 200 ×3 | 0,27 s | 0,2 KB |
| `attendance` JSON | 200 ×3 | 0,42 s | 4,9 KB |
| `attendance` CSV | 200 ×3 | 0,26 s | 1,7 KB |
| `attendance` XLSX | 200 ×3 | 0,36 s | 8,1 KB |
| `attendance` PDF | 200 ×3 | **6,09 s** | 328 KB |
| `period` preview (JSON) | 200 ×3 | 0,51 s | 5,0 KB |
| `period` XLSX | 200 ×3 | 0,84 s | 33 KB |
| `period` PDF | 200 ×3 | 2,25 s | 312 KB |
| `month` XLSX (mayo) | 200 ×3 | 0,67 s | 9,4 KB |
| `protocol` XLSX (histórico) | 200 ×3 | 0,73 s | 9,3 KB |
| `/app/puerta/api/stats` (jul–oct) | 200 ×3 | 0,34 s | 5,9 KB |
| Página `/app/reportes` (SSR) | 200 ×3 | 0,76 s | 115 KB HTML |

Lectura: todo lo que no es PDF responde en menos de 1 s. El PDF de asistencia por actividad (6,1 s) es casi 3 veces más lento que el de período (2,3 s) con un volumen parecido. Merece perfilarse dentro de PR-R8 (hipótesis sin verificar: la descarga y el rasterizado del logo en cada request, `loadLogoDataUri`, y la cantidad de nodos del gráfico de barras). `summary` (0,92 s) hace 8 consultas sobre una sola conexión de `withTenant`.

Tamaños y páginas de los PDF (descarga individual): asistencia oct. 245 KB / 1 página / 3,8 s; asistencia may–jun 328 KB / 2 páginas / 5,4 s; período oct. 218 KB / 3 páginas / 1,2 s; período may–jun 312 KB / 4 páginas / 3,7 s. El primer PDF tras un rato sin uso incluye el arranque de Chromium (unos 500 ms, `pdf-renderer.ts:2-3`).

## Apéndice B · Comandos usados (sin secretos)

- Cookie de `apps/web/e2e/.auth/<rol>.json` convertida a un cookie-jar Netscape en el scratchpad (`chmod 600`), sin imprimir su valor.
- `curl -s -o <archivo> -b <jar> -w "%{http_code} %{content_type} %{size_download}B %{time_total}s" "https://ccb.stg.contan2.com/app/reportes/api/<ruta>"` para `summary`, `attendance?format=json|csv|xlsx|pdf`, `period?kind=preview|xlsx|pdf`, `month?year&month`, `categories`, `protocol`, `/app/puerta/api/stats`.
- Re-parseo de los XLSX con `exceljs` del repo (`createRequire` hacia `apps/api-v2/package.json`): hojas, celdas, `autoFilter` y `dataValidation`.
- Conteo de páginas e imágenes de los PDF con una expresión regular sobre el binario (no hay `pdftotext`).
- `.next/diagnostics/route-bundle-stats.json` para el peso del bundle.
- Sesiones de los roles consulta/operator/protocolo/biblioteca/puerta: vencidas (307 → /login). No se inició sesión para no generar escrituras; el RBAC por rol se evaluó por código y por los tests e2e `rep-agent-rbac.spec.ts` (REP-05\*).
- No se llamó al Asistente (POST) ni se corrieron e2e contra staging.
- Al inspeccionar el XLSX de período se vieron correos y teléfonos de personas en "Top visitantes". No se copiaron a este informe.
