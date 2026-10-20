# Auditoría y plan · Módulo Puerta (salas permanentes) · 2026-10-20

Alcance: código de `integration` (HEAD `3fbdce5`) y lectura (solo GET) de staging `https://ccb.stg.contan2.com` con las sesiones de owner y de `puerta` (esta última renovada una vez con el setup de Playwright). No se tocó código de producto ni ninguna base de datos. No se usó producción. No se corrieron los specs e2e. **No se llamó al export de Puerta en staging**: ese GET escribe una fila en `tenant_audit_log` (`puerta.exported`, `routes/puerta.ts:327`), así que se revisó solo en código y en tests.

Insumos: memorias `project_permanent_spaces_plan`, `project_puerta_role`, `project_offline_door_plan`, `project_kiosko_companions_rule`, `project_scanner_v1_surface`; `docs/plans/2026-10-16-qa-consolidado.md` (Q8-05, Q8-13, Q8-16, Q8-38/39/40, Q8-55, H3, H6), `outputs/qa/2026-10-16-q4-reportes-protocolo-puerta.md` (B10), `docs/plans/2026-10-19-auditoria-reportes.md` (REP-A01, REP-A21, REP-A24/25) y `docs/plans/2026-10-16-decisiones-owner.md` (6.3, 6.5, P1–P5).

---

## 1. Resumen ejecutivo

1. La Puerta funciona y está bien encaminada: registro en 4 modos (nuevo, carné/QR, grupo, anónimo), agenda de la Sala VR con correo real, reportes propios en personas y export con alcance por sala. El RBAC y los estados de error de octubre (bea8b37, PR-4, PR-10) ya están en el código.
2. **No hay S0 en el código.** Producción no se verificó (regla de esta auditoría). Según la decisión 6.1, el hotfix RBAC salió a prod el 16-oct.
3. **S1 · operación (PUE-A01):** registrar no es idempotente y no se puede deshacer. Si la red falla sin respuesta, el registro se pierde o se duplica al reintentar, y el rol `puerta` no tiene cómo corregirlo (borrar es solo de owner/admin desde Registros).
4. **S1 · datos (PUE-A02):** las salas se cuelan en las superficies de eventos: Inicio, el contador "Check-in hoy", el de "Actividades activas" y la lista de Actividades. Desde ahí se pueden editar o finalizar, y eso rompe la Puerta. Contradice la decisión P1 ("solo en Puerta").
5. **S1 · agenda (PUE-A03):** la agenda no tiene máquina de estados. La API deja cancelar una reserva que ya asistió y confirmar una cancelada (vuelve a mandar el correo). El check-in no está protegido contra carreras y se puede hacer desde la reserva de cualquier día.
6. **S2 · producto:** no hay botón "No vino", así que la "tasa de asistencia" del reporte da siempre 100 % o "—". Tampoco se puede reprogramar ni editar desde la UI, y el detalle (correo, teléfono, notas) no se ve en ningún lado.
7. **S2 · tablet (el dispositivo real):** los botones principales de la puerta tienen texto blanco sobre `#f39228` (2,35:1) y sobre `#2f9fd6` (2,98:1), por debajo de AA. Hay controles frecuentes de 32–40 px. A 820 px las tarjetas van en una sola columna, con la barra lateral fija, y la agenda queda fuera de la pantalla.
8. **S2 · seguridad:** operator y consulta pueden bajar por API el Excel de la Puerta, con nombres y carnés (contradice la decisión 6.3). La búsqueda del padrón que usa la Puerta le devuelve el correo al rol `puerta`, que no lo necesita.
9. Offline: el plan de junio (PWA completa) sigue sin construirse. **Recomiendo primero una versión mínima de "resiliencia"**: idempotencia, cola local y reintento, sin service worker. Recién después, la PWA, si el dueño confirma que la red de las salas se cae.
10. El plan son 9 bloques (PR-P1…P9) para agentes Sonnet, ordenados por valor y riesgo. P1–P3 cierran los S1, P4 trae el patrón lista + detalle y P8 es el offline mínimo. Hay 5 preguntas cerradas al dueño.

---

## 2. Mapa del módulo

### 2.1 Pantallas y flujos

```
/app/puerta  (page.tsx → PuertaBoard, solo cliente, sondeo de /salas cada 20 s)
├─ [Registrar en ambas salas]  (botón chico, solo si hay ≥ 2 salas)
├─ Tarjeta por sala (Ada Balcácer · Sala VR)
│   ├─ Visitantes hoy (personas) · Últimos 7 días
│   ├─ Reservas de hoy (solo lectura: hora, grupo, cantidad, estado)
│   └─ [Registrar entrada] → RegisterSheet (drawer)
│        ├─ pestaña Nuevo visitante → sugerencias del padrón ("Usar" = identificado) → POST registrar mode=new|identified
│        ├─ pestaña Buscar / QR → PuertaIdentify (buscar nombre · Escanear con cámara · tipear código) → mode=identified
│        ├─ pestaña Grupo → tipo (Colegio/Comunitario/Empresa/Otro) + responsable + N → mode=group
│        └─ [Registrar sin datos (anónimo)] → mode=anonymous (+ acompañantes)
└─ VrAgenda (solo salas con aforo ≤ 200, o sea la VR)
    ├─ [Nueva reserva] → POST bookings (scheduled)
    ├─ lista por día desde hoy: [Confirmar] (correo) · [Check-in] · [X cancelar]
    └─ toggle "Mostrar canceladas"

/app/puerta/reportes  (SSR "Este mes" + PuertaStats en cliente)
├─ DateRangePicker · pastillas de sala · SplitButton "Exportar Excel" (rango) / "Excel completo"
└─ KPIs (personas, entradas, en grupo, identificados) con delta · evolución · por sala · grupos · composición · agenda VR · por hora · por día
```

### 2.2 Endpoints (BFF → api-v2) y roles

