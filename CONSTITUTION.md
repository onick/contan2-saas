# CONSTITUTION · contan2

> Principios y reglas operacionales del proyecto. Sirve como **norte** para
> cualquier desarrollador o agente IA que trabaje en este código.
> No es documentación de cómo funciona el sistema (eso vive en el código);
> es **qué valoramos** y **qué nunca hacemos**.
>
> Última revisión: 2026-05-22.

---

## 1. Producto

**contan2** es una plataforma SaaS multi-tenant para gestión de visitantes
en centros culturales. Su cliente ancla es Centro Cultural Banreservas
(CCB), pero la arquitectura está pensada para que cualquier organización
similar pueda usarla en self-service.

**Lo que hacemos bien (y por qué existimos):**
- Registro y check-in de visitantes con QR personal
- Páginas públicas compartibles por actividad (OG-ready para WhatsApp/redes)
- Segmentación de audiencia y campañas de invitación
- Reportes profesionales (Excel + PDF) con branding del tenant
- Branding y dominio propio por tenant (self-service)

**Lo que NO somos:** ticketing, e-commerce, plataforma de streaming, CRM.

---

## 2. Principios técnicos

### 2.1 Multi-tenant first
Cada fila de datos pertenece a un `organization_id`. Ningún endpoint,
query, archivo de upload o cálculo agregado existe **sin tenant scope**.
La sola excepción es la tabla `organizations` y la infraestructura
compartida (`_migrations`, etc.).

### 2.2 Admin vs Público: aislados, nunca fusionados
- `/admin` (SPA), `/kiosko`, `/scanner`, `/eventos/:slug`, `/rsvp/:token`
  son **apps distintas** servidas por el mismo backend.
- **Ninguna URL pública debe linkear o exponer rutas del admin.**
  Si una página pública necesita un footer/back, va a la web institucional
  del tenant, no a `/`.
- El visitante en una tablet del kiosko jamás debe poder llegar al panel
  admin "navegando hacia atrás".

### 2.3 Idempotencia y resiliencia
- Toda operación bulk debe poder repetirse sin corromper datos.
- Migrations: `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX
  IF NOT EXISTS`, etc.
- En fallos parciales (ej. bulk-send que rompe a mitad por quota Resend),
  guardar el estado pendiente en disco/DB para reanudar.

### 2.4 Honestidad de UI
- **Badges contextuales > números crudos.** Mostrar "Cupo disponible" en
  vez de "0/100" cuando recién abre. Mostrar "Últimas 5 plazas" cuando
  hay urgencia real.
- **Empty states inteligentes.** No "no hay datos"; mostrar el rango
  anterior con datos, sugerir acción.
- **Comparativos vs período anterior** siempre que aplique (deltas %).
- **Cero "lorem ipsum" o números fake** en demos.

### 2.5 Branding propio del tenant
- El tenant define color primario + accent + sidebar style + logo +
  custom domain.
- La paleta se deriva del color primario (HSL, 10 stops) en runtime,
  inyectado como `<style data-branding-ssr>` antes del primer paint.
- Cualquier feature nueva (página, modal, email) debe consumir los
  CSS custom properties (`var(--color-primary)`, etc.), nunca colores
  hardcoded.

---

## 3. Reglas operacionales (las que **nunca** rompemos)

### 3.1 DB de producción sagrada
- **Cero `DELETE`/`UPDATE`/`TRUNCATE` sin confirmación explícita** del
  responsable humano.
- Las migrations son la única vía para mutar schema en prod.
- Backups antes de cualquier intervención no rutinaria.

### 3.2 Cero leaks de admin desde URLs públicas
Ya documentado en 2.2. Se aplica a footers, breadcrumbs, error pages,
emails — cualquier superficie que el público pueda ver.

### 3.3 PII enmascarada en logs
- `maskEmail()` para todo log que mencione email (`m***@gmail.com`).
- Nunca pegar tokens, claves API o passwords en logs/chat/repo.

### 3.4 Time zones
Cualquier cálculo de "hoy/ayer/este mes" usa la zona horaria del tenant
(`organization.timezone`, default `America/Santo_Domingo`). UTC solo
para almacenamiento.

### 3.5 Reversibilidad sobre destrucción
Frente a estado inesperado (archivos, branches, locks), **investigar
antes de borrar**. Un commit nuevo siempre antes que un `--amend` o
`reset --hard`.

### 3.6 Pre-evento = modo conservador
Cuando hay un evento real próximo (≤ 5 días), no se hacen cambios de
schema ni de endpoints críticos sin confirmación explícita. Solo fixes
quirúrgicos y polish UI.

---

## 4. Stack y convenciones

### 4.1 Stack
- **Backend:** Node.js + Express + Postgres + Resend (email)
- **Frontend:** vanilla JS modular (sin framework). Cada vista en su
  propio archivo (`app.js`, `kiosko.js`, `scanner.js`, `branding-admin.js`,
  `reports-admin.js`, etc.)
- **Hosting:** Coolify en VPS Contabo + Cloudflare (DNS + CDN)
- **Auth:** session cookie (staff PIN bcrypt). El sistema de auth
  completo (login con email/password, recovery, roles) está pendiente
  y será uno de los primeros specs.

