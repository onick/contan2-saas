// apps/api-v2/src/services/report-audit.ts · auditoría de generación de reportes
// en tenant_audit_log. Una fila por reporte generado. SIN PII: actor enmascarado,
// IP hasheada, metadata sólo con el tipo/formato/rango/filas (jamás datos de
// visitantes). target_id = nombre del reporte (no un id de PII).

import type { DbClient } from '@contan2/db';
import { hashIp, maskEmail } from './audit-mask.js';

export type ReportAuditAction = 'report.generated';

export interface ReportAuditInput {
  orgId: string;
  staff: { id: string; email: string; role: string };
  report: string; // p. ej. 'attendance-by-activity'
  format: string; // 'json' | 'csv'
  meta?: Record<string, unknown>; // sin PII (from/to/rows)
  ip?: string | null;
  ua?: string | null;
}

export async function writeReportAudit(db: DbClient, a: ReportAuditInput): Promise<void> {
  await db
    .insertInto('tenant_audit_log')
    .values({
      organization_id: a.orgId,
      actor_staff_id: a.staff.id,
      actor_email_masked: maskEmail(a.staff.email),
      actor_role: a.staff.role,
      action: 'report.generated',
      target_type: 'report',
      target_id: a.report,
      target_label: null,
      metadata: JSON.stringify({ report: a.report, format: a.format, ...(a.meta ?? {}) }),
      ip_hash: hashIp(a.ip),
      ua: a.ua ?? null,
    })
    .execute();
}