| BFF `/app/puerta/api/…` | API `/api/v2/puerta/…` | Rol (API) | Archivo |
|---|---|---|---|
| `GET salas` | `GET /salas` | cualquier staff (`requireTenantStaff`) | `routes/puerta.ts:53` |
| `POST registrar` | `POST /registrar` | `DOOR_WRITE_ROLES` (owner, admin, operator, puerta) · 180/min por org+IP | `routes/puerta.ts:105` |
| `POST salas/[id]/occupancy` | `POST /salas/:id/occupancy` | `DOOR_WRITE_ROLES` · **ya no lo usa la UI** | `routes/puerta.ts:225` |
| `GET export` | `GET /export.xlsx` | `PADRON_READ_ROLES` (+ operator, consulta) · comparte el limitador con registrar | `routes/puerta.ts:250` |
| `GET stats` | `GET /stats` | `PADRON_READ_ROLES` | `routes/puerta-stats.ts:39` |
| `GET/POST bookings` | `GET/POST /bookings` | GET `PADRON_READ_ROLES`; POST `DOOR_WRITE_ROLES` · 120/min | `routes/puerta-bookings.ts:69,100` |
| `PATCH bookings/[id]` | `PATCH /bookings/:id` (confirm/cancel/no_show/reschedule) | `DOOR_WRITE_ROLES` · sin limitador | `routes/puerta-bookings.ts:144` |
| `POST bookings/[id]/checkin` | `POST /bookings/:id/checkin` | `DOOR_WRITE_ROLES` · sin limitador | `routes/puerta-bookings.ts:187` |
| (ajeno) `GET /app/check-in/api/visitors` | `GET /checkin/visitors` | `VISITOR_SEARCH_ROLES` | `routes/checkin.ts:210` |

Flag: el BFF lee `PUERTA_ENABLED` en runtime (`lib/puerta/flag.ts:7`), pero las páginas usan la constante de build `PUERTA_ENABLED` (`app/app/puerta/page.tsx:19`, `reportes/page.tsx:24`, `lib/shell/nav.ts:38`). La API no mira el flag (decisión 6.11 pendiente).

Rol `puerta` en la UI: `ROLE_NAV_ALLOWLIST.puerta = {puerta, registros, protocolo, reportes, cuenta}` (`lib/shell/nav.ts:88`). Verificado en staging con su sesión: 200 en `/app/puerta`, `/app/puerta/reportes`, `/app/registros`, `/app/reportes`, `/app/protocolo` y `/app/cuenta`; 307 → `/app/puerta` en usuarios, actividades, check-in, historial, equipo, identidad y biblioteca.

### 2.3 Datos

- `activities` con `is_permanent=true`, `capacity` (Ada 100000 = "ilimitada", VR 8), `occupancy` (contador viejo), `open_schedule` (**sin uso** en el código), `audience` (infantil → los acompañantes van como niños).
- `attendance`: una fila por entrada y por sala, con `is_permanent=true` denormalizado (mig 044: el índice único parcial excluye las salas, así que cada re-entrada cuenta), `group_label/kind/level/contact` y `companions_children/adults`. Personas = `1 + niños + adultos`.
- `space_bookings` (mig 041/043/045): sin FK a `activities` ni a `attendance`, **sin RLS** (047 no la incluye; 048 solo le da grants).
- `users`: el modo `new` crea al visitante o lo reutiliza (busca por correo y después por teléfono normalizado) y suma `visit_count`.

Migraciones relacionadas: `backend/src/db/postgres/migrations/041_permanent_spaces.sql`, `043_space_bookings_fix_types.sql`, `044_attendance_permanent_reentry.sql`, `045_group_kind.sql`, `046_staff_role_puerta.sql`, `047_rls_tenant_isolation.sql`, `048_app_v2_grants.sql`. La próxima libre es la **056**.

### 2.4 Qué comparte y qué duplica

| Comparte (bien) | Duplica (deuda) |
|---|---|
| Buscador del padrón `searchCheckinVisitors` → `/checkin/visitors` | El alta de visitante con reintento por colisión de código está en 6 lugares (`puerta.ts:161`, `checkin-core.ts:108`, `users.ts:591`, `users-import.ts:295`, `activity-guests-import.ts:172`, `biblio-readers.ts:183`) |
| Cámara + jsQR del check-in (`CheckinScanModal` → `useQrCamera`): **el QR se escanea en la propia puerta**, sin depender del escáner | La normalización de teléfono está en `puerta.ts:152` y en `public.ts:61` |
| `@contan2/codes`, `resendSend`, branding de correo, `excel-kit`, gráficos `charts/*`, `DateRangePicker`, `SplitButton`, `NumberField` | `puerta-stats.ts:36,73-80` reescribe `PEOPLE`, `winGe`/`winLt` y la base que ya existen en `services/puerta-kpis.ts` |
| `checkin_idempotency` (tabla genérica con `endpoint`), hoy solo para el +1 anónimo del check-in | La heurística `AFORO_MAX = 200` está dos veces en la API (`puerta.ts:31`, `puerta-stats.ts:21`) y en la UI se usa para decidir el **tipo** de sala (`salaColors.ts:7`, `PuertaBoard.tsx:100`, `:151`) |
| `REPORT_TZ` (`services/timezone.ts`) | `booking-email.ts:13` y `VrAgenda.tsx:16` dejan la zona horaria escrita a mano |

---

## 3. Hallazgos

Severidad: S0 = fuga, pérdida de datos o caída en prod · S1 = dato incorrecto o una operación diaria que falla · S2 = defecto visible con desvío posible · S3 = deuda o pulido. Esfuerzo: S ≤ ½ día · M 1–2 días · L > 2 días.

### PUE-A01 · S1 · Registrar no es idempotente ni se puede deshacer
- **Evidencia:** `POST /puerta/registrar` inserta sin clave de idempotencia (`routes/puerta.ts:179-210`). La UI frena el doble clic solo con el estado `busy` (`PuertaBoard.tsx:53`), que en un mismo frame puede quedar viejo. Ante un fallo de red muestra "Problema de red." y descarta (`:63`). No hay endpoint para anular una entrada de la Puerta: `DELETE /attendance/:id` es solo para `MANAGER_ROLES` (`routes/attendance.ts:180-185`). Los registros de la Puerta **no se auditan** (no hay `writeCheckinAudit` ni `tenant_audit_log` en `registrar`). En cambio, `/checkin/anonymous` ya resuelve esto con `checkin_idempotency` (`routes/checkin.ts:346-395`).
- **Impacto:** con wifi intermitente, una respuesta que se pierde termina en un registro perdido o duplicado. El encargado no puede corregir su propio error, así que KPIs, `visit_count` y Excel quedan inflados sin rastro.
- **Corrección:** header `Idempotency-Key` en `registrar` (clave por sala: `endpoint = 'puerta.registrar:<salaId>'`, mismo patrón y TTL de 24 h). La UI genera la clave por intento y la reutiliza al reintentar, con un botón "Reintentar" en el toast. Agregar auditoría `puerta.registered` y `DELETE /puerta/entries/:id` ("Deshacer", que el mismo staff puede usar hasta 10 min y owner/admin siempre, con auditoría `puerta.voided`, sin descontar `visit_count`, en paridad con Registros). **M.**

