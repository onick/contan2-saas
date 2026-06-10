# Auditoría integral · v1 (referencia) → v2 (estado real y mejoras)
**Fecha:** 2026-06-10 · **HEAD auditado:** `multitenant @ 3f2b71b` · **v1:** producción intacta (`ccb.contan2.com`)

---

## 1. Veredicto ejecutivo

**v2 es un ALPHA sólido pero incompleto: cubre ~60% de la superficie funcional de v1 con mejor arquitectura, pero le faltan flujos completos que hoy son operación diaria en v1.** La calidad de lo construido es alta (tenant-scoping, RBAC, idempotencia, auditoría, 352 tests de integración en api-v2, contratos zod compartidos) — el problema no es calidad sino **cobertura**: hay bloques enteros de v1 sin equivalente en v2.

**Lo que ya está al nivel (o mejor) que v1:** check-in admin + público + scanner, actividades CRUD con portada, usuarios (lectura/edición/archivo/credencial), reportes asistencia (CSV/Excel/PDF sin Chromium), historial de auditoría, equipo con invariantes RBAC, identidad con contraste AA, segmentos-cohortes.

**Lo que falta y es operación diaria en v1 (bloqueantes de cutover):** crear visitante desde Usuarios, import/export masivo, invitaciones RSVP a actividades, invitar staff, recuperar contraseña, envío masivo de credenciales, platform admin, dominios custom, landing/contact.

---

## 2. Matriz de paridad v1 → v2 (por bloque funcional)

| # | Capacidad v1 (en producción) | Estado v2 | Gravedad del gap |
|---|---|---|---|
| 1 | **Auth staff** (login/logout/sesiones multi-device/lockout progresivo) | 🟡 login/logout OK; **falta forgot/reset password, lista+revocación de sesiones, lockout progresivo, change-password** (`mustChangePassword` existe pero sin endpoint) | **CRÍTICO** — sin reset de contraseña no se puede operar un tenant real |
| 2 | **Usuarios: crear** (`POST /api/users`) + **bulk import** Excel + **export** | 🔴 **NO EXISTE** `POST /users` en api-v2; botones "Nuevo usuario" y "Exportar" en `/app/usuarios` son **inertes** (page.tsx:71-72). Solo se crea visitante vía check-in inline | **CRÍTICO** — el padrón es de solo lectura/edición |
| 3 | **Credenciales**: PNG público (`GET /credentials/:code.png`), envío individual y **bulk-send hasta 1000** | 🟡 PNG + reenvío individual OK (con idempotencia, mejor que v1); **falta bulk-send y el endpoint público del PNG** | **ALTO** |
| 4 | **Invitaciones RSVP** a actividades (bulk invite + página pública `/rsvp/:token` + emails) | 🔴 **No existe nada** (tabla `invitations` ya está en la DB compartida) | **ALTO** — feature de campañas usada por el CCB |
| 5 | **Staff: invitar** (email+token 24h, página `/invite/:token`), eliminar, **transferir ownership** | 🟡 rol/suspender OK (mejor que v1: invariantes en tx); **falta invitar/aceptar, soft-delete y transferencia de ownership** | **ALTO** |
| 6 | **Reportes**: por actividad (XLSX/PDF con lista de asistentes) + por período con presets/preview/comparativo | 🟡 v2 tiene asistencia-por-actividad agregada (período); **falta el reporte por-actividad con asistentes (PII) y los presets/comparativo del de período** | **MEDIO-ALTO** |
| 7 | **Kiosko**: registro público + auto-enroll + email credencial + estados de cupo (FOMO/social-proof) + idle timeout | 🟡 kiosko v2 funcional; verificar paridad fina (idle 90s, estados de cupo, registro nuevo→email). Registro público existe (`POST /public/checkin` con visitor.new) | **MEDIO** |
| 8 | **Dashboard**: stats por período + selector + checkin-context live | 🟡 KPIs reales; **AttendanceChart/FeaturedActivity/TopActivities/RecentVisitors siguen con demoData** (chart estático "Este mes") | **MEDIO** — es la primera pantalla que ve el usuario |
| 9 | **Insights**: afinidad (OK en v2), **suggestions top-10, segments detallados con miembros+export+invitar segmento** | 🟡 v2 tiene cohortes con conteos; **falta detalle de segmento (miembros), export e "invitar segmento a actividad"** | **MEDIO** |
| 10 | **Registros**: listar + **crear asistencia manual + eliminar registro** | 🟡 listado real OK; **falta alta manual y borrado (con auditoría)** | **MEDIO** |
| 11 | **Dominios custom** + verificación DNS TXT | 🔴 No existe en v2 (v1 lo tiene self-service desde mayo) | **MEDIO** (un tenant lo usa) |
| 12 | **Platform admin** (cross-tenant: KPIs, tenants, suspender, audit global, login propio) | 🔴 No existe en v2 (era F8, congelada) | **MEDIO** — necesario para operar el SaaS, no para el tenant |
| 13 | **Landing pública** + contact form | 🔴 No existe en v2 (la `/` de web-v2 es skeleton) | **BAJO-MEDIO** |
| 14 | **Actividades: invitar usuarios + cancelación con email masivo a inscritos** | 🔴 cancelar estado existe; **sin email masivo a inscritos ni invitaciones** | **MEDIO** |
| 15 | Upload de logo (file picker → `/api/uploads/image`) | 🟡 v2 solo acepta URL; **falta endpoint de upload para logo** (el de portadas ya existe — reusar) | **BAJO** (quick win) |
| 16 | Timezone por tenant (`window.__tenant__.timezone`) | 🔴 v2 hardcodea `America/Santo_Domingo` | **BAJO hoy, CRÍTICO para SaaS multi-tenant real** |