### 4.2 Convenciones de código
- SQL: `snake_case`. JS: `camelCase`. Constantes JS: `SCREAMING_CASE`.
- Migrations: `NNN_short_name.sql`, numeradas, tracked en `_migrations`.
- Routes por dominio (`routes/users.js`, `routes/activities.js`, etc.).
- Repos por driver (Postgres en prod, Memory para dev). Mismo contrato.
- Validators en `domain/schemas.js`, separados del transport (routes).

### 4.3 No comments / less is more
- Código auto-explicativo con buenos nombres.
- Comentarios solo para el **por qué** no-obvio (un workaround, una
  invariante, una decisión de negocio).
- Nunca comentar lo que el código ya dice.

### 4.4 Errores
- `HttpError(status, message, details)` para errores del cliente.
- Logs estructurados con prefijo `[modulo]` para grep.
- Nunca silenciar errores en producción (sí en best-effort fire-and-forget
  con `.catch(err => console.error(...))`).

---

## 5. UX preferences

### 5.1 Tono
- Español dominicano informal-profesional. "Tú" no "vos".
- Mensajes de error útiles y específicos, nunca "Algo salió mal".
- Toasts cortos (2-5 palabras).

### 5.2 Diseño visual
- Tipografía: Inter (público + admin).
- `font-variant-numeric: tabular-nums` para todo número (KPIs, tablas).
- Animaciones sutiles (220-360ms fade/scale, no más).
- Mobile-responsive desde el día 1.
- Skeleton loaders para esperas > 200ms.

### 5.3 Botones y CTAs
- Primario por tab/modal (no varios "primary" compitiendo).
- "Cancelar" siempre a la izquierda; acción positiva a la derecha.
- Botones destructivos en rojo + segundo paso de confirmación (Modal.confirm).

### 5.4 Forms
- Modal con `<form>` jamás se cierra por backdrop click (anti pérdida
  de datos). Solo X, Cancelar o Escape.
- Validación inline + en backend (defensa en profundidad).
- Inputs con focus visible (`box-shadow: 0 0 0 4px var(--color-primary-100)`).

---

## 6. Multi-tenant invariants (críticas, no negociables)

1. Toda query a tablas con `organization_id` filtra por `req.organizationId`.
2. `resolveTenant.js` middleware corre antes que cualquier handler de `/api/*`.
3. Cache de tenant: 60s TTL. Invalidar explícitamente al cambiar slug o
   customDomain de la org.
4. Subdominios reservados (`www`, `api`, `app`, `admin`, etc.) no resuelven
   a un tenant — quedan para marketing/infra.
5. Custom domains pasan por verificación DNS TXT antes de activarse.
6. El kiosko/scanner/eventos de un tenant **NUNCA** muestran datos de otro.

---

## 7. Seguridad (postura mínima)

- HTTPS obligatorio en producción (Let's Encrypt vía Traefik/Coolify).
- CORS estricto: solo subdominios del `ROOT_DOMAIN`.
- Rate limits en endpoints públicos: checkin (30/min/IP), reserve (10/min/IP),
  lookup (15/min/IP), credenciales (3/min/IP, bulk-send requiere staff auth).
- Staff PIN hasheado con bcrypt. Sesión 12h.
- Tokens de DNS verify: 32 chars random.
- Tokens de RSVP: UUID con expiración (1 día después del evento).
- Coolify token y Resend API key: solo en env vars del VPS, nunca en repo.

---

## 8. Deployment y operaciones

- **Branch `multitenant`** = producción del MVP actual.
- **Branch `develop`** (por crearse) = features grandes vía Spec-Driven
  Development a partir del lunes 2026-05-25.
- Push a `multitenant` → Coolify webhook → build → deploy automático.
  Si el webhook no dispara (sucede), trigger manual vía API de Coolify.
- Migrations corren al boot del contenedor, dentro de una transacción.
  Si fallan, el contenedor crash-loopea; investigar antes de re-deployar.
- Persistencia: `/data/contan2/uploads` (bind mount Coolify).

---

## 9. Pricing y modelo de negocio

- SaaS mensual + setup fee one-time.
- Tier de referencia: **Growth $99 USD/mes** (5k visitantes/mes, branding
  completo, dominio personalizado, segmentos, reportes pro).
- Setup fee: $500-750 USD (one-time, cubre customización + training).
- Diseño multi-tenant permite revender la misma instancia a otros centros
  culturales o instituciones similares.

---

## 10. Lo que viene (high-level, sin compromiso de fecha)

- Sistema de auth completo (login, recovery, MFA opcional)
- Gestión de staff administrativo (roles, invitaciones de admin a admin)
- Landing page pública (`contan2.com` marketing)
- Cycle/series como entidad de primer orden (hoy son strings en `category`)
- Tags many-to-many para actividades (cuando un evento pertenece a varios contextos)
- Automatización Coolify (Nivel 3 del custom domain self-service)
- Integraciones: WhatsApp Business API, recordatorios automáticos, etc.

---

## Apéndice — Cómo se aplica esta constitución

Cuando un dev (humano o agente) trabaja en este repo:

1. **Lee este archivo primero.** Es el contrato.
2. Si propones algo que rompe un principio, **flag explícitamente** la
   tensión y argumenta por qué es la excepción correcta. No la
   introduzcas en silencio.
3. Si encuentras un principio que ya no aplica o está desactualizado,
   propón el cambio en un PR dedicado (no mezclado con feature work).

Esta constitución es viva: se actualiza cuando aprendemos algo nuevo
o cuando una decisión deja de tener sentido. Cada actualización debe
incluir la fecha y un breve "por qué cambió".
