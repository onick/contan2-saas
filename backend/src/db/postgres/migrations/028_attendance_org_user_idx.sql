-- 028_attendance_org_user_idx · índice compuesto para las agregaciones de
-- afinidad (segmentos, resumen post-evento, affinity de usuario) que filtran
-- por organization_id y agrupan por user_id. Aditiva; v1 la ignora.
CREATE INDEX IF NOT EXISTS attendance_org_user_idx
  ON attendance (organization_id, user_id)
  WHERE user_id IS NOT NULL;
