# Viewport checklist · apps/web

Verificación visual por viewport. El check de CSS (script) es necesario pero no
suficiente; esto es lo que confirma "se ve bien". La hace el usuario, o
Playwright solo con autorización explícita.

Breakpoints de `apps/web`: base / `md` 768px (48rem) / `xl` 1280px (80rem).

## 375px (mobile)

- [ ] Grid en **1 columna**, sin scroll horizontal / overflow.
- [ ] Texto no se corta ni se sale del contenedor; `text-wrap: pretty` aplica.
- [ ] Targets táctiles cómodos; nada pegado al borde.
- [ ] Imágenes/cards escalan al ancho disponible.

## 768px (tablet · md)

- [ ] Grid pasa a **2 columnas**.
- [ ] La transición desde 1 columna no deja huecos raros ni cards huérfanas.
- [ ] Padding del contenedor respira; no toca los bordes.

## 1280px (desktop · xl)

- [ ] Grid en **3 columnas**.
- [ ] Sin overflow horizontal; el contenido respeta el ancho máximo del
      contenedor.
- [ ] Alineación consistente entre filas.

## Clasificación de errores de consola

| Síntoma | Clasificación | Acción |
|---------|---------------|--------|
| `Cannot redefine property: ethereum`, `evmAsk.js`, wallet inyectada | Ruido de extensión | Ignorar; no es de la app |
| `chrome-extension://...` en el stack | Ruido de extensión | Ignorar |
| Stack trace que pasa por archivos de `apps/web` | Bug real | Investigar / reportar |

Regla: ruido de extensión salvo que el stack incluya código de `apps/web`.

## Honestidad al reportar

- "Reglas responsive presentes en el bundle" (lo que da el script) **≠** "se ve
  bien en mobile" (lo que da mirar).
- Si no se verificó visualmente un viewport, decir "no verificado visualmente",
  no inventar.
