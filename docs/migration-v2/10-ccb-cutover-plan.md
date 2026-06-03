# 10 · Plan de cutover real de CCB (`ccb.contan2.com` → v2)

> Plan específico para apuntar `ccb.contan2.com` al stack v2 (`contan2-web-v2-prod`),
> derivado del estado del canary (docs 08/09). **Nada ejecutado.** El cutover no se
> hace hasta OK explícito del operador.
>
> Estado de partida (2026-06-03): `web-v2-prod` fqdn = `https://app.contan2.com`;
> app v1 fqdn = `https://ccb.contan2.com, admin.contan2.com, contan2.com, www.contan2.com`.

## 0 · Hechos clave (medidos)

1. **`app.contan2.com` valida el STACK v2, pero NO sirve como canary real de CCB.**
   El subdominio `app` está en `RESERVED_SUBDOMAINS` (`apps/api-v2/src/tenant.ts`) →
   no resuelve tenant → las superficies públicas caen a **demo fallback** y api-v2
   devuelve 404 para `x-forwarded-host: app.contan2.com`.
2. **Para CCB real, el host que resuelve el tenant es `ccb.contan2.com`** (subdominio
   `ccb` → `findOrgBySlug('ccb')`). Validado: `x-forwarded-host: ccb.contan2.com` →
   200 contra api-v2-prod.

## 1 · Cambio exacto (Coolify/Traefik)

Traefik rutea por **regla de Host**. El cutover determinista recomendado:
- **(A) Switch:**
  1. Quitar `https://ccb.contan2.com` del **fqdn de la app v1** (queda `admin, contan2, www`).
  2. Agregar `https://ccb.contan2.com` al **fqdn de `contan2-web-v2-prod`** (queda `app, ccb`).
  - Coolify regenera los labels Traefik de ambas apps → `ccb.contan2.com` rutea a v2.
- **(B) Overlap por prioridad (NO recomendado):** agregar `ccb.contan2.com` a v2 con
  prioridad de router mayor, sin tocar v1. Frágil: dos routers con `Host(ccb.contan2.com)`
  es comportamiento dependiente de prioridad y Coolify no expone `priority` limpio por API.

## 2 · ¿Se remueve de v1 o coexiste?

**No hay coexistencia limpia** de dos apps con el mismo `Host` sin priority/Traefik manual
→ es un **switch**: se remueve `ccb.contan2.com` de v1 y se agrega a v2 (opción A). Esto
implica **un cambio de config en v1** (quitar un dominio), reversible en segundos — el
único punto donde el cutover toca v1.

## 3 · admin.contan2.com

**Queda en v1, sin cambios.** `admin` es subdominio reservado en v2 → no resuelve tenant
y v2 no tiene superficie platform-admin todavía.

## 4 · contan2.com / www

**Quedan en v1, sin cambios.** Son `marketing` (landing) en v2, no tenant.

## 5 · Smoke antes/después

- **Antes (validado):** `app.contan2.com`→v2 (demo) · `ccb.contan2.com`→v1.
- **Después del switch, sobre `ccb.contan2.com` (ahora v2):**
  - `/kiosko` → actividades **reales de CCB**. ⚠️ Hoy las 9 actividades están `finalizada`
    → mostraría **0 activas** (dato real, no demo) hasta que haya una activa.
  - `/scanner` → PIN (staff usa el **PIN real de prod**, no el 4242 de staging).
  - `/app` → dashboard admin con la cookie `contan2_session` existente (SSO preservado, §7).
  - tenant CCB real: confirmar con `/kiosko` o `GET /api/v2/public/activities`.
  - check-in mínimo: opcional (patrón del Bloque 5: actividad temporal + cleanup, o esperar una activa).

## 6 · Rollback exacto

- Re-agregar `https://ccb.contan2.com` al **fqdn de v1** + quitarlo de **web-v2-prod** →
  Traefik vuelve a rutear ccb→v1. **Tiempo: ~1–3 min** (regenerar labels + restart).
- **Datos escritos por v2 durante el canary:** quedan en la DB prod compartida y son
  **válidos para v1** (mismo esquema, mismo unique index `attendance_org_user_activity_unique`;
  v1 ignora `companions_children`). **Cero divergencia, cero limpieza** — no hay que deshacer
  check-ins reales (verificado en el write smoke del Bloque 5).

## 7 · Riesgos

- **TLS / re-emisión:** el cert LE de `ccb.contan2.com` debe quedar activo en v2; la
  re-emisión/uso puede tardar segundos → ventana de bajo tráfico.
- **admin pasa a v2 si se mueve el host completo:** el switch mueve TODAS las superficies
  de ccb (kiosko+scanner+admin) a v2 a la vez (blast radius). El platform-admin de
  `admin.contan2.com` NO se mueve (queda v1), pero el tenant-admin `/app` en `ccb.contan2.com` sí.
- **Cookies/admin:** el **host no cambia** (`ccb.contan2.com`), solo el backend → el navegador
  sigue enviando `contan2_session` → el v2 admin lee la sesión existente (**SSO preservado**).
  Verificar que el operador no deba re-loguear.
- **Scanner PIN real prod:** ccb prod tiene `staff_pin_hash` (validado: 401 con PIN incorrecto).
  El staff necesita el **PIN real de prod**.
- **Resend dry-run:** api-v2-prod **sin `RESEND_API_KEY`** → ningún email real durante el
  canary. Activar envío de credencial es decisión aparte.
- **Actividades finalizadas → 0 activas:** hoy CCB no tiene actividades activas → el kiosko
  v2 mostraría 0 (real, no error).

## 8 · Alternativa path-based (menor blast radius)

Rutear en Traefik `Host(ccb.contan2.com) && PathPrefix(/kiosko|/scanner)` → v2, y el resto
(`/app`, SPA admin v1, `/api`) → v1:
- **Solo `/kiosko` y `/scanner` van a v2**; el admin queda en v1 → **menor blast radius**.
- **Más compleja:** requiere **config dinámica manual de Traefik** (Coolify no la expone por
  API) → montaje a mano y rollback más delicado.

## 9 · Recomendación

- **Switch de host completo (A)** en **ventana de bajo tráfico**, con **rollback listo**
  (re-agregar a v1). Es lo más determinista y reversible; el write path ya está probado y los
  datos son compatibles en ambos sentidos.
- **O path-based** si se decide **minimizar el riesgo del admin** (kiosko/scanner a v2, admin
  en v1) — a costa de la complejidad de Traefik manual.

**No ejecutar el cutover sin OK explícito.** Per-surface vía URL física del dispositivo NO
sirve para CCB (solo `ccb.contan2.com` resuelve el tenant; `app`/reservados caen a demo).

Relacionado: [`08-cutover-execution-plan.md`](08-cutover-execution-plan.md),
[`09-cutover-execution-checklist.md`](09-cutover-execution-checklist.md).
