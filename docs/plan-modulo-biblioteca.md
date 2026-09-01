# Plan · Módulo Biblioteca (contan2 v2)

> **Estado:** APROBADO en dirección · decisiones cerradas 2026-08-08 (§7)
> **Alcance de este documento:** plan de producto + arquitectura + fases. Cero código todavía.
> **Origen:** requisitos levantados con Ely (gestión real de biblioteca, no solo catálogo).

---

## 1 · Visión y encaje en la plataforma

**Biblioteca** es un nuevo vertical del SaaS: cualquier tenant (centro cultural, museo,
fundación) puede activarlo; el primer usuario real es la biblioteca del CCB. No es una
app aparte — es un módulo de la plataforma v2 (apps/web + api-v2), y esa es su mayor
ventaja competitiva frente a un Koha/software de biblioteca genérico:

| Ya existe en la plataforma | Lo que le da a Biblioteca |
|---|---|
| **Padrón único de personas** (`users`) con credencial QR | El lector ES el mismo visitante de actividades: **un solo carné** para todo el centro. Cero re-registro. |
| **Scanner** (cámara, jsQR) + consola de check-in | Base de la circulación por escaneo (prestar/devolver en segundos) y del inventario físico con celular. |
| **RBAC por rol + gate del layout** (patrón rol `puerta`) | Rol `biblioteca` enjaulado a su módulo en un día de trabajo, no una semana. |
| **Auditoría** (`tenant_audit_log`) | "Quién prestó/devolvió/modificó y cuándo" — requisito de administración — ya resuelto. |
| **Motor de reportes** (period-summary, PDF branded HTML→Chromium, Excel, rango libre de fechas) | El dashboard de estadísticas de biblioteca reusa los mismos componentes y tuberías. |
| **Asistente de Reportes** (agente en español) | "¿Cuáles fueron los libros más prestados en marzo?" = un intent nuevo. |
| **Resend** (email transaccional branded) | Avisos de vencimiento/reserva lista. WhatsApp queda con slot listo (decisión pendiente del usuario). |
| **RLS activo en prod** + `withTenant` | Aislamiento multi-tenant a nivel Postgres para todas las tablas nuevas. |
| **Import masivo** (patrón import de contactos) + **uploads** | Catálogo por CSV/Excel con dry-run; portadas de libros. |
| **Feature flag de build** (patrón `NEXT_PUBLIC_PUERTA_ENABLED`) | Construir y probar en prod sin exponer hasta el lanzamiento. |

**Principio rector:** primero el modelo de datos y la circulación (el corazón operativo);
el catálogo público (OPAC) después, sobre datos ya sanos.

---

## 2 · Decisiones de dominio (las que definen todo lo demás)

**D1 · Título ≠ Ejemplar (la distinción central del requisito).**
`biblio_titles` (la obra bibliográfica: *Cien años de soledad*, una sola ficha) tiene N
`biblio_items` (las copias físicas: cada una con código de inventario propio, ubicación,
estado e historial). Toda la circulación opera sobre **ejemplares**; el catálogo público
y las reservas operan sobre **títulos**.

**D2 · Lector = persona del padrón (no tabla paralela).**
El perfil de lector es una **extensión** de `users` (`biblio_member_profiles`), igual que
protocolo extiende el padrón con `protocol_profiles`. Consecuencias buenas: el carné es la
credencial QR ya emitida (el scanner actual ya lo lee), el historial cultural completo de
la persona vive junto (actividades + biblioteca → segmentos más ricos), y la dedup por
email/teléfono ya construida aplica. Datos sensibles del perfil (notas internas,
suspensiones) quedan gated por rol.