**Conteo:** 4 bloques en paridad total, 8 parciales, 6 ausentes.

---

## 3. Hallazgos de calidad en v2 (lo que SÍ está mejor que v1)

1. **Arquitectura**: contratos zod compartidos (web↔api type-safe), Kysely parametrizado (SQLi-safe), BFF same-origin (api-v2 nunca expuesto al browser), guard único `requireTenantStaff` (orden tenant→auth→cross-tenant idéntico a v1).
2. **Tests**: 42 archivos / **352 tests de integración** contra Postgres real en api-v2 + ~397 en web (el patrón v1 casi no tiene tests de rutas). *(Corrección a la exploración: la afirmación "cero tests" era falsa — los tests viven en `apps/api-v2/test/`, no junto a las rutas.)*
3. **Escrituras transaccionales**: auditoría DENTRO de la tx (rollback total), idempotencia transaccional con TTL/reclaim (v1 la tiene más simple), capacidad atómica anti-oversell con test de concurrencia.
4. **Accesibilidad**: contraste AA calculado (`strongFill`/`textOn`), focus rings, aria-live, drawers accesibles — v1 no tiene nada equivalente.
5. **Reportes sin Chromium**: ExcelJS+PDFKit en streaming vs Puppeteer (~300MB) de v1 — decisión correcta para el VPS.
6. **Rate-limit con Redis + fallback** y claves sin PII (v1 es solo in-memory).

---

## 4. Deudas técnicas internas de v2 (inconsistencias a corregir)

