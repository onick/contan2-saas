// apps/api-v2/src/services/checkin-audit.ts · escritura de auditoría del check-in
// administrativo. Se llama DENTRO de la transacción del check-in: si falla, el
// caller hace rollback completo (asistencia + capacidad). NO persiste PII sensible
// (email/teléfono/PIN/token): sólo el email del actor ENMASCARADO + ip HASHEADA +
// metadata mínima (modo, attendanceId). Exportada como módulo para poder forzar
// su fallo en tests (rollback).

import { createHash } from 'node:crypto';
import type { DbClient } from '@contan2/db';

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}
function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex');
}

export interface CheckinAuditInput {
  orgId: string;
  staff: { id: string; email: string; role: string };
  action: 'checkin.manual' | 'checkin.anonymous';
  activityId: string;
  attendanceId: string;
  mode: 'existing' | 'new' | 'anonymous';
  ip?: string | null;
  ua?: string | null;
}

export async function writeCheckinAudit(tx: DbClient, a: CheckinAuditInput): Promise<void> {
  await tx
    .insertInto('tenant_audit_log')
    .values({
      organization_id: a.orgId,
      actor_staff_id: a.staff.id,
      actor_email_masked: maskEmail(a.staff.email),
      actor_role: a.staff.role,
      action: a.action,
      target_type: 'activity',
      target_id: a.activityId,
      target_label: null,
      // metadata SIN PII (sólo modo + id de asistencia).
      metadata: JSON.stringify({ mode: a.mode, attendanceId: a.attendanceId }),
      ip_hash: hashIp(a.ip),
      ua: a.ua ?? null,
    })
    .execute();
}