**D3 · Estado físico ≠ disponibilidad.**
`physical_status` del ejemplar (bueno / deteriorado / en reparación / perdido / dado de
baja) es un dato **explícito**; la **disponibilidad** (disponible / prestado / reservado)
es **derivada** de los préstamos y reservas activos. Nunca se guardan las dos cosas en un
mismo campo — es la fuente clásica de estados imposibles ("prestado" y "disponible" a la
vez). Baja lógica siempre (el historial del ejemplar nunca se borra).

**D4 · Circulación como ledger inmutable.**
`biblio_loans` es un registro de movimientos que solo se agrega: préstamo → renovaciones
(contador + fechas) → devolución (o pérdida/daño). Un préstamo activo = fila sin
`returned_at`. Vencido = derivado (`due_at < now()` sin devolución), como el fix de
auto-finalize: **calculado, no un flag que alguien olvida poner**. La consulta en sala es
un movimiento `kind='sala'` (cuenta estadística, no bloquea el ejemplar más allá del día).

**D5 · Políticas por (tipo de material × tipo de lector).**
Tabla `biblio_loan_policies`: días de préstamo, renovaciones máximas, ítems simultáneos,
si es prestable a domicilio o solo consulta en sala, si es reservable. El staff las
configura; los defaults sensatos vienen sembrados. Los bloqueos (lector suspendido, tope
de ítems, vencidos acumulados) se validan en el servidor al prestar.

**D6 · Reserva por título, asignación por ejemplar.**
La cola de espera (`biblio_reservations`) es FIFO por título. Al devolverse un ejemplar
con cola, pasa a `ready` para el primero, se le notifica, y la reserva **expira** en N
días si no la retira (configurable). El ejemplar en `ready` no es prestable a otros.

**D7 · Clasificación flexible.**
Dewey + signatura topográfica como campos de texto con validación suave (formato
sugerido, no impuesto) — las bibliotecas reales tienen históricos imperfectos. El
sistema de clasificación es configurable por tenant (Dewey por defecto).

**D8 · El ISBN trabaja para el staff.**
Al catalogar: se escanea o tipea el ISBN → autocompletado de título, autores, editorial,
año, portada vía **OpenLibrary** (gratis, sin key) con fallback **Google Books**. Server-side
y cacheado en la DB (un ISBN se consulta una sola vez). Catalogar 200 libros deja de ser
escribir 200 fichas.

**D9 · Ubicación en dos niveles: sitio → estante.**
La realidad del CCB tiene **3 sitios** (Biblioteca, Censo Pérez, Almacén KM23) y, dentro
de la Biblioteca, el conteo operativo es **por estante**. El ejemplar guarda
`site_id + estante + colección`; las donaciones pueden ingresar a cualquiera de los 3
sitios; el inventario físico se puede acotar por sitio o por estante. Los sitios son una
tabla editable por tenant (sembrada con los 3 del CCB), porque "sigue creciendo" aplica
también a los espacios.

---

## 3 · Modelo de datos (borrador — ~9 tablas nuevas, prefijo `biblio_`)

Todas: `organization_id` + política RLS `tenant_isolation` (patrón mig 047) + migraciones
aditivas e idempotentes (DB-first → deploy, runbook vigente).

