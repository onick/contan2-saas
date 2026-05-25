# Spec 002 — Landing page pública (`contan2.com`)

> **Estado:** Borrador v1
> **Sprint:** 2 de 6 (mes 1, sem 2-3)
> **Depende de:** Sprint 1 (auth) — solo a nivel de enlaces ("Iniciar sesión" apunta al login del tenant).
> **No bloquea:** nada del producto operativo. Es 100% marketing.
> **Autor:** Claude · 2026-05-25

---

## 1. Motivación

Hoy `contan2.com` y `www.contan2.com` sirven el **admin SPA** porque el
backend no distingue marketing host de tenant host en el fallback. Eso
implica que:

- Cualquier prospect que llega al dominio raíz ve un panel administrativo
  vacío (o el del CCB si hay dev-fallback) en vez de una propuesta de valor.
- No hay forma de explicar qué hace contan2, para quién, ni cómo se
  contrata.
- No hay punto de entrada al login del staff (hoy van directo a su
  subdomain del tenant, lo cual está bien, pero un visitante nuevo no
  sabe que existe).

La landing es el **primer activo comercial** del producto. Sin ella no
hay forma de vender a un segundo cliente.

Adicionalmente, la constitución (§ 2.2) prohíbe que el público acceda al
admin desde URLs neutras. Hoy esa regla se rompe en el dominio raíz.
**Esta spec corrige también ese leak**.

---

## 2. Scope

### Sí incluye

| # | Feature | Por qué |
|---|---------|---------|
| F1 | Hero con propuesta de valor, screenshot del producto y CTAs | Primer impacto. "Qué es contan2 en 5 segundos." |
| F2 | Sección "Para quién es" (3 perfiles: centro cultural, fundación, instituto/escuela cultural) | Auto-cualificación del prospect |
| F3 | Sección de features con íconos (8-10 features clave) | Demostrar profundidad sin saturar |
| F4 | Caso de éxito CCB (testimonio + métricas reales) | Social proof verificable |
| F5 | Pricing (Growth $99/mes destacado + tier Starter futuro + Enterprise "contáctanos") | Transparencia de precio (filtra leads no calificados) |
| F6 | Formulario de contacto / demo | Captura del lead — envía email a `mfranciscomartinez@gmail.com` y confirma al prospect |
| F7 | Footer con links (Términos, Privacidad, Soporte, Login) | Higiene + cumplimiento |
| F8 | Navegación: Características · Precio · Contacto · "Iniciar sesión" (apunta a `<slug>.contan2.com/login` o un selector) | Re-entry para clientes existentes |
| F9 | Routing backend: marketing host sirve landing, NUNCA el admin SPA | Cierra el leak de §2.2 |

### No incluye (explícitamente fuera)

- ❌ **Signup self-service** (Sprint 3). El CTA de "Quiero esto" es un
  formulario de contacto, no un wizard de creación de tenant.
- ❌ **Blog o sección de contenidos** (futuro). Por ahora cero contenido
  editorial: solo features y casos de uso.
- ❌ **Multi-idioma**. Solo español. Cuando haya un cliente que pida
  inglés, se internacionaliza.
- ❌ **Modo claro/oscuro toggle**. La landing es tema único (light con
  acentos oscuros).
- ❌ **A/B testing**. Sin telemetría comercial aún.
- ❌ **Páginas legales reales** (Términos, Privacidad). Hay placeholders
  enlazados a páginas stub; el copy legal serio sale del Sprint 5.

---

## 3. Casos de uso

### CU1 — Prospect llega desde una recomendación

1. Recibe link de un colega: "mira contan2.com".
2. Aterriza en el hero. En 5 segundos entiende qué hace.
3. Hace scroll, ve features, ve el caso del CCB con métricas (visitantes
   gestionados, eventos, asistencia promedio).
4. Llega al pricing. Ve "Growth $99/mes" claro y los límites.
5. Click en "Solicitar demo". Llena formulario (nombre, organización,
   email, mensaje opcional). Envía. Ve un toast/sección de
   "Te contactamos en 24h".
6. Marcelino recibe el email y agenda la demo.

### CU2 — Staff existente del CCB confunde la URL

1. Karen abre el navegador, tipea `contan2.com` por costumbre (en vez
   de `ccb.contan2.com`).
2. Ve la landing. En el header ve "Iniciar sesión".
3. Click → modal/page que le pide ingresar el slug de su organización
   (o reconoce uno guardado en localStorage si visitó antes).
4. Redirect a `https://ccb.contan2.com/login` (su subdomain real).

