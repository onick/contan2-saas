# Crítica UX/UI del módulo de Reportes (2026-10-19)

Alcance: `/app/reportes` y `/app/puerta/reportes` en staging (`ccb.stg.contan2.com`, sesión owner), 1440, 820 y 390 px. Solo lectura. Rúbrica: `.claude/skills/impeccable` (registro `product`, PRODUCT.md). Capturas en `apps/web/e2e/.artifacts/reportes-ux/` (ver apéndice). Los datos de staging incluyen actividades `[E2E]`; no se juzgan como contenido.

## 1. Veredicto

1. La pantalla es limpia, coherente con el kit y sin fallas de accesibilidad automáticas: axe 0 violaciones en las 9 vistas medidas, sin scroll horizontal, `prefers-reduced-motion` sin animaciones activas.
2. El problema principal es de arquitectura de información: lo que el equipo usa a diario (descargar un reporte) está repartido en cuatro lugares y dos tarjetas de formularios ocupan 300 px de alto antes del primer KPI.
3. El filtro global (período, tipos, ciclos) no gobierna todo: afecta KPIs, gráficas y el botón PDF/Excel/CSV del encabezado, pero la tarjeta "por ciclo" tiene su propio selector de categoría, y la "mensual" ignora el período. Hay dos modelos mentales en una pantalla.
4. En móvil funciona pero es una columna de 3600 px: 4 KPIs apilados ocupan casi una pantalla, los filtros se parten en 3 filas y los botones de filtro miden 37 px de alto (< 44).
5. El Asistente está bien resuelto como drawer/sheet, pero falla en la consulta que sugiere el propio ejemplo mental del usuario ("asistencias de octubre") y su copy usa "matchee".

### Puntaje por heurística (0-4)

| Heurística | Puntaje | Nota |
|---|---|---|
| Jerarquía visual | 3 | Título, CTA naranja y KPIs claros; dos tarjetas de formulario compiten con los KPIs (REP-U01) |
| Arquitectura de información | 2 | Descargas dispersas, alcance del filtro ambiguo (REP-U01, U02, U03) |
| Carga cognitiva | 2 | 3 filtros + 2 tarjetas de descarga + SplitButton + Asistente antes del primer dato (REP-U01) |
| Consistencia con el kit | 3 | Card, SplitButton, DateRangePicker y focusRing; selects nativos y dropdowns a mano rompen el vocabulario (REP-U05, U06) |
| Accesibilidad | 3 | axe limpio; faltan `aria-expanded`/Escape en dropdowns y targets bajos (REP-U04, U07) |
| Responsive | 3 | Sin overflow; targets y orden en móvil mejorables (REP-U04, U08) |
| Copy | 3 | Claro y en tuteo; fechas ISO en prosa, "matchee", etiquetas en mayúsculas (REP-U09, U10) |
| Estados vacío/carga/error | 2 | Vacíos de una línea sin guía; carga solo baja opacidad; error del resumen presente (REP-U11) |
| Motion | 4 | Cero animación bajo reduced-motion; datos animados solo con conteo/barras, sin coreografía |

Total: 25/36 (equivalente a 28/40 en la escala de Nielsen: banda "buena, con fricción de IA").

## 2. Hallazgos

Severidad: P0 bloquea, P1 importante, P2 mejora, P3 pulido. Ningún P0.

### REP-U01 (P1) Descargas repartidas en cuatro sitios y dos tarjetas de formulario empujan los datos
- Evidencia: `1440-02-reportes-full.png`, `390-02-reportes-full.png`.
- Código: SplitButton PDF/Excel/CSV `ReportesDashboard.tsx:166-179`; `CategoryReport` (Excel, CSV, PDF) `:377-453` montado en `:238`; `MonthlyRegisterCard` (Excel) `:477-505` montado en `:241`. "Excel" aparece 3 veces con alcances distintos (período filtrado, ciclo, mes) y el rótulo no lo dice.
- Efecto: en 1440 el primer KPI queda en y=560 (60% del primer viewport); en 390 el primer KPI queda a ~1050 px.
- Propuesta: un único panel "Descargas" colapsado por defecto (ver sección 3), abierto desde el botón del encabezado, y los KPIs suben al primer viewport. Etiquetar cada descarga con su alcance: "Informe del período", "Un ciclo", "Registro mensual".