| Tabla | Esencia |
|---|---|
| `biblio_titles` | Obra: kind (libro/revista/tesis/audiovisual/documento/periódico), ISBN/ISSN, título, subtítulo, autores (jsonb), editorial, año, edición, idioma, materias (text[]), palabras clave, dewey, signatura base, descripción, cover_url, adjuntos (jsonb), soft-delete. |
| `biblio_sites` | Sitios físicos del tenant (sembrados CCB: **Biblioteca · Censo Pérez · Almacén KM23**), editables; activo/inactivo. |
| `biblio_items` | Ejemplar: title_id, **código de inventario único por org** (barcode), ubicación = **site_id + estante + colección**, physical_status, signatura propia, acquisition_id?, notas, baja lógica con motivo/acta. |
| `biblio_member_profiles` | Perfil de lector sobre `users`: **member_type (empleado / no empleado)**, y si es empleado: **employee_code + employee_name** (como figura en RRHH); status (activo/suspendido/vencido), suspended_until, notas internas (gated), joined_at. |
| `biblio_loan_policies` | (material_kind × member_type) → días, renovaciones máx, tope simultáneo, domicilio sí/no, reservable sí/no. |
| `biblio_loans` | Ledger: item_id, user_id, staff que presta/recibe, kind (domicilio/sala), loaned_at, due_at, renewals, returned_at, lost/damaged con notas. |
| `biblio_reservations` | title_id, user_id, status (en_cola/lista/cumplida/cancelada/expirada), posición, notified_at, expires_at, item asignado al pasar a lista. |
| `biblio_acquisitions` | Pipeline: kind (compra/donación/sugerencia), status (solicitado→aprobado→comprado→recibido→catalogado), proveedor, costo, factura, procedencia, **site_id de ingreso** (las donaciones entran por cualquiera de los 3 sitios), requested_by (lector que sugirió), title_id al catalogar. |
| `biblio_inventory_sessions` | Inventario físico: abierta/cerrada, alcance (**sitio / estante** / colección), acta generada, totales. |
| `biblio_inventory_scans` | Escaneos de la sesión: item_code, visto_en (ubicación), timestamp → los **diffs** (faltantes, fuera de lugar, no catalogados) se calculan, no se tipean. |
| *(cache)* `biblio_isbn_cache` | Respuestas de OpenLibrary/Google Books por ISBN. |

Búsqueda: normalización sin acentos (la infra `category-norm`/translate ya existe) +
índices. Con **6,000+ títulos y creciendo** (dato real del CCB), `pg_trgm` va desde el
día 1 (extensión estándar de Postgres, migración propia) y todas las listas son
paginadas; el import masivo procesa por lotes con dry-run.

---

## 4 · Fases y prioridades (imprescindible / deseable / lujo)

### F1 · Fundación + Catálogo — IMPRESCINDIBLE
Migraciones + contratos + rol `biblioteca` (RBAC + gate + flag de build). CRUD de
títulos y ejemplares, autofill por ISBN, portadas, búsqueda staff (título/autor/ISBN/
materia/colección con filtros), etiquetas de código de barras imprimibles (PDF por la
tubería existente), **import CSV/Excel con dry-run** y reporte de errores, export.

### F2 · Lectores + Circulación — IMPRESCINDIBLE (el corazón)
Perfil de lector sobre el padrón + carné (QR existente; imprimible). Consola de
circulación: **escanear carné → escanear libro → prestado** (y el inverso para
devolver), renovaciones, políticas y bloqueos, vencidos automáticos (job diario, patrón
auto-finalize), consulta en sala, perdidos/dañados, historial por ejemplar y por lector.

### F3 · Estadísticas — IMPRESCINDIBLE (temprana, crece con el resto)
Dashboard estilo Reportes (mismos componentes): títulos/ejemplares totales, préstamos
por período con **comparación vs período anterior**, rango de fechas libre, más
prestados / nunca prestados, por colección/materia/tipo de lector, consultas en sala,
vencidos, export Excel/PDF branded. + Intent de biblioteca en el **Asistente de
Reportes** ("libros más prestados en marzo").

### F4 · OPAC (catálogo público) — DESEABLE ALTA
Superficie pública por tenant (patrón kiosko: tenant por host, cero leaks de admin,
rate-limit + anti-enumeración): búsqueda simple y avanzada, disponibilidad en tiempo
real, ficha con portada y ubicación, "más de este autor/materia", **reservar** con
carné + verificación por email, mobile-first. *(Recomendación: mockup hi-fi antes de
construir esta UI — regla de diseño de la casa.)*

### F5 · Reservas + Alertas — DESEABLE
Cola de espera completa (D6), aviso de devolución próxima, vencido, y reserva lista —
por email (Resend, plantillas editables por tenant) con registro de comunicaciones.
WhatsApp: slot listo, se activa cuando el usuario decida (decisión ya tomada de
posponerlo).