### PUE-A02 · S1 · Las salas permanentes se mezclan con los eventos fuera de Reportes
- **Evidencia:**
  - `GET /shell/summary`: `activeActivities` cuenta las salas (`routes/shell.ts:32-33`) y `checkinsToday` suma las visitas de la Puerta (`:36-41`). En staging da `activeActivities: 3`; según la lista de Actividades, 2 de ellas son las salas.
  - `services/dashboard-overview.ts:74-88`: el Inicio suma asistencias de cualquier actividad.
  - `GET /activities` no filtra `is_permanent` (`routes/activities.ts:80-88`). En staging, el HTML de `/app/actividades` incluye "Ada Balcácer" y "Sala VR" con capacidad `100000`.
  - Ninguna ruta de Actividades bloquea editar o cambiar el estado de una sala. Si alguien la finaliza o la cancela, la Puerta la pierde, porque `loadPermanentSala` exige `status='activa'` (`puerta.ts:47`). Si le sube la capacidad a la VR por encima de 200, esta pasa a "Sala de exposición" y pierde la agenda (`salaColors.ts:7`).
- **Impacto:** el Inicio y el contador de la barra no cuadran con Reportes (que ya excluye las salas, `services/reports/scope.ts`). Contradice P1. Una edición casual desde Actividades deja la puerta inoperativa.
- **Corrección:** un predicado `eventActivity()` (reusar `reportableActivity` sin la condición de canceladas) en `shell.ts`, `dashboard-overview.ts`, `dashboard-metrics.ts` y en la lista/búsqueda de `activities.ts`. Responder 409 al `PATCH` de estado/capacidad/fecha de una actividad `is_permanent` ("Esta es una sala permanente: se gestiona desde Puerta"). En el Inicio, una tarjeta aparte "Salas hoy: N personas" que enlace a Puerta. Registros sigue mostrándolas, con un filtro "Salas/Eventos". **M.**

### PUE-A03 · S1 · La agenda no tiene máquina de estados y el check-in tiene carrera
- **Evidencia (`routes/puerta-bookings.ts`):**
  - El `PATCH` aplica `cancel`, `no_show`, `reschedule` y `confirm` desde cualquier estado (`:158-180`). Se puede cancelar una reserva `attended` (queda con `attendance_id`), confirmar una `cancelled` y reprogramar una `attended`.
  - `confirm` manda el correo cada vez que se llama, aunque `notified_at` ya esté puesto (`:169-179`), y lo hace dentro de la transacción (la conexión queda tomada mientras se espera a Resend).
  - Check-in: lee `attendance_id` (`:195-198`) y después inserta sin `WHERE attendance_id IS NULL` (`:204-217`). Dos toques concurrentes, en READ COMMITTED, crean **dos** filas de asistencia.
  - Se puede hacer el check-in de una reserva de **cualquier día**: la UI ofrece "Check-in" en todas las no terminales (`VrAgenda.tsx:203-208`) y la entrada queda con la hora de ahora.
  - No hay auditoría de confirmar, cancelar, check-in ni reprogramar (solo de `booking.created`, `:132`).
  - Sin FK, borrar la asistencia deja la reserva `attended` con un `attendance_id` colgado.
- **Evidencia (staging):** la reserva de julio en estado `attended` (Sala VR, 200 alumnos) aparece en el embudo como "Asistieron 1 · Personas esperadas 201", pero en julio los KPIs dan `groupPeople: 0` y `entries: 1` (una persona identificada). Su asistencia ya no existe.
- **Corrección:** una tabla de transiciones permitidas (`scheduled→confirmed|cancelled|no_show|attended`, `confirmed→cancelled|no_show|attended`, `no_show→attended` para el que llega tarde, y nada desde `attended`/`cancelled` salvo "reabrir" para owner/admin), aplicada con `UPDATE … WHERE status = ANY(:desde) RETURNING`. Check-in con `UPDATE … SET attendance_id=:id WHERE id=:id AND attendance_id IS NULL AND status IN (…) RETURNING` **antes** de insertar. El correo solo se manda si `notified_at IS NULL` o si hubo reprogramación, y fuera de la transacción. Check-in fuera del día de la reserva → 409 con `force: true` explícito ("La reserva es del jueves 22; ¿registrar igual hoy?"). Auditar todas las transiciones. Migración 056: FK `space_bookings.attendance_id → attendance(id) ON DELETE SET NULL` (y al borrar la asistencia, el estado vuelve a `confirmed`). **M.**

### PUE-A04 · S2 · Faltan en la UI de la agenda: "No vino", reprogramar, editar y detalle
- **Evidencia:** `act()` acepta `no_show`, pero no hay ningún botón que lo dispare (`VrAgenda.tsx:203-210`). `reschedule` existe en la API y no en la UI. No hay forma de editar una reserva (contacto, cantidad, notas). El correo, el teléfono y las notas no se muestran (`:199-200`). La lista arranca hoy (`puerta-bookings.ts:89`): las reservas de días pasados que nunca se marcaron desaparecen de la vista y quedan "Agendada/Confirmada" para siempre. Cancelar es una X sin confirmación (`:209`).
- **Impacto:** la "Tasa de asistencia" de Reportes (`attended/(attended+no_show)`, `puerta-stats.ts:172`) da 100 % o "—" siempre (staging: `attendedPct: 100` con 1 de 1). El encargado no puede corregir una reserva ni ver con quién comunicarse.
- **Corrección:** lista + **DetailPanel** "Detalle de la reserva" (contacto con `tel:`/`mailto:`, notas, historial creada/confirmada/avisada) con acciones Confirmar · Check-in · No vino · Reprogramar · Editar · Cancelar (con diálogo de confirmación). Vista "Pendientes de cerrar" con las reservas de días pasados sin desenlace. Cierre automático opcional a `no_show` al final del día (decisión del dueño, P-3). **M.**

### PUE-A05 · S2 · Los botones principales de la puerta no pasan AA
- **Evidencia:** `DoorButton` fija `text-white` (`components/puerta/DoorButton.tsx:35`) sobre `bg-brand` = `#f39228` en staging (token leído del HTML de `/app/puerta`), con un contraste de **2,35:1**. El tono VR `#2f9fd6` da **2,98:1** (`:22`). El kit ya usa `bg-brand text-brand-fg` (6,75:1) desde ff8021b. El comentario de `DoorButton` todavía habla de `#e65100`.
- **Impacto:** el botón que más se toca en la tablet, "Registrar entrada", es difícil de leer con luz de sala. Además incumple WCAG 1.4.3.
- **Corrección:** `text-brand-fg` para el tono marca. Para VR, `bg-info-text` (`#1d7aa7`, 4,78:1 con blanco) o un token `--color-sala-vr` validado en claro y oscuro. Test de contraste. **S.**

