# Contan2 · Skills internas versionadas

Fuente de verdad de las skills propias de Contan2. **Estas carpetas son el
original**; `.claude/skills/` solo contiene *symlinks* a estos directorios y
está gitignored. Nunca edites una skill desde `.claude/skills/` ni copies
contenido hacia `~/.claude` a mano: editá acá y dejá que el symlink refleje.

## Skills

| Skill | Cuándo se activa | Qué hace |
|-------|------------------|----------|
| `contan2-release-a5` | deploy / release a producción | Envuelve `scripts/release/deploy-coolify.mjs` con el gate A.5 dual-verify y reglas duras de autorización. |
| `contan2-v2-pr-workflow` | trabajo en la migración v2 (monorepo Next/Fastify/Kysely) | Disciplina de PRs incrementales: plan primero, sin push hasta reporte, cero código v1. |
| `contan2-responsive-smoke` | verificar responsive de `apps/web` | Honestidad de cobertura: el check de CSS es necesario pero no suficiente; clasifica ruido de extensiones. |

## Instalación local (symlinks)

El install script **solo crea symlinks**. No copia secretos, no toca
producción, no clona repos externos y es idempotente.

```bash
# Proyecto-local → .claude/skills/ (default, recomendado)
bash scripts/skills/install-local-skills.sh

# Ver qué haría sin tocar nada
bash scripts/skills/install-local-skills.sh --dry-run

# Global → ~/.claude/skills/
bash scripts/skills/install-local-skills.sh --global
```

Tras instalar, las skills aparecen como `.claude/skills/<name>` (symlink
relativo a `tools/skills/<name>`). `.claude/skills/` está en `.gitignore`,
así que los symlinks no se commitean — la fuente versionada es lo único que
viaja en el repo.

## Estructura de una skill

```
tools/skills/<name>/
  SKILL.md            # frontmatter YAML (name, description) + cuerpo
  references/*.md     # material de apoyo opcional
  scripts/*.sh        # helpers opcionales (read-only por defecto)
```

`SKILL.md` lleva frontmatter mínimo:

```yaml
---
name: contan2-release-a5
description: <una línea que el modelo usa para decidir cuándo activarla>
---
```
