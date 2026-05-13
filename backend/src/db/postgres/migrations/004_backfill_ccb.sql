-- =============================================================================
-- 004_backfill_ccb · crea la organization "Centro Cultural Banreservas" (org cero)
-- y asigna toda la data huérfana (sin organization_id) a esa org.
--
-- Idempotente: si la org ya existe, no crea otra. Si los datos ya están
-- asignados, no toca nada.
-- =============================================================================

-- Crear la org CCB si no existe. UUID determinístico fijo para que sea estable
-- entre dev/staging/prod (puedes regenerarlo solo una vez, antes del primer deploy).
INSERT INTO organizations (
  id, slug, name, legal_name, country, timezone, locale,
  primary_color, secondary_color, code_prefix,
  email_from_name, plan, status
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ccb',
  'Centro Cultural Banreservas',
  'Centro Cultural Banreservas',
  'DO',
  'America/Santo_Domingo',
  'es',
  '#1a237e',
  '#ff6f00',
  'CCB',
  'Centro Cultural Banreservas',
  'enterprise',
  'active'
)
ON CONFLICT DO NOTHING;

-- Suscripción enterprise interna (sin trial, sin stripe)
INSERT INTO subscriptions (
  organization_id, plan, status
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'enterprise',
  'active'
)
ON CONFLICT DO NOTHING;

-- Backfill: cualquier fila sin org se asigna al CCB
UPDATE users
   SET organization_id = '00000000-0000-0000-0000-000000000001'
 WHERE organization_id IS NULL;

UPDATE activities
   SET organization_id = '00000000-0000-0000-0000-000000000001'
 WHERE organization_id IS NULL;

UPDATE attendance
   SET organization_id = '00000000-0000-0000-0000-000000000001'
 WHERE organization_id IS NULL;