### REP-U02 (P1) El filtro superior no gobierna todo y no se dice
- Evidencia: `1440-01-reportes-top.png`. Los selects "Ciclo / categoría" (`:419-425`) y Mes/Año (`:489-502`) viven aparte de los pills "Todos los ciclos"/"Todos los tipos"; son dos sistemas para el mismo concepto (ciclo). El texto de la tarjeta ciclo repite el rango con fechas ISO.
- Propuesta: el selector de ciclo del panel Descargas reutiliza `cats` del filtro global (si hay 1 ciclo marcado arriba, "Un ciclo" lo toma; si no, pide elegir). Mes/Año se vuelve opción "Registro mensual" con su propio rótulo "No usa el período de arriba".

### REP-U03 (P2) Filtros en tres controles distintos, dos hechos a mano
- Evidencia: `1440-05-tipos-abierto.png`, `1440-06-ciclos-abierto.png`. `ReportesDashboard.tsx:185-232`: botones `rounded-full` con popovers `absolute` propios, listas de checkboxes sin `role`, sin `aria-expanded`, sin cierre con Escape (solo clic fuera, `:105-110`).
- Propuesta: reusar `Popover`/`DropdownMenu` del kit (`components/ui/Popover.tsx`, `DropdownMenu.tsx`) con `aria-expanded` y Escape gratis, y mostrar los filtros activos como Chips (`ui/Chip.tsx`) con "Quitar" en una sola fila. Añadir "Limpiar filtros" cuando haya alguno.

### REP-U04 (P2) Targets bajo 44 px en móvil
- Evidencia: `results.json` (targets). A 390: "Todos los tipos" 169x37, "Todos los ciclos" 175x37, selects 36 px, botón de menú de exportación 40x44, "Descargar Excel" 40 px alto. En Puerta: pills de sala 35-37 px y el enlace "Descargar Excel completo" 15 px alto a 1440/820.
- Código: `min-h-8` en `ReportesDashboard.tsx:189,213`; selects con `py-2` (`:420`).
- Propuesta: `min-h-11` en móvil (`min-h-11 sm:min-h-9`) en pills y selects; el enlace de Puerta (`PuertaStats.tsx:263`) pasa a botón secundario `Button` con `min-h-11` o `py-3` inline.

### REP-U05 (P2) KPIs: patrón "número grande + etiqueta" ×4 con etiquetas en mayúsculas y deltas casi ilegibles
- Evidencia: `1440-02-reportes-full.png` (KPIs), `ReportesDashboard.tsx:251-266`. Etiquetas `text-[11px] uppercase tracking-[0.04em]`, delta "0 antes" a 10 px (`:257`). En 390 son 4 tarjetas de ~110 px apiladas.
- Reglas impeccable: eyebrows en mayúsculas y hero-metric repetidos. No es ban duro (no hay gradiente), pero 10-11 px con mayúsculas es lo más pequeño de la pantalla.
- Propuesta: una sola Card con 4 celdas separadas por `divide-x divide-line` (en 390: grid 2x2 con `divide-y`), etiqueta `text-xs text-muted` en minúscula tipo oración, delta `text-xs`. Ahorra ~300 px en móvil.