### PUE-A06 · S2 · Objetivos táctiles chicos y diseño de una columna en la tablet de 820 px
- **Evidencia:**
  - `Button size="sm"` = `min-h-8` (32 px): pestañas del drawer, tipos de grupo, "Usar", "Confirmar", "Registrar sin datos" y "Registrar en ambas salas" (`PuertaBoard.tsx:79,247,271,297,326`; `VrAgenda.tsx:206`).
  - `IconButton sm` = 36 px: "Cancelar reserva" y cerrar el drawer.
  - `DoorButton sm` = 36 px ("Check-in" de la reserva).
  - Los botones de `NumberField md` = 40 px.
  - La grilla de salas es `lg:grid-cols-2` (`PuertaBoard.tsx:85`): a 820 px van una debajo de la otra, con la barra lateral de ~230 px fija (captura `e2e/.artifacts/q7/shots/tablet-820/app-puerta.png`), y la agenda queda debajo del pliegue.
  - El toast vive arriba de la página (`:68-75`): si scrolleaste hasta la VR, no lo ves.
  - El botón para cerrar el toast no tiene `aria-label` (`:72`).
- **Corrección:** en la Puerta, mínimo 44 px (Button `md`, IconButton `md`, NumberField tamaño `kiosk` en los contadores). Grilla `md:grid-cols-2` con tarjetas compactas. Toast fijo abajo (`fixed bottom`, `role=status`) con "Deshacer" (PUE-A01). Opción "Modo puerta" (barra lateral colapsada por defecto en `/app/puerta`). `aria-label="Cerrar aviso"`. **M.**

### PUE-A07 · S2 · "Buscar / QR" puede seleccionar a otra persona
- **Evidencia:** `resolveCode()` busca por texto y, si no hay coincidencia exacta del código, **toma el primer resultado** (`PuertaIdentify.tsx:57`: `?? r.data.items[0]`). La búsqueda es por ILIKE sobre código, nombre, correo y teléfono: en staging, `q=CCB-` devuelve 12 personas.
- **Impacto:** si alguien tipea un código parcial o con un error, puede quedar elegida otra persona. Hay una tarjeta de confirmación, pero con apuro se registra la visita (y `visit_count`) a la persona equivocada.
- **Corrección:** con un código escaneado o tipeado (que pasa `isValidCode` de `lib/scanner/code.ts`), exigir coincidencia exacta. Si no hay, mostrar "No encontramos ese código" y ofrecer "Buscar por nombre". Agregar un test unitario (hoy `PuertaIdentify` no tiene ninguno). **S.**

### PUE-A08 · S2 · Excel de la Puerta y búsqueda: más PII de la necesaria
- **Evidencia:**
  - `GET /puerta/export.xlsx` usa `PADRON_READ_ROLES` (`puerta.ts:252`), así que **operator y consulta** lo descargan por API, con el nombre y el carné de cada visitante (`puerta-export.ts:85-93`). La decisión 6.3 reserva las exportaciones a owner/admin/puerta (`REPORT_EXPORT_ROLES`).
  - La búsqueda del padrón le devuelve `email`, `protocol` e `invitedTo` al rol `puerta` (staging, sesión `puerta`: `q=CCB-` → 12 ítems con las claves `code,email,firstName,id,invitedTo,lastName,protocol,visitCount`). La UI de la Puerta solo muestra nombre, código y visitas.
- **Corrección:** el export con `REPORT_EXPORT_ROLES` (de `rbac-roles.ts`). Una proyección "puerta" en `/checkin/visitors` para ese rol (sin `email`, `protocol` ni `invitedTo`), con el mismo patrón que la proyección restringida de protocolo (`checkin.ts:215-218`). Test de RBAC. **S.**

### PUE-A09 · S2 · El tipo de sala se adivina por la capacidad
- **Evidencia:** `AFORO_MAX = 200` en la API (`puerta.ts:31`, `puerta-stats.ts:21`). En la UI, `aforo !== null` decide el color, la etiqueta "Realidad virtual" o "Sala de exposición", el ícono (un **QR** para la VR, `PuertaBoard.tsx:110`) y si la sala tiene agenda (`:151`). La API acepta reservas para Ada (en staging hay 12 reservas [E2E] para Ada) que la UI no deja ver ni gestionar, pero que aparecen en "Reservas de hoy" y en el embudo "Agenda VR" con "Ambas salas".
- **Impacto:** una tercera sala (p. ej. infantil, con aforo 30) aparecería como "Realidad virtual" con agenda. El embudo mezcla reservas que nadie puede gestionar. No escala a otro tenant.
- **Corrección:** migración 056 con columnas explícitas en `activities`: `sala_kind` (`exposicion|vr|otra`), `has_agenda` y `aforo` nullable (que deje de reutilizar el `capacity` de 100000). La API devuelve `kind`/`hasAgenda`. La agenda se generaliza (`SalaAgenda`) y la crean solo las salas con `has_agenda`. El `POST /bookings` responde 409 si la sala no tiene agenda. **M.**

### PUE-A10 · S2 · Reportes de la Puerta: un error al refrescar es silencioso
- **Evidencia:** `PuertaStats.tsx:64-68`: si el fetch falla o responde distinto de 2xx, se queda con `data` de antes, pero `range`/`sala` ya cambiaron. Las etiquetas muestran el período nuevo con las cifras viejas (es un estado engañoso, como Q8-13).
- **Corrección:** estado de error con "Reintentar" y revertir el filtro, o atenuar las cifras con el aviso "No pudimos actualizar". Test con fetch 500. **S.**

### PUE-A11 · S2 · No hay aviso de "ya entró hoy" ni anónimos con acompañantes invisibles
- **Evidencia:** cada entrada cuenta (es lo decidido), pero no hay ninguna señal si la misma persona se registra dos veces en minutos (doble escaneo o doble toque). Aparte, en la pestaña Grupo el botón "Registrar sin datos" manda `companions: comp`, un número que se ajustó en otra pestaña y que en la de Grupo no se ve (`PuertaBoard.tsx:326`).
- **Corrección:** la respuesta de `registrar` trae `lastEntryToday` (hora) cuando el visitante identificado ya entró hoy a esa sala. La UI pide confirmar si fue hace menos de 15 min ("Entró a las 10:32. ¿Registrar otra entrada?") y avisa en los demás casos. Resetear `comp` al cambiar de pestaña o mostrar el contador al lado del botón anónimo. **S.**

