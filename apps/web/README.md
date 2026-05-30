# @contan2/web

Frontend v2 (Next.js App Router). Skeleton responsive — **responsive es
requisito no-negociable** (ver `docs/migration-v2/07-v2-foundation-plan.md`).

## Stack

- Next.js 16 (App Router, React Server Components)
- React 19
- Tailwind CSS v4 (config CSS-first vía `@theme` en `app/globals.css`)
- TypeScript estricto (extiende `tsconfig.base.json` con overrides de Next)
- Vitest + React Testing Library (component tests)

## Breakpoints (mobile-first)

Defaults de Tailwind v4, que coinciden con el contrato del producto:

| Viewport | Ancho | Tailwind | Demo en la home |
|---|---|---|---|
| mobile | ~375px | base (sin prefijo) | **1 columna**, padding chico |
| tablet | 768px | `md:` | **2 columnas**, padding medio |
| desktop | 1280px | `xl:` | **3 columnas**, padding amplio |

Valores numéricos centralizados en [`lib/breakpoints.ts`](./lib/breakpoints.ts).
El CSS no los redefine (usa los defaults de Tailwind). Los tokens de color
viven en `app/globals.css` (`@theme`); el theming por tenant llega con el
wiring a `/api/v2/org/branding`.

## Correr local

```bash
pnpm --filter @contan2/web dev     # http://localhost:3000
pnpm --filter @contan2/web build   # next build
pnpm --filter @contan2/web test    # vitest (component tests)
```

Verificar responsive a mano: abrir dev tools, probar 375 / 768 / 1280 px y
confirmar 1 / 2 / 3 columnas.

## App shell + dashboard (`/app`) · ruta PROVISIONAL

`app/app/page.tsx` renderiza un **dashboard tenant-admin estático** dentro del
shell responsive (`components/shell/`: `Sidebar` tablet/desktop + `Topbar` +
contenido). Navegación **fake/local** (los items no navegan; el activo es
estático). El contenido del dashboard vive en `components/dashboard/`
(`MetricCard`, `HighlightCard`, `AlertCard`, `ActivityList`) y los datos en
`lib/dashboard/demoData.ts` — **métricas locales estáticas** inspiradas en la
operación real del CCB, sin llamadas a `/api/v2`.

> **`/app` NO es la URL final.** Es una ruta provisional para iterar. El path
> definitivo + los route groups reales (`(tenant)`/`(auth)`), la navegación
> interactiva, el mobile drawer y los datos reales llegan junto al wiring de
> `/api/v2/auth/me` + `/api/v2/org/branding`.

Responsive: shell base (375) columna única con brand en el Topbar (sidebar
oculto) · `md` (768) grid sidebar+contenido · `xl` (1280) sidebar amplio.
Métricas del dashboard: 375 = 1 col · 768 = 2 col · 1280 = 4 col.

## Estructura prevista (futuros PRs temáticos)

```
app/
  page.tsx          ✅ home estática
  app/page.tsx      ✅ dashboard tenant-admin estático · ruta PROVISIONAL
  (tenant)/         ⏳ admin del tenant real  · desktop/tablet
  scanner/          ⏳ escaneo QR             · mobile-first
  kiosko/           ⏳ check-in recepción     · tablet-first
  (platform)/       ⏳ platform admin         · responsive
```

Cada superficie se agrega en su propio PR.

## NO incluido todavía

- packages/ui (extracción cuando haya 2º consumidor real)
- Auth real / llamadas a `/api/v2/*` (PR de wiring con api-v2 local)
- Theming por tenant en vivo
- Playwright + smoke visual por viewport (PR dedicado — es el gate
  responsive de doc 07: 375/768/1280 con screenshot diff antes de cutover)
- ESLint config (placeholder por ahora, consistente con el resto del monorepo)
- Deploy / imagen Docker / Coolify
