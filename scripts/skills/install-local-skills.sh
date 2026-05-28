#!/usr/bin/env bash
#
# install-local-skills.sh · instala las skills internas versionadas de Contan2
# creando SYMLINKS desde tools/skills/<name> (fuente de verdad, en el repo)
# hacia el directorio de skills de Claude.
#
# Garantías:
#   - Solo crea symlinks. NO copia archivos, NO copia secretos.
#   - NO toca producción, NO corre deploys, NO clona repos externos.
#   - Idempotente: si el symlink ya es correcto, no hace nada; si apunta mal,
#     lo recrea; si hay un archivo/directorio real en el destino, avisa y NO
#     lo pisa.
#
# Targets:
#   (default)   .claude/skills/         (proyecto-local, gitignored)
#   --global    ~/.claude/skills/       (global del usuario)
#
# Flags:
#   --dry-run   muestra qué haría, sin tocar nada
#   --global    instala en ~/.claude/skills en vez de .claude/skills
#   -h|--help   ayuda

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC_DIR="$REPO_ROOT/tools/skills"

DRY_RUN=0
GLOBAL=0

usage() {
  grep '^#' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --global)  GLOBAL=1 ;;
    -h|--help) usage ;;
    *) echo "ERROR: flag desconocido: $arg" >&2; echo "Usá --help." >&2; exit 1 ;;
  esac
done

if [[ ! -d "$SRC_DIR" ]]; then
  echo "ERROR: no existe la fuente de skills: $SRC_DIR" >&2
  exit 1
fi

if [[ $GLOBAL -eq 1 ]]; then
  TARGET_DIR="$HOME/.claude/skills"
else
  TARGET_DIR="$REPO_ROOT/.claude/skills"
fi

prefix=""
[[ $DRY_RUN -eq 1 ]] && prefix="[dry-run] "

echo "${prefix}Fuente : $SRC_DIR"
echo "${prefix}Destino: $TARGET_DIR"
echo

# Crear el directorio destino si falta (gitignored; inofensivo).
if [[ ! -d "$TARGET_DIR" ]]; then
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "${prefix}crearía directorio $TARGET_DIR"
  else
    mkdir -p "$TARGET_DIR"
  fi
fi

created=0; updated=0; skipped=0; warned=0

# Iterar SOLO directorios (*/) — esto excluye README.md y cualquier archivo
# suelto en tools/skills/.
for src in "$SRC_DIR"/*/; do
  [[ -d "$src" ]] || continue
  name="$(basename "$src")"
  link="$TARGET_DIR/$name"

  if [[ $GLOBAL -eq 1 ]]; then
    # Global: symlink absoluto (cruza fuera del repo).
    desired="$SRC_DIR/$name"
  else
    # Proyecto-local: symlink relativo, igual que el patrón existente
    # (.claude/skills/<name> -> ../../tools/skills/<name>).
    desired="../../tools/skills/$name"
  fi

  if [[ -L "$link" ]]; then
    current="$(readlink "$link")"
    if [[ "$current" == "$desired" ]]; then
      echo "${prefix}ok      $name (symlink ya correcto)"
      skipped=$((skipped + 1))
      continue
    fi
    echo "${prefix}recrear $name (apuntaba a '$current' -> '$desired')"
    if [[ $DRY_RUN -eq 0 ]]; then
      rm "$link"
      ln -s "$desired" "$link"
    fi
    updated=$((updated + 1))
  elif [[ -e "$link" ]]; then
    # Existe algo real (no symlink): nunca pisar.
    echo "${prefix}AVISO   $name: existe un archivo/directorio real en $link — se omite (no se pisa)" >&2
    warned=$((warned + 1))
  else
    echo "${prefix}crear   $name -> $desired"
    if [[ $DRY_RUN -eq 0 ]]; then
      ln -s "$desired" "$link"
    fi
    created=$((created + 1))
  fi
done

echo
echo "${prefix}Resumen: creados=$created actualizados=$updated sin-cambios=$skipped avisos=$warned"
[[ $warned -gt 0 ]] && echo "${prefix}Hubo avisos: revisá los destinos con archivos reales." >&2
exit 0
