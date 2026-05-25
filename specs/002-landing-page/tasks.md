# Tasks 002 — Landing page

> Lista ejecutable. Marca cuando hagas cada uno.

## Fase A — Backend routing y endpoint

- [x] A1. Crear `backend/src/routes/landing.js` con `POST /api/landing/contact`
  - [x] zod schema + honeypot
  - [x] rate limit in-memory por IP (3/h)
  - [x] envío con Resend a inbox + confirmación al prospect (best-effort)
- [x] A2. Modificar `backend/server.js`:
  - [x] Importar `createLandingRouter` y montar `/api/landing`
  - [x] Función `isMarketingHost(req)`
  - [x] Handler `landingHandler` con cache de archivo (igual que platformHtmlCache)
  - [x] Branching del catch-all GET: marketing → landingHandler
  - [x] Ruta GET `/` para marketing host
  - [x] Override dev: `?landing=1` o `landing.localhost`

## Fase B — Frontend

- [x] B1. `frontend/landing.html`
  - [x] Header con logo + nav anclas + CTA login
  - [x] Hero con H1, sub, CTAs, imagen
  - [x] Sección "Para quién"
  - [x] Sección "Características" (grid)
  - [x] Caso CCB con KPIs
  - [x] Pricing (3 cards)
  - [x] Formulario de contacto con honeypot
  - [x] Footer con links + legal
  - [x] Open Graph + meta description + schema.org
- [x] B2. `frontend/landing.css`
  - [x] Variables locales
  - [x] Layout responsive mobile-first
  - [x] Animaciones sutiles
  - [x] Modal selector de tenant
- [x] B3. `frontend/landing.js`
  - [x] Submit form con estados
  - [x] Modal login con slug + localStorage
  - [x] Scroll suave
  - [x] Intersection observer fade-in

## Fase C — Contenido

- [x] C1. `specs/002-landing-page/content.json` (KPIs + quotes editables)

## Fase D — Validación

- [x] D1. Smoke local: curl con distintos hosts
- [x] D2. Smoke local: form con honeypot y sin honeypot
- [x] D3. Verificar que admin SPA sigue cargando en `ccb.contan2.com`

## Fase E — Release

- [ ] E1. Commit en `develop` con mensaje descriptivo
- [ ] E2. Push a `origin/develop`
