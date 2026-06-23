# Signup self-service + Trial 14 días · plan (v2)

> Reemplaza el flujo "pedir demo" de la landing por registro automático con
> trial de 14 días. Borrador 2026-06-23. Construir sobre `docs/migration-v2/`
> existente; cero cambios en v1. Pipeline de PRs chicos.

## Qué es

Un visitante de `contan2.com` crea su cuenta (organización + usuario owner) sin
intervención comercial, recibe acceso inmediato tras verificar email, y opera
gratis 14 días. Vencido el trial, el panel admin (`/app`) se bloquea con una
pantalla amable; las superficies públicas (kiosko, scanner) siguen para no
romper un evento en curso.

## Decisiones (cerradas con el usuario)

1. **Verificación email (doble opt-in)**: tras el signup se envía email con
   link. Tras click, la org pasa a `status='active'` y se inicia sesión. Mitiga
   impersonation de marca (alguien crea `victima.contan2.com` con email ajeno).
2. **Trial vencido bloquea SOLO `/app`**: kiosko/scanner/login siguen. Evita
   tirar un evento real si el trial vence en medio.
3. **Formulario de contacto queda como secundario**: los CTAs pasan a "Crear
   cuenta gratis" + un link chico "o hablá con nosotros" que abre el modal
   `/api/v2/contact` ya construido.
4. **1 trial por email**: el mismo email no puede crear dos trials.
5. **Wildcard routing automático** (`*.contan2.com` en Traefik/Coolify).

## Modelo de datos (aditivo, v1 lo ignora)

**No requiere migración para el trial** — `organizations.trial_ends_at` ya
existe (mig `002`), y `status='trial_ended'` ya está en el CHECK. Sólo hace
falta una tabla nueva para el doble opt-in:

- **`tenant_signup_tokens`** (mig `036`)
  - `id` UUID PK, `organization_id` FK→organizations (cascade),
    `staff_member_id` FK→staff_members (cascade), `token_hash` TEXT UNIQUE,
    `expires_at` TIMESTAMPTZ (24h), `used_at` TIMESTAMPTZ, `created_at`.
  - Patrón idéntico a `staff_invitations` (mig 021).
- **`staff_members.email_verified_at`** (mig `036`, misma mig) TIMESTAMPTZ NULL.
- Al crear el tenant: `status='pending_verification'`? No — el CHECK actual sólo
  admite `active|suspended|trial_ended|deleted`. **Agendar el trial al
  verificar**: la org se crea con `status='active'` + `trial_ends_at` NULL, el
  token de verificación es lo que gatea; tras verificar, se setea
  `trial_ends_at = NOW() + 14d`. Hasta entonces, un flag en memoria/estado
  "pendiente verificación" impide login. **Revisar en PR-1**: ¿agregar
  `status='pending'` al CHECK o usar `email_verified_at IS NULL` como gate?

## Principios

- Reusar lo construido: `slugify` (extender para orgs), `isSlugAvailable`
  (valida `organizations` vivas + `dead_slugs`), `createRateLimiter` +
  `endpointPrefix`, `@contan2/auth` (Argon2id, sesión opaca, cookie
  byte-compatible).
- Slug generado del nombre de organización (`Teatro Nacional` →
  `teatro-nacional`), con sufijo incremental si colisiona (`teatro-nacional-2`).
  Validación contra `RESERVED_SUBDOMAINS` (`tenant.ts:34`) y `dead_slugs`.
- Captcha: Cloudflare Turnstile (gratis, ya hay relación Cloudflare). Sin
  captcha no se habilita el signup público.
- Transacción atómica en el signup: org + staff owner + token, todo o nada.
- Audit: `tenant.signed_up`, `tenant.verified`, `trial.started`,
  `trial.expired` (lazy).

## PRs (pipeline chico, CI 8/8, staging, verificación, OK explícito)

### Fase 0 · Wildcard routing (infra, sin código)
- Agregar `*.contan2.com` como FQDN de `contan2-web-v2-prod` (panel Coolify,
  la API pública no lo permite). Probar primero en staging (`*.stg.contan2.com`).
- Verificar: `curl https://no-existe.stg.contan2.com` → no debe dar 503.
- **Bloqueante** para probar el feature E2E.

### PR-1 · DB + contratos (mig 036 + zod)
- Mig `036_email_verify_signup.sql`: `tenant_signup_tokens` +
  `staff_members.email_verified_at`. Schema TS + parity test.
- `packages/contracts`: `SignupRequestSchema` (orgName, fullName, email,
  password, confirmPassword, captchaToken, honeypot),
  `SignupVerifyResponseSchema`, `SignupEmailVerifySchema`.
- Tests del contrato.