### REP-U06 (P2) Selects nativos y cabeceras mayúscula en tarjetas de descarga
- `CategoryReport` y `MonthlyRegisterCard` usan `<select>` nativos con etiqueta `text-[10px] uppercase tracking-[0.08em]` (`:419,489,496`), distinto al `Field`/`Input` del kit (`ui/Field.tsx`, `ui/Input.tsx`). Los selects de "Informe por actividad" repiten el patrón (`:336`).
- Propuesta: etiquetas con `text-sm font-medium text-ink` y controles del kit; una sola altura (44 móvil / 36 desktop).

### REP-U07 (P2) Dropdowns y menú: semántica y teclado
- Orden de tabulación medido en 1440 (`results.json`): notificaciones, usuario, Asistente, Descargar PDF, menú de formatos, Período, Tipos, Ciclos, select ciclo, Excel, CSV, PDF, Mes, Año, Descargar Excel, select actividad, cuerpo, sidebar. El orden visual coincide, pero el sidebar queda al final (convención: después del skip-link/antes del contenido; revisar si existe "saltar al contenido").
- El menú de exportación expone `aria-haspopup="menu"`; los dropdowns de tipos/ciclos no (REP-U03).
- No se pudo llegar a "Aplicar" del selector por teclado dentro del script sin abrirlo con Enter; abierto por clic en `390-03-periodo-abierto.png` los controles son visibles y los inputs `date` nativos tienen etiquetas "Desde/Hasta". Pendiente: prueba manual de foco atrapado en el popover.

### REP-U08 (P2) El selector de período en móvil tapa la barra inferior y deja poco aire
- Evidencia: `390-03-periodo-abierto.png`: el popover llega a y≈792 y se superpone a la barra de pestañas (y≈765). Los botones "Cancelar/Aplicar" quedan pegados a la barra. En móvil funciona mejor como `Sheet` (`ui/Sheet.tsx`) a pie de pantalla con `pb-[env(safe-area-inset-bottom)]`.
- Observación: en capturas fullPage de 390 la barra inferior fija aparece a media página; es artefacto de captura, no un bug.

### REP-U09 (P3) Fechas ISO en prosa y copy del Asistente
- `ReportesDashboard.tsx:274`: "Este período (2026-10-01 – 2026-10-19)" y la tarjeta ciclo `(2026-10-01 – 2026-10-19)`. Usar el mismo formato corto del picker: "1 – 19 oct 2026".
- Asistente: `apps/api-v2/src/services/reports/agent.ts:396` "…que matchee «asistencias»" es coloquial/anglicismo. Proponer: "No encontré ninguna actividad con «asistencias» en el nombre. Prueba con otra parte del nombre."
- "Reporte mensual (formato registro)" explica 3 líneas de columnas; basta: "Registro mensual del departamento" + una línea.

### REP-U10 (P2) El Asistente no entiende "asistencias de octubre"
- Evidencia: `1440-08b-asistente-consulta-viewport.png`, `390-08b-asistente-consulta-viewport.png`: interpreta "asistencias" como nombre de actividad. Las sugerencias ("Reporte del mes pasado en Excel", "Comparar este mes vs anterior") sí existen.
- Propuesta: intent "asistencias de <mes>" → reporte del mes (reusar el de "mes pasado"). Para P2 inmediato: cuando no hay match, ofrecer los chips con el mes mencionado.

### REP-U11 (P2) Estados vacío y carga mínimos
- Evidencia: `1440-10-vacio-full.png`. Rango sin datos: 7 tarjetas con "Sin … en el período" de una línea; la de distribución queda ~330 px de alto casi vacía; los KPIs siguen en 0 y el delta "0 antes". No hay mensaje único ni acción ("Prueba con Este mes", "Quitar filtros").
- Carga: solo `opacity-50` (`:249`), sin `aria-busy` ni `Skeleton` (`ui/Skeleton.tsx`).
- Propuesta: si `activities === 0 && attendances === 0`, un único `EmptyState` (`ui/EmptyState.tsx`) bajo los filtros: "Sin actividad entre 1 y 7 ene 2025" + botones "Este mes" y "Quitar filtros"; ocultar las gráficas vacías. Durante carga, `aria-busy="true"` y `Skeleton` en KPIs.