### PUE-A12 · S2 · Correo de la reserva: sin aviso de cancelación o cambio, sin rebotes y con respuesta incierta
- **Evidencia:** solo existe el correo "Visita confirmada" (`booking-email.ts:45-69`). No se avisa al cancelar ni al reprogramar, no hay recordatorio y no hay manejo de rebotes (no existe un webhook de Resend en `apps/api-v2/src`). El texto dice "responde este correo", pero `replyTo` depende de `organizations.email_reply_to` (`:118`); no se verificó si en prod está configurado (si no lo está, la respuesta va al remitente). La zona horaria está fija (`:13`) y no viene de `REPORT_TZ`.
- **Corrección:** plantillas de cancelación y reprogramación (las dispara la misma lógica idempotente de PUE-A03). Recordatorio opcional el día anterior (decisión del dueño). Registrar `send_error` en la reserva y mostrar "✉ no se pudo enviar" en el detalle. `REPORT_TZ`. **M.**

### PUE-A13 · S3 · Rendimiento y limpieza de la API
- `/puerta/salas` hace 3 consultas **por sala** en serie (`puerta.ts:66-98`), y la UI lo sondea cada 20 s, incluso con la pestaña oculta (`PuertaBoard.tsx:48`). Hoy tarda 0,31 s (mediana), así que no duele, pero se arregla con un `GROUP BY activity_id` y `document.visibilityState`. **S.**
- La búsqueda por teléfono hace `regexp_replace` sobre todo el padrón del tenant en cada alta (`puerta.ts:149-155`). Con 2000 usuarios va bien; a escala conviene un índice funcional de dígitos (o una columna `phone_digits`). **S.**
- `puerta-stats.ts` duplica `puerta-kpis.ts` (ver §2.4) y hace 9 consultas en serie: se podrían paralelizar con `Promise.all`. **S.**
- `POST /occupancy` y `activities.occupancy` quedaron sin uso desde R4 (staging: VR `occupancy: 8` congelado). Borrarlos o marcarlos como obsoletos. **S.**
- `open_schedule` existe y no se usa. **S.**
- `space_bookings` no tiene RLS (047 no la incluye): agregarle `tenant_isolation` (patrón 047) en la 056. **S.**
- El limitador `puertaLimiter` es el mismo para registrar y para exportar (`puerta.ts:111,256`): separarlos. **S.**
- `GET /bookings?from=YYYY-MM-DD` usa `new Date()`, o sea medianoche UTC y no de RD (`puerta-bookings.ts:84-87`). La UI no lo usa todavía, pero va a doler en la vista "pendientes". **S.**
- Las páginas usan el flag de build y el BFF el de runtime: unificar en `puertaEnabled()`. **S.**

### PUE-A14 · S3 · Semántica y textos de los KPIs
- "Visitantes identificados" es `count(distinct user_id)` (personas únicas). Las otras tres tarjetas son personas-visita (`puerta-kpis.ts:42`): rotularlo "Personas únicas identificadas".
- Con "Ambas salas", un grupo registrado en las dos cuenta dos veces en "Personas" (correcto como visitas a sala). El subtítulo debería decir "visitas a sala (una persona en dos salas cuenta dos veces)".
- El delta compara con "el período anterior de igual duración" (`puerta-stats.ts:52`), mientras que Reportes, por la decisión P4, compara "Este mes" con el mismo tramo del mes anterior. Alinear (o explicarlo en el texto).
- El aviso de aforo de la reserva compara `studentCount > aforo` (`VrAgenda.tsx:108`) y no `1 + studentCount`, como pedía PR-10.
- El grupo walk-in arranca en 30 alumnos y la reserva en 8 (`PuertaBoard.tsx:185`, `VrAgenda.tsx:29`). Propuesta: 0 con foco en el campo, o el último valor usado.

### PUE-A15 · S3 · Tests que faltan
- **API:** concurrencia del check-in de la reserva (dos `POST` en paralelo → 1 fila); matriz de transiciones; `confirm` dos veces → un solo correo; `registrar` con `Idempotency-Key` repetida; ventanas de "hoy" a las 23:30 y 00:10 de RD en `/salas` (`visitorsToday`); 429 de los limitadores; operator/consulta en `export.xlsx` (debe dar 403 después de PUE-A08); `PATCH` de una actividad `is_permanent` → 409 (PUE-A02).
- **Web:** `PuertaIdentify` (código exacto, no encontrado, escaneo); `RegisterSheet` (payloads de cada pestaña, reset de acompañantes); `DoorButton` (contraste); `PuertaStats` con un refetch que falla.
- **e2e:** el spec actual (`pue-puerta.spec.ts`, 471 líneas, PUE-01…04) cubre bien la API. Agregar: "Deshacer", "No vino", el detalle de la reserva en tablet-820 y la ausencia de las salas en Inicio y Actividades.
- No hay `@ts-nocheck` ni TODO en el módulo. Ningún archivo de Puerta pasa de 400 líneas (`PuertaBoard.tsx` 357, `puerta.ts` 351). `PuertaBoard` mezcla tablero, drawer y formularios: conviene separar `RegisterSheet` cuando entre el detalle (PR-P4).

### Hallazgos de operación (sin número propio, ya cubiertos arriba)
- **Velocidad por registro:** un anónimo sin acompañantes son 2 toques (abrir el drawer y el botón fantasma del final). Un carné por QR son 4 (abrir, pestaña "Buscar / QR" porque arranca en "Nuevo", Escanear, Registrar). Por grupo, ~6 campos. Propuesta en PR-P5: recordar la última pestaña usada y un acceso directo "+1 anónimo" en cada tarjeta (con idempotencia, como el +1 del check-in).
- **Teclado numérico:** `NumberField` editable usa `inputMode="numeric"` (`NumberField.tsx:180`). Los acompañantes no se editan a mano (solo con +/−, hasta 10): está bien.
- **Latencia:** mediana de 0,31 s para `/salas` y de 0,26 s para `bookings` (ver el apéndice). No se midió `POST registrar` (sería una escritura); por código hace entre 3 y 6 consultas y una transacción.
- **Errores legibles:** los 400 de la API son genéricos ("Datos de registro inválidos."); los 404 y 409 son claros. El 429 tiene texto en español, pero no informa `retryAfter` y la UI no lo diferencia de otros errores.

---

## 4. Verificación de datos (staging, GET, 2026-10-20 ~13:45 UTC)

La API de staging incluye al menos `24a6e4e` (la respuesta trae `exportRowCap`), aunque `/api/version` informa `buildSha 9488f3e` (probablemente sea el SHA de build de la web, desactualizado: hay que verificarlo antes de usarlo como gate). El padrón está anonimizado. Las asistencias [E2E] fueron limpiadas por el teardown.

