// apps/api-v2/src/services/audit-activity.ts · escritura de auditoría de actividades.
// Una sola fila por acción en tenant_audit_log, dentro de la misma transacción
// (withTenant) que la mutación. Sin PII: sólo nombre de la actividad y campos tocados.

interface AuditInserter {
  insertInto: (table: 'tenant_audit_log') => {
    values: (v: Record<string, unknown>) => { execute: () => Promise<unknown> };
  };
}

export async function writeActivityAudit(
  db: unknown,
  p: {
    orgId: string;
    staff: { id: string; role: string };
    action: 'activity.created' | 'activity.updated' | 'activity.status_changed';
    activityId: string;
    name: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await (db as AuditInserter)
    .insertInto('tenant_audit_log')
    .values({
      organization_id: p.orgId,
      actor_staff_id: p.staff.id,
      actor_email_masked: null,
      actor_role: p.staff.role,
      action: p.action,
      target_type: 'activity',
      target_id: p.activityId,
      target_label: p.name,
      metadata: JSON.stringify(p.metadata ?? {}),
    })
    .execute();
}