### F6 · Adquisiciones + Inventario — DESEABLE
Pipeline de adquisiciones (compras/donaciones/sugerencias desde el OPAC), costos y
facturas, historial. Inventario físico: sesión + escaneo con celular + diffs
automáticos + acta PDF + baja de ejemplares sin perder historial.

### Lujo (backlog explícito)
Listas y colecciones temáticas, novedades y recomendaciones en el OPAC, favoritos,
enlace con el módulo de **Actividades** (club de lectura = actividad con asistencia, ya
existe), import MARC/Z39.50, multi-sede, carné físico con diseño branded (Sprint C de
branding lo habilitará).

---

## 5 · Contornos técnicos

- **Monorepo v2**: rutas api en `apps/api-v2/src/routes/biblio-*.ts` + servicios; UI en
  `apps/web/app/app/biblioteca/**` + `components/biblioteca/`; OPAC en superficie
  pública separada. Contratos Zod en `packages/contracts`. PRs chicos sobre
  `multitenant` (workflow vigente), suite completa antes de cada push.
- **Escaneo de códigos**: el scanner actual lee QR (jsQR). Los ISBN/EAN-13 son barcode
  1D → incorporar `@zxing/browser` (lee EAN-13 **y** QR) solo en las superficies de
  biblioteca; los carnés siguen siendo QR.
- **Etiquetas**: generación de planchas de etiquetas (código de barras + signatura) en
  PDF por la tubería HTML→Chromium existente.
- **Jobs**: vencimientos y expiración de reservas en el runner de jobs existente
  (patrón auto-finalize; derivado + idempotente).
- **Seguridad**: RLS en todo, PII de lectores gated, auditoría en circulación y bajas,
  cero deletes duros, OPAC con los guardrails del kiosko. Responsive: circulación
  desktop/tablet, OPAC mobile-first, inventario mobile.

## 6 · Orden de construcción propuesto (PRs)

1. **PR-0** Spec fino de F1+F2 (spec-kit) + mockup hi-fi de circulación y catálogo.
2. **F1**: migs+contratos+rol/flag → CRUD títulos/ejemplares + búsqueda → ISBN autofill
   + portadas → import/export + etiquetas. (~4 PRs)
3. **F2**: perfil lector + políticas → prestar/devolver/renovar con escaneo → bloqueos
   + vencidos + historial. (~3 PRs)
4. **F3**: dashboard + intent del Asistente. (~2 PRs)
5. **F4→F6** según lo aprendido operando F1-F3 con datos reales del CCB.

Cada fase termina con: suite completa verde, smoke en staging, migraciones a prod solo
con OK, y flag apagado hasta el lanzamiento del módulo.

## 7 · Decisiones cerradas (respuestas del usuario · 2026-08-08)

1. **Lectores = padrón único: SÍ.** Un solo carné QR para actividades y biblioteca (D2).
2. **Interno primero, OPAC después: SÍ.** F1–F3 operando con el equipo de Ely antes de
   abrir el catálogo al público (F4).
3. **Volumen: 6,000+ títulos y creciendo.** → pg_trgm desde el día 1, paginación en
   todas las listas, import por lotes (§3).
4. **Ubicaciones: 3 sitios + estantes.** Sitios: **Biblioteca, Censo Pérez y Almacén
   KM23** (las donaciones ingresan por cualquiera). Dentro de la Biblioteca, el conteo
   operativo es **por estante** → modelo de dos niveles sitio→estante (D9); el
   inventario físico se acota por sitio o estante.
5. **Tipos de lector: empleado / no empleado.** El perfil de empleado lleva
   **nombre y código de empleado** (campos dedicados, como figura en RRHH); las
   políticas de préstamo por defecto se siembran para ambos tipos.