### REP-U12 (P3) Color de gráficas fuera de tokens y entre pantallas
- `ReportesDashboard.tsx:34-44,133-135,277-278`: hexadecimales (`#e65100`, `#14b8a6`, `#8b5cf6`, `#3b6fe0`…) en vez de tokens de marca; el azul de "por día" (`#8fb3ef`) no es el secundario del tenant. La dona "Nuevos vs recurrentes" usa naranja saturado a 140 px: es el elemento más pesado de la pantalla para el dato menos accionable.
- Propuesta: serie principal `var(--brand)`; secundaria `var(--secondary)` si existe; el resto neutros. Bajar la dona a 112 px.

### REP-U13 (P3) Código muerto
- `PeriodReport.tsx`, `AttendanceReport.tsx` y `ActivityReportCard.tsx` no se importan en ninguna pantalla (solo sus tests). Duplican la UI de descarga con otro lenguaje visual (`text-[15px]`, etiquetas `uppercase`). Eliminarlos o integrarlos evita confusión al reorganizar.

### REP-U14 (P3) Puerta: buena base, enlaces y pie
- `1440-12-puerta-reportes-full.png`: coherente con Reportes (mismas gráficas), pills de sala tipo segmentado, KPI con mismo problema (REP-U05). "Descargar Excel completo" queda como nota al pie de 15 px de alto (`PuertaStats.tsx:262-263`); el botón superior "Exportar Excel" ya tiene alcance, así que el pie conviene pasar a una opción del menú del propio botón (SplitButton: "Exportar Excel (rango actual)" / "Excel completo").
- "Cancelladas 14" con barra azul: el rojo del badge y el azul de la barra se contradicen; usar el color del estado.

### Bans de impeccable: revisión
- Side-stripes: ninguno. Gradient text: ninguno (el área bajo la línea es relleno, no texto). Glassmorphism: no. Eyebrows: no en cada sección, pero sí etiquetas mayúsculas en KPIs, formularios y el Asistente ("REPORTES" sobre el título, `ReportsAgent.tsx:193`: es redundante con el nombre de la pantalla; quitar). Cards idénticas en grilla: los 4 KPIs son el único caso (REP-U05). Em dashes: la prosa de la pantalla no los usa; "Exportar CSV · asistencia por actividad" usa punto medio, correcto.

## 3. Propuesta de organización

Principio: lo diario (ver cómo va el mes y bajar un informe) arriba; lo ocasional (ciclo, registro mensual, comparar) agrupado en un panel de descargas; sin repetir.

Qué sobra o se repite:
- Tres "Descargar Excel" y dos PDF: dejar un solo punto de entrada "Descargar" con 3 secciones (Informe del período, Un ciclo, Registro mensual).
- El rango escrito en prosa (`2026-10-01 – 2026-10-19`) ya está en el picker.
- "Informe por actividad" y "Top actividades" son la misma lista: al hacer clic en una fila de Top, abre el detalle (el select sobra).
- Dona de tipos y barras por día cuando valen 0: ocultar.

Nombres y orden de secciones:
1. Encabezado: "Reportes", acciones "Asistente" y "Descargar" (botón primario con el panel).
2. Filtros: período, tipos, ciclos, chips activos.
3. "Resumen del período" (KPIs en una sola tarjeta).
4. "Evolución" (línea) + "Por tipo".
5. "Actividades destacadas" (top 5, filas clicables que abren el informe por actividad).
6. "Cuándo viene la gente" (por hora + por día, en una tarjeta con dos mini-gráficas).
7. "Visitantes" (nuevos vs recurrentes, compacto).
8. Panel "Descargas" (Sheet/Popover desde el encabezado): "Informe del período (PDF/Excel/CSV)", "Un ciclo o categoría", "Registro mensual".

### Wireframe 1440 (contenido, ancho útil ~1170)