| Deuda | Detalle | Esfuerzo |
|---|---|---|
| **ESLint placeholder** | `"lint": "echo 'lint placeholder…'"` en TODOS los packages/apps; CI "pasa" lint sin lintear nada | S — alto retorno |
| **Branding local vs API** | `getLocalBranding()` (config.ts, #e65100 hardcoded) se usa en todas las páginas para el AppShell aunque el layout ya tiene `gate.branding` real → el shell puede divergir del branding guardado | S-M |
| **Paginación mixta** | offset (users/activities/attendance) vs keyset (audit/team) — unificar criterio o documentar el porqué | M |
| **Colores hardcoded en chips** | `bg-[#fdeaea] text-[#c5221f]` etc. dispersos — no rompen branding pero ensucian | S |
| **TODO Redis C-C** | invalidación de cache pública del tenant comentada en activities.ts (2 sitios) — coherente con freeze, pero rastrear | — |
| **Búsqueda ILIKE %q%** | sin índice trigram (pg_trgm) — OK hasta ~10-50k filas/tenant; añadir índice GIN antes de tenants grandes | S (migración aditiva) |
| **Headers de seguridad** | api-v2 no setea HSTS/nosniff (v1 sí); hoy lo cubre Traefik — falta verificación explícita o helmet | S |
| **MAX_COVER_BYTES, grace, límites** | constantes sin env var — aceptable, documentar | — |
| **README/runbooks api-v2** | no hay README de cómo correr api-v2, ni ADRs de decisiones (keyset vs offset, Resend, PDFKit) | S |
| **Email single-provider** | Resend hardcoded, sin retry/backoff ni tracking de bounces; suficiente hoy, riesgo a escala | M (post-cutover) |

---

## 5. Mejoras sustanciales propuestas (priorizadas)

### P0 — Bloqueantes de cutover (sin esto, v2 no reemplaza a v1)
1. **Usuarios: `POST /users` + cablear "Nuevo usuario"** y quitar/cablear "Exportar" (reusar el CSV de reportes como export del padrón). *(El núcleo `checkinIdentified` ya crea usuarios — extraer y reusar.)*
2. **Auth completo**: forgot/reset password (tablas y servicio v1 ya existen — portar), change-password, lockout progresivo, lista+revocación de sesiones.
3. **Staff: invitar** (token + página `/invite/:token` + accept) — sin esto un tenant nuevo no puede armar equipo. *(Email puede ser dry-run hasta autorizar Resend.)*
4. **Credenciales: bulk-send + PNG público** (`GET /credentials/:code.png` con rate-limit 60/min como v1).
5. **Dashboard real**: serie semanal de asistencia (un endpoint `GET /dashboard/series?period=`), actividad destacada y últimos visitantes reales — es la cara de v2.

### P1 — Paridad de producto (lo que el CCB usa cada semana)
6. **Reporte por actividad con asistentes** (XLSX/PDF, owner/admin, PII) — el más usado en v1.
7. **Invitaciones RSVP**: bulk invite + página pública + emails (tabla ya existe).
8. **Registros: alta manual + eliminación auditada.**
9. **Import masivo de usuarios** (CSV/Excel con preview, como v1 `POST /users/bulk`).
10. **Segmento → acción**: detalle con miembros + export + "invitar segmento a actividad" (conecta cohortes con RSVP).
11. **Upload de logo** reusando el pipeline de portadas (quick win).

### P2 — SaaS-ready (después de cutover del tenant ancla)
12. **Platform admin v2** (F8): KPIs cross-tenant, gestión de tenants, audit global.
13. **Dominios custom** + verificación DNS (portar de v1).
14. **Timezone por tenant** (columna ya existe en orgs de v1 — propagar a formatos y métricas "hoy").
15. **Landing + onboarding de tenant nuevo** (signup → org → owner).
16. **Hardening**: ESLint real compartido, helmet/headers en api-v2, índices pg_trgm, email retry/backoff, SBOM/trivy en CI.

### P3 — Mejoras que v1 nunca tuvo (ventaja competitiva)
17. **MFA TOTP** (columnas `mfa_*` ya existen, cero endpoints en ambas).
18. **Jobs en background** (BullMQ sobre el Redis ya presente) para bulk emails y reportes pesados.
19. **Webhooks/integraciones** (notificar check-ins a sistemas del tenant).
20. **PWA/offline para kiosko y scanner** (hoy ambos mueren sin red — riesgo operativo real en eventos).

---

## 6. Riesgos transversales detectados

- **Doble fuente de verdad de branding** (config local vs API) — ya mitigado parcialmente (#90) pero `getLocalBranding` sigue alimentando el AppShell de cada página.
- **DB compartida v1/v2**: toda migración v2 debe seguir siendo aditiva y v1-compatible hasta el cutover (disciplina actual correcta — mantenerla).
- **Cobertura E2E browser**: el smoke autenticado existe (Playwright manual); falta suite E2E repetible en CI (Playwright tests reales, no screenshots).
- **46 ramas stale** en remoto (ruido operativo; limpiar cuando se autorice).

---

## 7. Hoja de ruta sugerida (si se ejecuta la auditoría)

| Sprint | Contenido | Resultado |
|---|---|---|
| **S1 (P0)** | POST /users + UI · auth forgot/reset/change/sessions · staff invite · credenciales bulk+PNG | v2 operable standalone para un tenant |
| **S2 (P0/P1)** | Dashboard real · reporte por actividad · registros manual/delete · upload logo | Paridad visible diaria |
| **S3 (P1)** | RSVP completo · import masivo · segmento→acción | Paridad de campañas |
| **S4 (P2)** | Platform admin · dominios custom · timezone · hardening (eslint/headers/índices) | SaaS-ready, candidato a cutover |

---
*Fuentes: exploración exhaustiva de `backend/src/{routes,services,middleware,db}` (20 routers, 20+ servicios, 26 migraciones), `frontend/*.js` (11 vistas admin + 5 superficies públicas + platform), y `apps/{api-v2,web}` + `packages/*` (42 endpoints, 11 páginas, 42 archivos de test). Correcciones aplicadas sobre los reportes de agentes: api-v2 SÍ tiene 352 tests de integración.*