| Consulta | Resultado | Lectura |
|---|---|---|
| `GET /app/puerta/api/salas` (owner) | Ada Balcácer: `aforo null`, `audience adultos`, hoy 0, semana 0 · Sala VR: `aforo 8`, `audience infantil`, `occupancy 8`, hoy 0, semana 0 · `todayBookings: []` | `occupancy 8` es el contador viejo congelado (PUE-A13). Las reservas de hoy están todas canceladas y se filtran bien |
| `GET stats 2026-10-01..20` | KPIs en 0 · reservas `cancelled: 22` · `attendedPct null` · `exportRowCap 50000` | 22 reservas [E2E] canceladas: falta la purga acordada en las decisiones del 16-oct |
| `GET stats 2025-10-20..2026-10-20` (366 días) | `people 3`, `entries 1`, `identified 1`, `groupPeople 0` · Ada 1/3, VR 0/0 · hora 12 → 3 · reservas: `attended 1`, `cancelled 22`, `peopleExpected 201`, `attendedPct 100` | **Incoherencia:** 1 reserva "asistió" (201 personas) sin la asistencia de grupo correspondiente (PUE-A03, falta de FK) |
| `GET stats julio` | Igual que el año: 1 registro identificado de 3 personas; la reserva `attended` de 200 alumnos sin asistencia | Confirma la reserva huérfana (`attendanceId` presente, fila borrada) |
| `GET stats agosto / septiembre` | todo en 0 | Staging sin uso real |
| `GET bookings` (sin rango) | 8 reservas, las 8 `cancelled` (6 VR, 2 Ada), [E2E] | Ada tiene reservas que la UI no muestra (PUE-A09) |
| `GET bookings` (2025-01..2027-12) | 29: 28 `cancelled` + 1 `attended` · 17 VR, 12 Ada · 9 con correo · `notifiedAt` 0 · alumnos: 1, 3, 6, 15, 40, 200 | Ningún correo marcado como enviado en staging (por dry-run o por ser dominio de test: no verificado) |
| `GET /shell/summary` (owner) | `activeActivities 3`, `checkinsToday 0`, `protocolPending 7` | `activeActivities` incluye las 2 salas (PUE-A02) |
| HTML `/app/actividades` (owner) | contiene "Ada Balcácer" ×5, "Sala VR" ×5, `100000` ×3 | Las salas se listan como actividades (PUE-A02) |
| Rol `puerta`: páginas | 200 en puerta, puerta/reportes, registros, reportes, protocolo y cuenta · 307 en las 7 restantes | Coincide con la allowlist |
| Rol `puerta`: `GET /app/check-in/api/visitors?q=CCB-` | 200, 12 ítems con `email`, `protocol`, `invitedTo` | Más PII de la necesaria (PUE-A08) |
| Rol `puerta`: `GET salas / bookings / stats / reportes summary` | 200 los cuatro | Lo esperado |
| Producción | **no verificada** (regla de esta auditoría). Memoria del 29-jul: Sala VR 26 entradas / 39 personas en julio; `space_bookings` vacía en ese momento | — |

No se verificó en vivo: `POST registrar`, `PATCH`/`checkin` de reservas, export (porque escriben), correo real ni la cámara QR en una tablet física.

---

## 5. Producto: qué le falta al departamento de salas

Ordenado por valor sobre costo. Lo que necesita decisión del dueño lleva **[D]**.

| # | Necesidad | Valor | Costo | Bloque |
|---|---|---|---|---|
| 1 | **Deshacer** el último registro (10 min) y aviso de "ya entró hoy" | Alto (datos limpios sin pedirle al admin) | S–M | PR-P2 |
| 2 | Agenda completa: No vino, reprogramar, editar, detalle, "pendientes de cerrar" | Alto (la tasa de asistencia hoy no sirve) | M | PR-P3/P4 |
| 3 | **Cierre del día / del turno**: personas por sala y por franja de 1 h, grupos del día, reservas que no llegaron, botón "Excel del día" e impresión | Alto (es lo que el depto entrega cada día o mes) | M | PR-P7 |
| 4 | Grupos con institución recurrente: autocompletar el nombre del colegio con los ya registrados (evita "Colegio X" y "Col. X") y guardar el contacto del responsable en el walk-in | Medio-alto (reportes por colegio confiables) | M | PR-P7 |
| 5 | Agenda también para Ada Balcácer (visitas guiadas de colegios) **[D]** | Medio | S después de PR-P6 (generalizar la agenda) | PR-P6 |
| 6 | Sesiones de la VR con cupo por turno (8 gafas): franjas fijas y aviso de solape **[D]** | Medio | M | PR-P3 (aviso de solape) + futuro |
| 7 | Configuración de salas self-service (crear o editar una sala permanente: tipo, horario, agenda, aforo) | Medio (hoy se siembran por SQL; bloquea un 2.º tenant) | M | PR-P9 |
| 8 | Constancia de visita en PDF para el colegio | Medio-bajo | M | futuro |
| 9 | Aforo real (presentes, con salida) | Bajo para Ada; medio para VR **[D]** | L | futuro |
| 10 | Pantalla pública de ocupación | Bajo | M | futuro |

---

## 6. Plan por bloques (agentes Sonnet)

Reglas comunes: una rama por bloque desde `integration`. Suite completa de api y web antes de push (memoria `feedback_run_full_suite_before_push`). Una sola corrida de Playwright a la vez. Las migraciones las aplica el usuario o el orquestador en staging y después en prod, verificadas con SELECT (runbook). Gate humano en push, merge y deploy.

### PR-P1 · `fix/puerta-fuera-de-eventos` · S1 · M · (PUE-A02)
- **Archivos:** `apps/api-v2/src/services/reports/scope.ts` (exportar `eventActivity()`), `routes/shell.ts`, `services/dashboard-overview.ts`, `routes/dashboard-metrics.ts`, `routes/activities.ts` (lista, búsqueda, `PATCH`/estado → 409 si `is_permanent`), `apps/web/components/dashboard/*` (tarjeta "Salas hoy" con enlace a Puerta), `apps/web/app/app/registros/*` (filtro Salas/Eventos, opcional).
- **Aceptación:** con una sala que tiene 5 personas hoy, `/shell/summary.checkinsToday` y el Inicio no las cuentan. `activeActivities` excluye las salas. `/app/actividades` no las lista. `PATCH /activities/<sala>` → 409 con el texto de Puerta. La tarjeta "Salas hoy" muestra 5. Tests de integración para cada punto. e2e ADM con el Inicio en verde.