```
Reportes                                   [Asistente] [Descargar v]
Resumen ejecutivo del período

[ Este mes · 1-19 oct v ] [ Tipos v ] [ Ciclos v ]  (chips activos)  Limpiar
+------------------------------------------------------------------+
| Actividades 5 | Asistencias 1 | Visitantes únicos 1 | Ocupación 2% |
| 0 antes       | 0 antes       | 0 antes             | 0% antes     |
+------------------------------------------------------------------+
+--- Evolución de asistencias (1.7fr) -----+ +-- Por tipo (1fr) ---+
|  línea este período vs anterior          | |  dona 112px + lista |
+------------------------------------------+ +---------------------+
+--- Actividades destacadas ---------------+ +-- Visitantes -------+
|  1 FLUJO ........ 1   (fila clicable)   | | nuevos / recurrentes|
|  2 ...                                   | +---------------------+
+------------------------------------------+
+--- Cuándo viene la gente: [Por hora] [Por día] (segmentado) -----+
```
Panel "Descargar v" (Popover 360 px): tres filas con título y alcance + botones PDF/Excel/CSV.

### Wireframe 390

```
Reportes
[Asistente] [Descargar v]
[ Este mes · 1-19 oct v ]
[ Tipos v ] [ Ciclos v ]   (44 px alto)
+-----------------------------+
| Actividades 5 | Asist.   1  |
| Visit.     1  | Ocup.   2%  |
+-----------------------------+
Evolución (altura 160)
Por tipo (dona + lista)
Actividades destacadas
Cuándo viene la gente [Hora|Día]
Visitantes
```
"Descargar" abre un `Sheet` inferior con las 3 filas. KPIs 2x2 con celdas ≥ 72 px de alto.

## 4. Quick wins (≤ 1 h cada uno)

1. Pills de filtro y selects a `min-h-11 sm:min-h-9` (`ReportesDashboard.tsx:189,213,420,490,497,336`).
2. Quitar el eyebrow "REPORTES" del Asistente (`ReportsAgent.tsx:193`).
3. Cambiar el copy "matchee" (`apps/api-v2/src/services/reports/agent.ts:396`).
4. Rango en formato corto en leyenda y tarjeta ciclo (`ReportesDashboard.tsx:273-274`, `:414`).
5. Etiquetas KPI en `text-xs text-muted` sentence case y delta a 12 px (`:257,261`; mismo cambio en `PuertaStats.tsx:156,160`).
6. `aria-expanded`/`aria-haspopup` y cierre con Escape en los dos dropdowns (`:105-110,185-230`).
7. Estado vacío único con "Este mes" y "Quitar filtros" cuando el período no tiene datos (`ReportesDashboard.tsx` bajo los filtros; usar `ui/EmptyState`).
8. `aria-busy` y `Skeleton` en KPIs durante `loading` (`:249`).
9. Botón "Descargar Excel completo" de Puerta como `Button` secundario con `min-h-11` (`PuertaStats.tsx:262-263`).
10. Borrar `PeriodReport.tsx`, `AttendanceReport.tsx`, `ActivityReportCard.tsx` y sus tests (REP-U13), o confirmar que no se usan en otra rama.

## 5. Cambios estructurales

1. Panel único "Descargar" (Popover en desktop, Sheet en móvil) que fusiona SplitButton + `CategoryReport` + `MonthlyRegisterCard` y toma el ciclo del filtro global. Archivos: `ReportesDashboard.tsx`, `components/ui/arc/split-button/SplitButton.tsx`, `ui/Popover.tsx`, `ui/Sheet.tsx`.
2. Barra de filtros con kit (Popover + Chip + "Limpiar") compartida entre Reportes y Puerta, y extraída a `components/reportes/FilterBar.tsx`. Archivos: `ReportesDashboard.tsx`, `PuertaStats.tsx`, `ui/Popover.tsx`, `ui/Chip.tsx`.
3. Fusionar "Top actividades" e "Informe por actividad" en una lista clicable con detalle lateral (Sheet), y agrupar hora/día en una tarjeta segmentada. Archivos: `ReportesDashboard.tsx:292-364`, `ui/SegmentedControl.tsx`, `ui/Sheet.tsx`.