### CU3 — Operador del Centro Cultural X visita la landing
1. Llega desde Google.
2. Ve la sección "Para quién es" y se reconoce ("centros culturales
   pequeños y medianos sin sistema").
3. Ve el caso CCB y entiende qué tipo de uso esperar.
4. Solicita demo. Marcelino lo califica manualmente.

### CU4 — Bot/visitante hostil llena el formulario
1. Bot postea 10 contactos en 30s.
2. Backend rate-limita (3/hora/IP) y honeypot field rechaza silenciosamente.
3. Marcelino no recibe spam.

---

## 4. Requisitos funcionales

- **RF1.** Servir un HTML estático (con un poco de JS) cuando el host es
  `contan2.com` o `www.contan2.com`. Sin tenant lookup.
- **RF2.** En el resto de hosts (tenant subdomains, custom domains,
  `admin.<root>`), el comportamiento actual no cambia.
- **RF3.** Endpoint `POST /api/landing/contact` con validación zod,
  rate limit 3/hora/IP, honeypot opcional. Envía email a
  `mfranciscomartinez@gmail.com` (configurable vía env) y devuelve 200
  con `{ ok: true }`.
- **RF4.** En localhost dev, la landing es accesible vía un atajo
  (query param `?landing=1` o subdomain `landing.localhost`) para que
  sea testeable sin tocar DNS.
- **RF5.** El selector de tenant en el header ("Iniciar sesión") guarda
  el último slug en `localStorage` para evitar re-preguntar.

---

## 5. Requisitos no funcionales

- **RNF1.** Lighthouse score ≥ 90 (performance + accessibility + SEO).
- **RNF2.** Tiempo a primer paint ≤ 1.5s en conexión 4G.
- **RNF3.** Sin frameworks JS (sigue el principio de "vanilla JS modular").
- **RNF4.** Accesible: contraste AA, navegación por teclado, alt text en
  imágenes, semántica HTML correcta (h1-h6, landmarks).
- **RNF5.** SEO básico: meta description, Open Graph, sitemap.xml,
  robots.txt, schema.org `Organization`.
- **RNF6.** Responsive mobile-first (320px → 1920px sin breakpoints rotos).
- **RNF7.** Cero leak de admin: ninguna ruta de la landing puede llevar
  a `/api/users`, `/api/dashboard`, etc.

---

## 6. UI / Estructura

Una sola página (`landing.html`) con secciones ancla:

```
[nav] · logo contan2 · Características · Casos de uso · Precio · Contacto · [Iniciar sesión]

[hero]
  H1: "Gestiona tu centro cultural sin perder visitantes en el camino"
  Sub: "Registro, check-in, segmentación y reportes branded —
       en una sola plataforma que tu equipo aprende en una tarde."
  CTAs: [Solicitar demo] [Ver cómo funciona]
  Visual: screenshot del dashboard con datos reales del CCB (anonimizados
          si hace falta) + badge "Usado por el Centro Cultural Banreservas"

[para-quien]
  Tres cards: Centro Cultural · Fundación · Instituto Cultural

[features]
  Grid de 8-10 features:
    · Registro y check-in con QR personal
    · Páginas públicas compartibles
    · Branding propio (color, logo, dominio)
    · Segmentación de audiencia
    · Reportes PDF + Excel branded
    · Multi-tenant nativo
    · Anti pérdida de datos (modal/forms)
    · Operación pre/post evento
    · Idempotencia y resiliencia
    · Auditoría (próximamente)

[caso-ccb]
  Quote de Karen (placeholder hasta tenerlo) + 3 KPIs reales:
    "12.000+ visitantes" · "200+ actividades" · "95% asistencia promedio"
  (los números reales se llenan al render desde un JSON estático que
   Marcelino actualiza, no se queman en el HTML)

[pricing]
  3 cards:
    · Starter — "Pronto" (placeholder)
    · Growth — $99/mes (destacado) — todos los features + 5k visitantes/mes
    · Enterprise — "Conversemos"

[contacto]
  Form: nombre · organización · email · mensaje opcional · [Enviar]
  Honeypot: campo "fax" invisible. Si llega lleno, rechaza silencioso.

[footer]
  · Producto: Características · Precio · Demo
  · Recursos: Soporte · Estado del sistema
  · Legal: Términos · Privacidad · Cookies
  · Login: Iniciar sesión
  · Copyright "contan2 · hecho en RD"
```

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Form spam | Rate limit 3/hora/IP + honeypot + zod strict |
| Leak de admin si rompo el routing | Tests manuales + log explícito de `tenantSource=marketing` cuando se sirve landing |
| Performance baja por imágenes pesadas | `<picture>` con WebP + lazy loading + dimensiones explícitas |
| Cambios de copy frecuentes | Copy en JSON aparte (no embebido en HTML) para futuras versiones |
| Karen escribe la URL `contan2.com` y se confunde sin saber qué pasó con su panel | Header con "Iniciar sesión" prominente + soporte de auto-redirect si hay `localStorage.lastSlug` |

---

## 8. Métricas (post-deploy)

- Visitas únicas/día a la landing (logs Coolify).
- Conversión: leads del form / visitas.
- Tiempo en página (informal, vía Cloudflare Analytics si se habilita).
- Bounce rate del header al login (cuántos staff usan la landing como
  puerta de entrada).

---

## 9. Decisiones tomadas

| Pregunta | Decisión | Por qué |
|---|---|---|
| ¿Marketing en subdomain `www` o en root? | Ambos (alias) | UX: la gente tipea cualquiera de los dos |
| ¿Reescribir admin a `app.contan2.com`? | No por ahora | Cambio fuerte de URLs ya establecidas; los tenants siguen en `<slug>.contan2.com`. Solo se libera el root |
| ¿Modal de selector de tenant o página dedicada? | Modal | Menos saltos, menor fricción |
| ¿Capturar leads en DB? | No (sprint 1 de landing) | Email es suficiente; DB se agrega en Sprint 3 cuando hay signup |
| ¿Tracking de analytics? | No por ahora | Privacy-first hasta que haya razón comercial |
| ¿Idioma? | Solo español | Mercado RD primero |