### PR-2 · API signup (servicio + routes)
- `services/signup.ts`: `generateOrgSlug(name)` (colisiones + reserved +
  dead_slugs), `createPendingTenant()` (tx: org `active` + `trial_ends_at=NULL`
  + staff owner `email_verified_at=NULL` + token hash), `sendSignupEmail()`
  (Resend, plantilla branded).
- `services/signup-verify.ts`: `activateTenant(token)` → setea
  `trial_ends_at = NOW()+14d`, `email_verified_at=NOW()`, `token.used_at`,
  crea sesión, devuelve cookie.
- `routes/signup.ts`: `POST /api/v2/auth/signup` (rate-limit 3/h IP +
  honeypot + captcha verify), `POST /api/v2/auth/signup/verify` (consumir
  token, setear cookie `contan2_session`).
- Extender `TenantOrg` (`packages/db/src/orgs.ts`) con `trialEndsAt` + `plan`.
- Tests: slug collision, reserved rejection, 1-trial-por-email, captcha
  inválido, token expirado/ya-usado, tx rollback.

### PR-3 · Bloqueo trial vencido (solo `/app`)
- `tenant.ts`: NO bloquear `trial_ended` en resolución (kiosko/scanner/login
  siguen funcionando). Nuevo helper `isTrialExpired(org)`.
- `guard.ts` / nuevo `requireActiveTrial`: gate para `/app/*` (admin). Si
  `trial_ends_at < now()` → 402 Payment Required (o 403) con body
  `{ error: 'trial_expired', trialEndedAt }`. El frontend lo interpreta.
- Tests: `/app` bloqueado post-trial, kiosko/scanner OK post-trial.

### PR-4 · Frontend signup + landing
- `components/marketing/SignupModal.tsx` (client): form orgName/fullName/email/
  password/confirm + Turnstile widget + honeypot. Estados: idle/submitting/
  check-email/verified/error.
- `app/signup/verify/page.tsx`: consume el token de la URL, llama al proxy,
  redirige a `/app` con sesión nueva.
- Cambiar CTAs de `LandingPro.tsx`: "Solicitar demo" → "Crear cuenta gratis ·
  14 días". Link chico "o hablá con nosotros" → `ContactTrigger` existente.
- Copy de landing actualizada (hero, módulos, CTA final).
- Pantalla de trial vencido (`app/app/trial-ended/page.tsx` o render en el
  layout al detectar 402).
- `app/api/auth/signup/route.ts` + `app/api/auth/signup/verify/route.ts`
  (proxies same-origin → api-v2).

### PR-5 · Trial expiry + banner
- Job `auto-expire-trials` (lazy o cron, como `auto-finalize`): marca
  `status='trial_ended'` cuando `trial_ends_at < now()` y `status='active'`.
- `lib/trial.ts` (web): `daysRemaining(trialEndsAt)` para banner.
- Banner en `AppShell`: "Te quedan N días de prueba · Activar plan" (el "activar
  plan" es placeholder por ahora — contacto comercial, Stripe queda pendiente).
- Tests del job (reloj inyectable).

## Decisiones abiertas (confirmar antes de PR-1)

1. **`status='pending_verification'` vs gate por `email_verified_at IS NULL`**:
   agregar estado al CHECK (mig) o inferir. Recomendado: gate por
   `email_verified_at IS NULL` (sin tocar el CHECK, menos superficie).
2. **Turnstile site key/secret**: ¿los conseguís de Cloudflare o los consigo yo
   del dashboard? Necesario antes de PR-2/PR-4.
3. **"Activar plan" post-trial**: por ahora link a `mailto:hola@contan2.com` /
   `ContactTrigger`. Stripe billing self-service queda fuera de este feature.
4. **Slug en signup**: ¿el usuario lo elige o se genera del nombre? Recomendado:
   generado del nombre, editable después desde Identidad.

## Riesgos / notas

- **Wildcard Traefik**: si Coolify no acepta `*.contan2.com` como FQDN, fallback
  es editar la config dinámica de Traefik (`HostRegexp`). Probar en staging.
- **Hijacking de marca**: slug basado en nombre puede generar
  `banreservas.contan2.com`. `RESERVED_SUBDOMAINS` ya protege algunos; ¿agregar
  lista de marcas conocidas? Dejar para post-launch, revisar reportes.
- **Abuso**: sin captcha, el endpoint es target de creación masiva. Turnstile +
  rate-limit 3/h IP + honeypot son las 3 capas.
- **Email cuota**: Resend tiene límites; cada signup = 1 email (verificación).
  Trial explosion = cuota agotada. Monitorear.
- **`dead_slugs`**: cuando un trial caduca y se borra, el slug debe ir a
  `dead_slugs` para evitar reuso malicioso. Definir cleanup en PR-5.

## Orden de entrega
Fase 0 → PR-1 → PR-2 → PR-3 → PR-4 → PR-5. Cada uno: CI verde, staging,
verificación con datos reales, OK explícito antes de merge/deploy.
