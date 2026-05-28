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

## Estructura prevista (futuros PRs temáticos)

```
app/
  page.tsx          ✅ home estática (este PR)
  (tenant)/         ⏳ admin del tenant       · desktop/tablet
  scanner/          ⏳ escaneo QR             · mobile-first
  kiosko/           ⏳ check-in recepción     · tablet-first
  (platform)/       ⏳ platform admin         · responsive
```

Cada superficie se agrega en su propio PR. Hoy solo existe `/`.

## NO incluido todavía

- packages/ui (extracción cuando haya 2º consumidor real)
- Auth real / llamadas a `/api/v2/*` (PR de wiring con api-v2 local)
- Theming por tenant en vivo
- Playwright + smoke visual por viewport (PR dedicado — es el gate
  responsive de doc 07: 375/768/1280 con screenshot diff antes de cutover)
- ESLint config (placeholder por ahora, consistente con el resto del monorepo)
- Deploy / imagen Docker / Coolify