## Apéndice A. Capturas (`apps/web/e2e/.artifacts/reportes-ux/`)

Prefijo = viewport (1440, 820, 390). Todas de `/app/reportes` salvo indicación.

| Archivo (sufijo) | Qué muestra |
|---|---|
| `-01-reportes-top` | Primer viewport |
| `-02-reportes-full` | Página completa (en 390 la barra inferior fija aparece a media página: artefacto) |
| `-03-periodo-abierto` | Selector de período abierto |
| `-04-export-menu` | Menú "Otros formatos de exportación" |
| `-05-tipos-abierto` | Dropdown de tipos |
| `-06-ciclos-abierto` | Dropdown de ciclos |
| `-07-asistente-abierto`, `-07b-asistente-vacio-viewport` | Asistente recién abierto (`07` es fullPage y recorta el drawer; usar `07b`) |
| `-08-asistente-consulta`, `-08b-asistente-consulta-viewport` | Asistente con "asistencias de octubre" (usar `08b`) |
| `-09-vacio-top`, `-10-vacio-full` | `?from=2025-01-01&to=2025-01-07` |
| `-11-puerta-reportes-top`, `-12-puerta-reportes-full` | `/app/puerta/reportes` |
| `1440-13-reduced-motion` | Reportes con `prefers-reduced-motion: reduce` |

Script: `apps/web/e2e/.artifacts/reportes-ux.mjs` (y `ag.mjs`); datos crudos en `results.json`. Nota: `networkidle` nunca se alcanza en la pantalla (hay peticiones persistentes); los scripts esperan 3,5 s tras `domcontentloaded`.

## Apéndice B. Resultados

Axe (wcag2a, wcag2aa, wcag21aa): 0 violaciones en `/app/reportes` (3 viewports), vacío (3) y `/app/puerta/reportes` (3). Eso incluye contraste de `text-faint` (`--color-faint: #67697a`, 5,18:1 sobre la página según `globals.css:50`); el uso a 10 px es legal por contraste pero ilegible por tamaño (REP-U05).

Scroll horizontal: ninguno (scrollWidth = clientWidth en todos los viewports, ambas rutas). Alto de página: 1440 = 1697, 820 = 3150, 390 = 3602 px.

Targets < 44 px (alto x ancho):

| Viewport | Elementos |
|---|---|
| 390 Reportes | menú exportación 40x44, Todos los tipos 169x37, Todos los ciclos 175x37, select categoría 308x36, Excel 92x42, CSV 86x42, PDF 81x42, select Mes 113x36, select Año 75x36, Descargar Excel 159x40, select actividad 308x36 |
| 820/1440 Reportes | Asistente 119x42, Descargar PDF 153x42, menú 40x42, Período 233x40, pills 37, selects 36, enlaces 42/40 |
| Puerta (todos) | Registro 111x42, Exportar Excel 148x42, Período 233x40, pills de sala 35-37, "Descargar Excel completo" 158x15 (desktop) / 328x34 (390) |

Teclado (1440, 30 Tab): notificaciones, menú usuario, Asistente, Descargar PDF, menú de formatos (llega en el 5.º Tab), Período (6.º), Tipos, Ciclos, select ciclo, Excel, CSV, PDF, Mes, Año, Descargar Excel, select actividad, luego sidebar. Menú de exportación: items "Exportar Excel" y "Exportar CSV · asistencia por actividad" (rol `menuitem`).

Motion: con `reducedMotion: reduce`, `document.getAnimations().length = 0`; sin parpadeo de contenido en la captura `1440-13`.
