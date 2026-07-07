# Contan2 UI Kit · convenciones

Kit de primitivas del admin de contan2 (plataforma de gestión cultural; tenant principal: Centro Cultural Banreservas). React Server Components sin estado — **no hay provider ni wrapper**: todo componente renderiza estilado con solo tener `styles.css` cargado. El fondo de página (`--color-page`) y el texto base (`--color-ink`) los aplica el propio stylesheet al `body`; la tipografía es **Roboto Flex** (variable, se sirve desde `fonts/`).

## Idioma de estilo: Tailwind v4 precompilado + tokens

Los componentes se estilan con utilidades Tailwind resueltas contra tokens `@theme`. **El CSS que recibís es un build estático**: contiene las utilidades usadas por el kit y la app, no el universo Tailwind completo. Regla práctica: para color/tipografía usá las utilidades de tokens de abajo (todas existen); para layout usá utilidades comunes (`flex`, `grid`, `gap-*`, `p-*`, `px-*`, `space-y-*`, `max-w-*`, `rounded-*`, `min-h-*` — existen); si necesitás algo exótico que no aplique, usá `style` inline con `var(--color-*)` en vez de inventar clases.

| Familia | Utilidades reales |
|---|---|
| Marca | `bg-brand` `text-brand` `bg-brand-strong` `bg-brand-accent` |
| Superficies | `bg-page` `bg-surface` `bg-surface-container` |
| Texto | `text-ink` (principal) `text-muted` (secundario) `text-faint` (labels/metadata) `text-white` |
| Bordes | `border-line` (hairlines) |
| Énfasis suave | `bg-primary-container`+`text-on-primary-container` · `bg-accent-soft` |
| Estados | `bg-success-bg`+`text-success-fg` · `bg-danger-bg`+`text-danger-fg` |

Reglas de contraste (no negociables, vienen del kit):
- Texto blanco SOLO sobre `bg-brand-strong` (#c44400, AA 5.03:1). `bg-brand` (#e65100) NO cumple AA con texto blanco.
- `bg-brand-accent` (#ff6f00) es solo para dots/barras decorativas — **nunca lleva texto**.
- Touch targets ≥44px: `Button` md=44px ya lo cumple; `size="sm"` (36px) solo en toolbars de desktop.

Theming por tenant: sobreescribir `--color-brand`/`--color-brand-accent` en un ancestro re-tematiza el subtree (las utilidades resuelven `var(--color-brand)`).

## Dónde está la verdad

- `styles.css` → importa `fonts/fonts.css` (Roboto Flex) y `_ds_bundle.css` (tokens `@theme` como variables `:root` + todas las utilidades). Leé ahí los valores reales antes de estilar.
- Por componente: `<Name>.prompt.md` (uso y ejemplos) y `<Name>.d.ts` (contrato de props). Componentes: Button, IconButton, Field, Chip, Card, SectionHeader, EmptyState, Skeleton, BorderBeam.
- `Chip` es presentacional (estados); para filtros interactivos usá `<Button variant="pill" selected>`. `EmptyState` recibe `icon` (componente lucide-react). `BorderBeam` se monta dentro de un contenedor `relative` con border-radius propio.

## Snippet idiomático

```tsx
<Card interactive className="max-w-md">
  <SectionHeader
    title="Taller de cerámica"
    subtitle="Sala 2 · Hoy 4:00 p.m."
    actions={<Chip tone="success" dot>En curso</Chip>}
  />
  <p className="mt-3 text-[13px] text-muted">42 registrados · 28 presentes.</p>
  <div className="mt-3 flex gap-2">
    <Button size="sm">Registrar entrada</Button>
    <Button size="sm" variant="secondary">Ver detalle</Button>
  </div>
</Card>
```