### PR-P2 · `feat/puerta-registro-idempotente` · S1 · M · (PUE-A01, PUE-A11)
- **Archivos:** `routes/puerta.ts` (Idempotency-Key con `checkin_idempotency`, una clave por sala; auditoría `puerta.registered`; `lastEntryToday`), nueva ruta `DELETE /puerta/entries/:id` (mismo staff ≤ 10 min, o MANAGER; auditoría `puerta.voided`), `packages/contracts` (respuesta con `entryIds`, `lastEntryToday`, `replay`), BFF `app/app/puerta/api/entries/[id]/route.ts`, `PuertaBoard.tsx` (clave por intento, "Reintentar" con la misma clave, toast fijo abajo con "Deshacer", reset de acompañantes por pestaña).
- **Aceptación:** dos POST con la misma clave → 1 fila por sala y la segunda devuelve `replay: true`. Un fallo de red simulado y "Reintentar" no duplican. "Deshacer" a los 5 min → 200, la fila desaparece de stats y se audita; a los 11 min para el rol puerta → 403. Un identificado que entró hace 3 min → la UI pide confirmar. Tests de API y de web. e2e PUE-01* sigue en verde.

### PR-P3 · `fix/puerta-agenda-estados` · S1 · M · migración 056 · (PUE-A03, PUE-A12 parcial)
- **Archivos:** `backend/src/db/postgres/migrations/056_puerta_bookings_integrity.sql` (FK `attendance_id → attendance(id) ON DELETE SET NULL`, columna `email_error TEXT`, RLS `tenant_isolation` en `space_bookings`, todo idempotente; antes, limpiar los huérfanos con `UPDATE … SET attendance_id=NULL, status='confirmed' WHERE attendance_id NOT IN (…)` **con OK del dueño**), `routes/puerta-bookings.ts` (transiciones con `UPDATE … WHERE status = ANY(…) RETURNING`, check-in con reclamo atómico, check-in fuera del día → 409 salvo `force`, correo fuera de la transacción y solo si `notified_at IS NULL` o hubo reprogramación, auditoría de todas las acciones, limitador en PATCH/checkin), `services/booking-email.ts` (plantillas de cancelación y reprogramación, `REPORT_TZ`), contratos (`force`, `edit`).
- **Aceptación:** matriz de transiciones probada (pares inválidos → 409). Dos check-ins en paralelo → 1 asistencia. `confirm` ×2 → 1 correo. Borrar la asistencia de una reserva → la reserva vuelve a `confirmed`. Staging: después de la limpieza, el embudo de julio deja de mostrar "Asistieron 1 / 201".

### PR-P4 · `feat/puerta-lista-detalle` · S2 · M · (PUE-A04; aquí entra el patrón lista + detalle)
- **Archivos:** `components/puerta/VrAgenda.tsx` → `SalaAgenda.tsx` con `DetailLayout` + `DetailPanel` (`components/ui/DetailPanel.tsx`): "Detalle de la reserva" (cabecera con grupo, fecha y estado; cuerpo con contacto `tel:`/`mailto:`, notas e historial; acciones Confirmar · Check-in · No vino · Reprogramar (DateRangePicker en modo fecha + hora) · Editar · Cancelar con confirmación). Nuevo `components/puerta/EntradasHoy.tsx`: lista "Entradas de hoy" por sala (hora, quién o grupo, personas, quién registró) + `DetailPanel` "Detalle de la visita" con "Deshacer" (de PR-P2). Pestaña o filtro "Pendientes de cerrar" (reservas de días pasados sin desenlace). Separar `RegisterSheet` en su propio archivo.
- **Endpoints nuevos:** `GET /puerta/entries?date=` (entradas del día, sin correo ni teléfono).
- **Aceptación:** a 820 px el detalle se abre como hoja inferior; a 1440, como columna. "No vino" mueve la tasa de asistencia en Reportes. Las reservas de ayer sin desenlace aparecen en "Pendientes". Tests unitarios de los paneles. e2e PUE-02* + un detalle nuevo en tablet-820.

### PR-P5 · `fix/puerta-tablet-a11y` · S2 · S–M · (PUE-A05, PUE-A06, PUE-A07, operación)
- **Archivos:** `DoorButton.tsx` (`text-brand-fg`, tono VR con AA), `PuertaBoard.tsx` (`md:grid-cols-2`, botones de 44 px, `aria-label` en el cierre, la pestaña inicial recuerda la última usada (localStorage con try/catch), acceso "+1 anónimo" por tarjeta con idempotencia), `PuertaIdentify.tsx` (código exacto, sin `items[0]`), `NumberField` tamaño `kiosk` en los contadores de la puerta, barra lateral colapsada por defecto en `/app/puerta` (si el AppShell lo permite sin tocar otras páginas).
- **Aceptación:** axe sin violaciones de contraste en `/app/puerta`. Ningún control interactivo de la Puerta mide menos de 44 px (test de tamaños como el de `PuertaStats.test.tsx:29`). Un código parcial → "No encontramos ese código". Capturas a 820 y 390 (skill `contan2-responsive-smoke`).

### PR-P6 · `fix/puerta-datos-seguridad` · S2 · M · migración 057 · (PUE-A08, PUE-A09, PUE-A10, PUE-A13)
- **Archivos:** `routes/puerta.ts` (export con `REPORT_EXPORT_ROLES`, limitador propio, `/salas` agregado sin N+1), `routes/checkin.ts` (proyección "puerta" de `/checkin/visitors`), `057_sala_kind.sql` (`sala_kind`, `has_agenda`, `aforo` nullable en `activities`, con backfill: Ada → `exposicion`, sin agenda, aforo null; VR → `vr`, con agenda, aforo 8), quitar `AFORO_MAX` de API y UI, `salaColors.ts` por `kind`, `POST /bookings` → 409 si la sala no tiene agenda, `PuertaStats.tsx` (estado de error al refrescar), `puerta-stats.ts` (reusar `puerta-kpis`, `Promise.all`), `page.tsx` con `puertaEnabled()`, `GET /bookings` con YMD en `REPORT_TZ`, borrar `POST /occupancy` (o 410).
- **Aceptación:** operator/consulta → 403 en `export.xlsx`. El rol puerta no recibe `email` en la búsqueda (pero las sugerencias de duplicado siguen funcionando). Una 3.ª sala de prueba con aforo 30 y `kind=otra` no aparece como VR. Un refetch con 500 → aviso. Mismos números en `/salas` antes y después.

### PR-P7 · `feat/puerta-cierre-del-dia` · producto · M
- **Archivos:** `routes/puerta-stats.ts` o una ruta nueva `GET /puerta/day-summary?date=` (personas por sala y franja horaria, grupos, reservas no llegadas, quién registró), `components/puerta/CierreDelDia.tsx` (vista imprimible con `@media print`, botón "Excel del día" reusando el export con `from=to=date`), autocompletar de grupos (`GET /puerta/groups?q=` con los distintos `group_label` del tenant).
- **Aceptación:** el resumen del día cuadra con `/stats?from=to=hoy`. La impresión entra en una hoja A4. El autocompletar no devuelve PII.

