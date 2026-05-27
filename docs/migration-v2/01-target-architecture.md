# 01 · Arquitectura objetivo

> Stack v2 propuesto para `contan2-saas`. Monolito modular en paralelo con el sistema actual hasta paridad comprobada.

## Principios

1. **Monolito modular**, NO microservicios prematuros.
2. **TypeScript estricto** en todas las capas.
3. **Contratos compartidos** (Zod) entre web/api/worker.
4. **Defensa en profundidad**: auth en middleware + RLS en DB.
5. **Procesos pesados fuera del HTTP**: workers BullMQ.
6. **Storage portátil**: S3-compatible (R2/Wasabi/Backblaze).
7. **Backwards-compat con tenant CCB** durante toda la migración.

## Estructura del monorepo

```
contan2-saas/
├── apps/
│   ├── web/              # Next.js 16 App Router · frontend Tenant + Platform
│   ├── api/              # Fastify 5 · API REST scoped por tenant
│   └── worker/           # BullMQ workers · jobs idempotentes
├── packages/
│   ├── contracts/        # Zod schemas · DTOs · OpenAPI types
│   ├── db/               # schema · migrations · Kysely/Drizzle types
│   ├── auth/             # sesiones · permisos · políticas RBAC
│   ├── ui/               # componentes React + sistema de branding
│   └── config/           # env schema + validación tipada
├── docs/                 # decisiones arquitectónicas + runbooks
└── _legacy/              # (futuro) snapshot del stack viejo durante cutover
```

Tooling: **pnpm workspaces** + **Turborepo**.

## Stack por app

### apps/web (Next.js 16)
- App Router · React Server Components donde aplique
- Tailwind CSS · sistema de tokens por tenant (CSS vars inyectados desde server)
- Componentes accesibles desde `packages/ui`
- Branding-aware: logo, paleta, fuentes, sidebar style derivados del tenant resuelto en server
- Soporta dominio personalizado + subdomain `<tenant>.contan2.com`
- Sesión via cookie HttpOnly compartida con `apps/api`

### apps/api (Fastify 5)
- TypeScript strict
- Plugins: `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/cors`
- Validación de input con Zod (`@fastify/type-provider-zod`)
- OpenAPI generado automáticamente desde los schemas Zod
- `req.organizationId` setea desde `resolveTenant` (subdomain + custom domain)
- `req.currentStaff` desde middleware de sesión
- Cada endpoint pasa por gate de auth + RBAC explícito (no opt-in)
- Rate limiting por ruta sensible (login, password reset, public endpoints)

### apps/worker (BullMQ)
- Procesos separados, escalables independientemente del API
- Queues:
  - `email` — invitaciones, credenciales, password resets, comunicaciones bulk
  - `pdf` — credenciales individuales, reportes de actividad, certificados
  - `excel` — exports masivos
  - `image` — optimización de uploads (Sharp), generación de variantes
  - `scheduled` — auto-finalización de actividades, recordatorios, cron tasks
- Cada job idempotente, con retry exponencial y dead letter queue.

## Stack por package

### packages/db
- PostgreSQL como única DB.
- **Kysely** preferido (SQL explícito, types fuertes, sin ORM mágico). Alternativa: Drizzle.
- Migrations versionadas en SQL plano + script wrapper TS.
- Compartibles con el `apps/api` y `apps/worker`.
- **RLS habilitado** en todas las tablas tenant-aware.

### packages/contracts
- Zod schemas para entities (User, Activity, Attendance, etc.) + DTOs (CreateUserInput, etc.).
- Generación de tipos TS desde los schemas → usados en web/api/worker sin duplicación.
- `openapi-from-zod` para generar `openapi.json`.

### packages/auth
- `createSession({ staffId, organizationId, role })` → token opaco + persist en DB.
- `validateSession(token)` → returns `{ staff, organization }` o null.
- Policies: `canRead(resource, role)`, `canWrite(resource, role)`, etc.
- Helpers para el platform admin (sesión separada).

