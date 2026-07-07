# design-sync · notas (contan2-saas)

Primer sync COMPLETO 2026-07-07 → proyecto **Contan2 UI Kit**
(`3534650d-2dd6-467a-8be0-f09d6b73b9da`, https://claude.ai/design/p/3534650d-2dd6-467a-8be0-f09d6b73b9da).
9/9 componentes con previews autorados y calificados good; validate 9/9 limpio; anchor subido.

## Decisiones de esta corrida (por qué la config es como es)

- **Shape `package` sin dist**: la app no publica librería; `entry` apunta al barril
  TS (`apps/web/components/ui/index.ts`) y esbuild lo bundlea directo. Sin `.d.ts`
  compilados, los 9 componentes van pineados en `componentSrcMap` (¡un componente
  nuevo del kit NO aparece solo — hay que agregarlo ahí!).
- **CSS**: Tailwind v4 se precompila con `buildCmd` (CLI en `.ds-sync/node_modules`,
  se instala con `npm i @tailwindcss/cli@^4` dentro de `.ds-sync/`). El entry
  `.design-sync/css/entry.css` importa `apps/web/app/globals.css` (@theme = fuente de
  la verdad) y define `--font-roboto-flex` (en la app la inyecta next/font). La salida
  va a `apps/web/.ds-css/compiled.css` porque `cssEntry` está acotado al paquete.
  **Correr `buildCmd` SIEMPRE antes del converter** — los previews usan utilidades que
  deben existir en el CSS compilado (la detección de sources corre desde la raíz del
  repo e incluye `.design-sync/previews/`).
- **Fuentes**: Roboto Flex cosechada del build de Next (`.next/static/chunks/*.css` +
  `.next/static/media/*.woff2`) → `.design-sync/fonts/` (committeada, OFL). Si next/font
  cambia subsets/hashes, re-cosechar (6 @font-face, weight 100-1000 variable).
- **`projectName` NO es clave válida** del config (validación estricta) — el nombre
  vive solo en claude.ai/design.
- **Playwright**: chromium cacheado 1223/1228 en `~/Library/Caches/ms-playwright`;
  `playwright-core@1.60.0` pinea 1223 (instalado en `.ds-sync/`).
- Grupo único `general` (los 9 viven planos en `components/ui/`; regroup vía docsMap
  con stub `category:` si algún día hace falta).

## Known render warns

(ninguno — validate final 9/9 sin warns)

## Riesgos de re-sync

- **CSS compilado puede quedar viejo**: si el kit o los previews agregan clases y no
  se corre `buildCmd` antes del build, las tarjetas renderizan sin esas utilidades
  (falla silenciosa). Siempre: buildCmd → package-build → validate.
- **Fuentes atadas al build de Next**: `.design-sync/fonts/roboto-flex.css` referencia
  woff2 por hash copiados en esa carpeta; independientes de `.next/` una vez
  committeados, pero si se quiere refrescar subsets hay que re-cosechar a mano.
- **componentSrcMap es enumeración manual**: componente nuevo en el barril ⇒ alta en
  config + preview autorado (o queda fuera del sync, ni tarjeta piso tendrá).
- **Los previews importan `@contan2/web`** (shim a window.Contan2UI) y `lucide-react`
  (se bundlea) — si el kit se extrae a `packages/ui`, actualizar `pkg`/`entry` y los
  imports de los 9 previews.
- **`.ds-sync/` es regenerable**: en clone fresco re-stagear scripts del skill +
  `npm i esbuild ts-morph @types/react @tailwindcss/cli@^4 playwright-core@1.60.0 playwright@1.60.0`.
- El header de convenciones (`.design-sync/conventions.md`) enumera utilidades/tokens
  validados contra `_ds_bundle.css` de esta corrida — re-validar nombres tras cambios
  grandes en globals.css (regla: nunca reescribirlo entero, solo reportar drift).

## Scope original (prep 2026-07-06, sigue válido)

- Kit: `apps/web/components/ui/` — 9 primitivos (Server Components, deps limpias:
  react + lucide-react). Excluir el resto de `apps/web/components/*` (pantallas Next).
- Utils/hook del barril NO son componentes: `cn`/`focusRing`/`focusWithin`,
  `useDrawerLifecycle` (quedan como exports del bundle, sin tarjeta — correcto).
- Tests `*.test.tsx` en la misma carpeta: fuera del scope (el converter ya los ignora).