### PR-P8 · `feat/puerta-resiliencia-offline` · versión mínima · M (si el dueño la aprueba, P-4) · depende de PR-P2
- **Alcance mínimo, sin service worker:** cola local en IndexedDB (con try/catch y fallback en memoria) para los registros `anonymous`, `group` e `identified` de un **código ya conocido**, cada uno con su `Idempotency-Key`. Indicador "Sin conexión · N pendientes" en la cabecera de la Puerta. Reenvío automático al volver `online` y cada 15 s. "Nuevo visitante" se encola con sus datos: el servidor ya hace find-or-create y el código se asigna al sincronizar. Búsqueda por nombre y agenda desactivadas sin red, con un texto claro. Las cifras "Visitantes hoy" muestran "datos de las 10:32".
- **Fuera de alcance (fase 2):** service worker y manifest para abrir la Puerta sin red (precache del shell de `/app/puerta`), cache del padrón para buscar sin conexión y sincronización en segundo plano.
- **Aceptación:** con DevTools offline, registrar 3 anónimos y 1 grupo; al reconectar, se ven 4 filas y ninguna duplicada (aunque se reintente 3 veces). Recargar la página con pendientes no los pierde. Test unitario de la cola y e2e con `context.setOffline(true)`.
- **¿Sigue siendo la prioridad correcta?** Para la Puerta, la red cae menos que en los eventos grandes: es una sala fija dentro del CCB. Lo que más pesa hoy es la **pérdida o duplicación con red intermitente**, y eso lo resuelve PR-P2 + la cola de PR-P8 sin una PWA. La PWA completa (fase 2) solo tiene sentido si el dueño confirma cortes reales en las salas o si la quiere para el check-in de eventos (el plan de junio). Mi recomendación: P2 ya, P8 mínimo después de P3, y la PWA solo con evidencia de cortes.

### PR-P9 · `feat/salas-config` · producto · M · después de PR-P6
- Página de gestión de salas permanentes (owner/admin): crear o editar nombre, tipo, audiencia, aforo, horario (`open_schedule`, que por fin se usaría para marcar "fuera de horario" en los reportes) y agenda sí/no. Desactivar sin borrar el histórico. Habilita un 2.º tenant sin SQL.

**Orden y paralelismo:** PR-P1 ∥ PR-P2 (no se pisan) → PR-P3 → PR-P4 (necesita P2 y P3) ∥ PR-P5 → PR-P6 → PR-P7 → PR-P8 → PR-P9. P5 toca `PuertaBoard.tsx` igual que P2 y P4: coordinar (P5 después de P2, y P4 separa `RegisterSheet` primero).

**Aviso al CCB cuando salga PR-P1:** el Inicio y el contador "Check-in hoy" van a bajar (ya no suman las salas), y las salas dejan de aparecer en Actividades.

---

## 7. Preguntas al dueño (cerradas)

- **P-1.** ¿La sala **Ada Balcácer** también necesita agenda de reservas (visitas guiadas de colegios), igual que la VR? *(sí / no — recomendación: sí, sale casi gratis con PR-P6.)*
- **P-2.** ¿El rol `puerta` puede **deshacer** sus propios registros durante 10 minutos (queda auditado), o solo owner/admin desde Registros? *(10 min para puerta / solo admin — recomendación: 10 min.)*
- **P-3.** Las reservas que pasan sin check-in, ¿se marcan solas como **"No vino"** al cierre del día, o las cierra el encargado a mano desde "Pendientes"? *(automático / manual — recomendación: manual con recordatorio en "Pendientes", para no ensuciar datos con check-ins tardíos.)*
- **P-4.** En la práctica, ¿se cae internet en las salas? *(a) sí, a menudo → PR-P8 + PWA fase 2; (b) a veces → solo PR-P8 mínimo; (c) casi nunca → solo PR-P2 — recomendación: (b).*
- **P-5.** ¿La **Sala VR** trabaja por turnos fijos (p. ej. tandas de 8 cada 30 min) que la agenda deba respetar, con aviso de solape? *(sí, con duración de N min / no, horario libre como hoy.)*

---

## Apéndice A · Tiempos (staging, owner, 3 corridas, mediana en negrita)

| Ruta | Corrida 1 | 2 | 3 | Mediana |
|---|---|---|---|---|
| `GET /app/puerta/api/salas` | 0,31 s | 0,52 s | 0,30 s | **0,31 s** |
| `GET /app/puerta/api/stats` (1–20 oct) | 0,26 s | 1,06 s | 0,30 s | **0,30 s** |
| `GET /app/puerta/api/stats` (366 días) | 0,40 s | 0,33 s | 0,42 s | **0,40 s** |
| `GET /app/puerta/api/bookings` | 0,25 s | 0,26 s | 1,43 s | **0,26 s** |
| `GET /app/puerta` (HTML) | 1,55 s | 0,52 s | 0,43 s | **0,52 s** |
| `GET /app/puerta/reportes` (HTML) | 0,48 s | 0,50 s | 0,71 s | **0,50 s** |
| `GET /app/check-in/api/visitors?q=mar` (rol puerta) | 0,27 s | 0,53 s | 0,32 s | **0,32 s** |

Los picos aislados de ~1 s aparecen en varias rutas: parecen de la red o del VPS, no de la consulta. `/app/puerta` no trae las salas en el SSR (`initial={[]}`), así que la tarjeta aparece después de un segundo viaje de ~0,3 s.

## Apéndice B · Comandos usados (sin secretos)

- Sesiones: un script local convierte `apps/web/e2e/.auth/{owner,puerta}.json` en un header `Cookie` guardado en el scratchpad con permisos 600 (no se imprimen valores).
- Renovación de la sesión de puerta (una vez): `cd apps/web && E2E_ROLES=puerta E2E_WORKERS=1 npx playwright test -c e2e/playwright.config.ts --project=setup` → "setup puerta: login ok".
- Lecturas: `curl -s -o <archivo> -H "Cookie: …" -w "%{http_code} %{time_total}s" "https://ccb.stg.contan2.com/<ruta>"` para `/app/puerta/api/{salas,stats?from&to,bookings[?from&to]}`, `/app/api/shell/summary`, `/app/check-in/api/visitors?q=…`, las páginas HTML y `/api/version`. Los resúmenes se sacaron con `python3 -I` contando claves y estados, sin volcar nombres, correos ni teléfonos.
- Contraste: fórmula WCAG de luminancia relativa sobre los tokens leídos del HTML (`--color-brand:#f39228`, `--color-brand-fg:#1f2326`) y el hex de `DoorButton`.
- Código: lectura de los archivos citados y `git diff --stat 9488f3e HEAD` sobre el módulo, para entender qué hay en staging.
