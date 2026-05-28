#!/usr/bin/env bash
#
# verify-responsive-css.sh · check barato y read-only del CSS compilado de
# apps/web. Confirma que las reglas responsive (grids + media queries de los
# breakpoints md/xl) EXISTEN en el bundle de Next.
#
# IMPORTANTE: necesario pero NO suficiente. Que las reglas estén en el bundle
# no prueba que el layout se vea bien — eso requiere verificación visual
# (ver ../references/viewport-checklist.md). No reportes "responsive OK" solo
# con este script.
#
# No muta nada. Exit 0 si todas las reglas esperadas están presentes; 1 si
# falta alguna; 2 si no hay bundle (hay que buildear primero).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
NEXT_DIR="$REPO_ROOT/apps/web/.next"

if [[ ! -d "$NEXT_DIR" ]]; then
  echo "ERROR: no existe $NEXT_DIR" >&2
  echo "       Construí el bundle primero: (cd apps/web && pnpm build)" >&2
  exit 2
fi

# Contar los CSS compilados bajo .next (sin mapfile — bash 3.2 de macOS no lo
# tiene). El grep posterior usa -R --include, así que no necesitamos la lista.
CSS_COUNT="$(find "$NEXT_DIR" -type f -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"

if [[ "$CSS_COUNT" -eq 0 ]]; then
  echo "ERROR: no se encontraron archivos .css bajo $NEXT_DIR" >&2
  echo "       ¿Build incompleto? Probá (cd apps/web && pnpm build)" >&2
  exit 2
fi

echo "Bundle CSS: $CSS_COUNT archivo(s) bajo apps/web/.next"

# Patrones esperados: "etiqueta" => "regex grep -E"
# - breakpoints md (48rem) y xl (80rem)
# - grids de 2 y 3 columnas (Tailwind v4: repeat(2,...) / repeat(3,...))
declare -a LABELS=(
  "media query md (48rem)"
  "media query xl (80rem)"
  "grid 2 columnas (repeat(2)"
  "grid 3 columnas (repeat(3)"
)
declare -a PATTERNS=(
  "48rem"
  "80rem"
  "repeat\\(2"
  "repeat\\(3"
)

missing=0
for i in "${!PATTERNS[@]}"; do
  if grep -REq --include='*.css' -- "${PATTERNS[$i]}" "$NEXT_DIR" 2>/dev/null; then
    echo "  OK     ${LABELS[$i]}"
  else
    echo "  FALTA  ${LABELS[$i]}" >&2
    missing=$((missing + 1))
  fi
done

echo
if [[ $missing -gt 0 ]]; then
  echo "RESULTADO: faltan $missing regla(s) responsive en el bundle." >&2
  exit 1
fi

echo "RESULTADO: todas las reglas responsive esperadas están en el bundle."
echo "RECORDATORIO: esto NO valida que se vea bien — falta verificación visual"
echo "              (375 / 768 / 1280). Ver references/viewport-checklist.md."
