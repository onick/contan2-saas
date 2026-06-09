-- =============================================================================
-- 026_users_soft_delete · soft-archive de visitantes (ADITIVA · v1-compatible)
--
-- Agrega `users.deleted_at` (NULL = activo). v1 la ignora por completo (no la lee
-- ni la escribe) y sigue funcionando; v2 filtra `deleted_at IS NULL` para que los
-- visitantes archivados no aparezcan por defecto. NO existe hard-delete: archivar
-- = set deleted_at = now(); reactivar = deleted_at = NULL. El historial y las
-- asistencias se preservan intactos (no se tocan otras tablas).
--
-- 100% aditiva e idempotente (IF NOT EXISTS): las filas existentes quedan con
-- deleted_at = NULL (activas). SIN índice nuevo por ahora: los archivados son
-- pocos y el filtro `deleted_at IS NULL` se resuelve con los índices existentes
-- (users_org_created_idx); un índice parcial se agregará SÓLO si un EXPLAIN sobre
-- copia local de prod lo justifica a escala.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
