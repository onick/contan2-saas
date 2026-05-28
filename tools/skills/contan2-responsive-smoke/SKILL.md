---
name: contan2-responsive-smoke
description: Smoke de responsive para apps/web (Next.js 16 + Tailwind v4). Actívala cuando el usuario pida verificar que un layout responde a breakpoints, revisar grids/columnas en mobile/tablet/desktop, o validar un cambio de UI v2. Enfatiza honestidad de cobertura — el check del CSS bundle es necesario pero no suficiente — y clasifica el ruido de extensiones del navegador.
---

# Contan2 · Responsive smoke (apps/web)

Verifica que `apps/web` responde a sus breakpoints. La filosofía central es
**honestidad de cobertura**: hay un check barato y determinístico (grep del CSS
compilado) que confirma que las clases responsive *existen* en el bundle, pero
**no** confirma que la página *se ve bien*. No mientas sobre lo segundo.

## Niveles de verificación

1. **CSS bundle (barato, automatizable)** — `scripts/verify-responsive-css.sh`
   greppea el CSS compilado de `apps/web/.next` buscando las columnas de grid
   (`repeat(1/2/3,...)`) y los media queries (`min-width: 48rem` / `80rem`).
   - **Necesario pero NO suficiente.** Que las reglas existan no implica que el
     layout no tenga overflow, que el contenido entre, o que se vea bien.
2. **Visual real (navegador)** — abrir en viewports 375 / 768 / 1280 y mirar.
   Esto es lo único que confirma "se ve bien". Ver
   `references/viewport-checklist.md`.

## REGLAS DURAS

1. **No afirmar "responsive verificado" solo con el check de CSS.** Reportá
   exactamente qué se verificó: "las reglas responsive están en el bundle" ≠
   "se ve bien en mobile". Si no hubo verificación visual, decilo.
2. **Errores `chrome-extension://` o `window.ethereum` se clasifican como ruido
   de extensión salvo que el stack incluya código de `apps/web`.** Cosas como
   `Cannot redefine property: ethereum` / `evmAsk.js` / wallets inyectadas son
   de extensiones del navegador del usuario, no de nuestro código. No las
   "arregles" en código ni las cuentes como bug de la app. Solo escalá si el
   stack trace pasa por archivos de `apps/web`.
3. **No instalar/correr Playwright sin OK explícito.** El check de CSS no
   necesita browser. La verificación visual la hace el usuario, o Playwright
   solo si lo autoriza.
4. **Read-only.** El script de verificación no muta nada; solo lee el bundle.

## Uso

```bash
# 1. Construir el bundle (si no existe)
cd apps/web && pnpm build   # o: pnpm --filter @contan2/web build

# 2. Check de CSS (necesario, no suficiente)
bash tools/skills/contan2-responsive-smoke/scripts/verify-responsive-css.sh
```

El script falla con mensaje claro si `apps/web/.next` no existe (hay que
buildear primero) o si falta alguna regla responsive esperada.

## Al reportar

- Distinguí "CSS presente en bundle" de "validado visualmente".
- Si viste errores de consola, clasificá ruido de extensión vs. real (regla 2).
- Lista los viewports realmente mirados (375/768/1280) o decí "no verificado
  visualmente".