### packages/ui
- Componentes base: Button, Input, Card, Modal, Toast, Table, Tabs.
- Sistema de tokens: CSS vars (`--color-primary`, `--color-accent`, etc.) inyectados por el web app desde el server con la paleta del tenant.
- Componente `<TenantLogo>` que resuelve `logoUrl` con fallback al SVG arco.
- Variantes accesibles (focus rings visibles, contrast WCAG AA mínimo).

### packages/config
- Schema Zod del entorno (`DATABASE_URL`, `RESEND_API_KEY`, `S3_*`, `REDIS_URL`, etc.).
- Falla al arrancar si falta una env crítica.
- Distintos perfiles: `development`, `staging`, `production`.

## Persistencia

- **PostgreSQL** sigue siendo la DB principal (no se migra).
- **Redis** nuevo, solo para BullMQ + rate limit distribuido.
- **S3-compatible storage** (Cloudflare R2 recomendado por costo). Migración progresiva con escritura dual: nuevo upload sube a R2 + leg local hasta validar.

## Email

- **Resend** se mantiene como provider.
- Toda llamada a Resend pasa por `apps/worker` (cola `email`). Los handlers HTTP solo enqueue jobs.
- Templates en `packages/ui/emails/` (MJML o React Email).

## Observabilidad

- **Pino** logger estructurado JSON. Cada log lleva `requestId`, `organizationId`, `staffId` cuando aplique.
- **Sentry** para error tracking en api + worker + web.
- Preparado para **OpenTelemetry** (no requerido para v2.0, pero la API se diseña compatible).
- Health endpoints: `GET /healthz` (liveness), `GET /readyz` (readiness con check DB + Redis).

## Testing

- **Vitest** unit/integration en api/worker/packages.
- **Testcontainers** o Postgres real efímero para integration tests (no SQLite ni mocks).
- **Playwright** E2E para flujos críticos: login, check-in, registro de visitante, RSVP, generación de credencial.
- Cobertura mínima objetivo: 70% líneas en módulos críticos (auth, attendance, billing futuro).

## Infraestructura

- Docker multi-stage builds.
- Imágenes separadas: `contan2-web`, `contan2-api`, `contan2-worker`.
- CI: GitHub Actions con jobs paralelos: `lint` · `typecheck` · `test` · `build` · `docker-build`.
- Deploy: Coolify v4 mantenido (familiar al operador). Una `app` por imagen.
- Backups: Postgres dump diario + retention 30 días (configurar en Coolify o externo).
- Staging environment separado para probar migrations antes de prod.

## Compatibilidad con el stack actual

Durante la migración v2, **ambos stacks coexisten**:

- El Express + Vanilla JS actual sigue corriendo en producción (branch `multitenant`).
- El nuevo monorepo se construye en paralelo en `migration/saas-platform-v2-parallel`.
- Ambos comparten la misma DB Postgres.
- El cutover (ver `04-cutover-and-rollback.md`) es por subdomain/route, no big-bang.

## Decisiones documentadas

- **Kysely vs Drizzle**: Kysely por madurez, SQL más explícito, mejor handling de RLS context. Drizzle queda como fallback si encontramos friction.
- **Fastify vs Hono vs Nest**: Fastify por ecosistema maduro, perf, plugins de seguridad listos. Hono es liviano pero el ecosistema cookie/session es menos batalla-probado. Nest es over-engineering para nuestro tamaño.
- **Next.js 16 App Router vs Pages**: App Router por server components + streaming + co-location. Trade-off: curva de aprendizaje, pero el equipo va a una sola vez.
- **R2 vs S3 vs Wasabi**: R2 por egress gratis (visitor downloads de credenciales QR no pagan), pricing predecible, S3-compatible API.

## Anti-objetivos

- ❌ Microservicios separados (api/auth/billing/notif). Premature.
- ❌ GraphQL. REST + Zod + OpenAPI alcanza.
- ❌ Server-side rendering ultra-personalizado por tenant que reinvente Next.
- ❌ ORM heavy (Prisma). Kysely + SQL explícito mejor para RLS.
- ❌ Mover off-Postgres. La DB es perfecta para nuestro caso.
- ❌ Reescribir el frontend del kiosko/admin antes de que el backend v2 esté estable.
