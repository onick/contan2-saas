# Plan técnico 002 — Landing page

> Cómo aterrizamos la spec. Decisiones de implementación, archivos a tocar,
> orden y mitigaciones.

---

## 1. Stack

- **HTML estático** (`frontend/landing.html`) servido por Express con
  cache-friendly headers.
- **CSS dedicado** (`frontend/landing.css`) — sin import de `styles.css`
  para no arrastrar el peso del admin.
- **JS mínimo** (`frontend/landing.js`):
  - scroll suave a anclas
  - lógica del modal "Iniciar sesión" con selector de slug
  - submit del form de contacto (fetch + estados loading/ok/error)
  - intersection observer para fade-in de secciones
- **Sin fuentes externas** más allá de las que ya carga el admin (Inter
  + Font Awesome). Reusa el CDN ya configurado en otras vistas.
- **Imágenes**: screenshot del dashboard se sirve desde `frontend/assets/`
  (lo añadimos manualmente, sin generar nada complejo).

---

## 2. Routing backend

### 2.1 Estado actual (lo que rompemos)

`backend/server.js` tiene en el catch-all final:

```js
return resolveTenant(req, res, () => indexHtml(req, res, next));
```

Si `req.hostname` es `contan2.com` o `www.contan2.com`, `resolveTenant`
marca `tenantSource='marketing'` y devuelve sin org. Pero el handler
final sirve **igual** `indexHtml` (que es el admin SPA). Eso es el leak.

### 2.2 Estado nuevo

Antes del catch-all genérico, añadimos:

```js
function isMarketingHost(req) {
  const host = (req.hostname || '').toLowerCase();
  const root = (config.ROOT_DOMAIN || 'localhost').toLowerCase();
  return host === root || host === `www.${root}`;
}
```

Y, en el catch-all del GET (y como ruta `/`):
```js
if (isMarketingHost(req)) return landingHandler(req, res, next);
```

Para dev local, también permitimos override por query (`?landing=1`) y
subdomain `landing.localhost`, para poder testear sin tocar /etc/hosts.

### 2.3 Endpoint de contacto

Nuevo router `backend/src/routes/landing.js`:

- `POST /api/landing/contact` — público.
  - zod schema: `{ name: string min 2, organization: string min 2,
                  email: email, message: string max 2000 optional,
                  fax: string max 0 optional }` (honeypot).
  - Rate limit por IP usando el mismo helper interno (in-memory ring
    buffer; sí, se pierde al restart — suficiente para spam casual).
  - Envía email via `resend` a `LANDING_INBOX_EMAIL`
    (env, default `mfranciscomartinez@gmail.com`).
  - Envía confirmación al prospect (best-effort, no falla si rebota).
  - Loggea con email enmascarado.

Se monta en `server.js` **antes** de `resolveTenant` (mismo trato que
`platformAuth`): es público, no tiene tenant scope.

---

## 3. Anti-leak: cómo aseguramos que la landing NO sirve admin

1. El handler `landingHandler` lee `landing.html` y lo devuelve con
   `Content-Type: text/html; charset=utf-8`. No hace SSR de branding.
2. Si el hostname matchea marketing, NUNCA se invoca `indexHtml`. El
   catch-all hace branching explícito en el orden:

   ```
   platformHost → platform views
   marketingHost → landingHandler
   kiosko/scanner/rsvp/login → cada uno
   default → indexHtml (admin SPA)
   ```

3. La landing JS no tiene fetch a endpoints del admin. Solo:
   - `POST /api/landing/contact`
   - (en el modal de login) lectura de localStorage; el botón "Ir" hace
     redirect a `https://<slug>.<root>/login` por URL absoluta. Sin AJAX.

---

## 4. Estructura de archivos

```
specs/002-landing-page/
  spec.md
  plan.md
  tasks.md
  content.json          # copy textual + KPIs (para futuras tweaks)

frontend/
  landing.html          # nuevo
  landing.css           # nuevo
  landing.js            # nuevo
  assets/
    landing-hero.png    # screenshot dashboard (placeholder hasta que
                        # Marcelino apruebe el shot final)

backend/
  src/routes/
    landing.js          # nuevo, router con /contact
  server.js             # MODIFICADO: routing dual marketing vs tenant
```

---

## 5. Frontend — convenciones internas

### 5.1 CSS

- Variables CSS locales en `:root` del archivo (no usa los tokens del
  admin):
  ```
  --ln-bg: #0b0e1a;       (footer)
  --ln-surface: #ffffff;
  --ln-text: #0f172a;
  --ln-muted: #64748b;
  --ln-accent: #6366f1;   (indigo)
  --ln-accent-strong: #4338ca;
  --ln-success: #16a34a;
  --ln-radius: 14px;
  --ln-max-w: 1180px;
  ```
- Mobile-first. Breakpoints: 640px, 960px, 1280px.
- `font-variant-numeric: tabular-nums` para los KPIs.

### 5.2 Accesibilidad

- `<header>` con role implícito de banner.
- `<nav aria-label="Principal">`.
- `<main>` con `<section aria-labelledby>` en cada bloque.
- Links del nav con `aria-current="true"` cuando aplique (scroll-spy
  opcional, no bloqueante).
- Botones del CTA con `role="button"` solo si no son `<button>`.

### 5.3 JS

- IIFE puro, sin globals.
- `defer` en el script.
- Estado del form: `idle | sending | ok | error`. Renderiza inline.

---

## 6. Riesgos técnicos

| Riesgo | Mitigación |
|---|---|
| Romper el routing y que el admin deje de funcionar para `ccb.contan2.com` | Branching por hostname temprano + smoke local probando subdomain + marketing |
| Resend devuelve quota agotada en el form | `try/catch` + log + responder 200 al usuario (no exponer detalles) + Marcelino puede ver en logs |
| Honeypot detectado por un usuario real (autocomplete) | Campo `fax` con `autocomplete="off"`, `tabindex="-1"`, `aria-hidden="true"`, position absoluto fuera de pantalla |
| Cache muy agresivo y un fix de copy no se ve | `Cache-Control: public, max-age=300, must-revalidate` (5 min, no `immutable`) |

---

## 7. Tests (manuales)

1. `curl -H "Host: contan2.com" http://localhost:3000/` → devuelve HTML
   landing (no admin SPA).
2. `curl -H "Host: ccb.contan2.com" http://localhost:3000/` → devuelve
   admin SPA (con branding CCB inyectado).
3. `curl -H "Host: admin.contan2.com" http://localhost:3000/login` →
   platform-login.html.
4. `curl -H "Host: contan2.com" -X POST http://localhost:3000/api/landing/contact
       -d '{"name":"X","organization":"Y","email":"z@z.com"}'`
   → 200 con `{ ok: true }`. Recibo email.
5. Mismo curl con `fax: "spam"` → 200 con `{ ok: true }` pero NO email
   enviado (honeypot).
6. 4 curls seguidos al `/contact` desde misma IP → el 4to devuelve 429.

---

## 8. Orden de implementación

1. `spec.md`, `plan.md`, `tasks.md` (este paso).
2. Backend: `landing.js` router + montaje en `server.js`.
3. Backend: handler `landingHandler` con cache de archivo.
4. Backend: branching de hostname en el catch-all.
5. Frontend: `landing.html` con estructura semántica completa.
6. Frontend: `landing.css` light theme con palette indigo.
7. Frontend: `landing.js` con form + modal + scroll.
8. `content.json` con copy real (KPIs CCB).
9. Smoke local manual.
10. Commit + push a `develop`.
