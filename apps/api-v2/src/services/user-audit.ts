// apps/api-v2/src/services/user-audit.ts · auditoría de acciones sobre visitantes
// (editar/reenviar credencial/archivar/reactivar) en tenant_audit_log. Sin PII
// sensible: el email del actor va enmascarado, la IP hasheada, y la metadata sólo
// lleva nombres de campos cambiados o flags, NUNCA valores de PII del visitante.

import { createHash } from 'node:crypto';
import type { DbClient } from '@contan2/db';

export type UserAuditAction = 'user.created' | 'user.updated' | 'credential.resent' | 'user.archived' | 'user.reactivated';

export interface UserAuditInput {
  orgId: string;
  staff: { id: string; email: string; role: string };
  action: UserAuditAction;
  targetUserId: string;
  metadata?: Record<string, unknown>; // sin PII (p. ej. { fields: ['email'] })
  ip?: string | null;
  ua?: string | null;
}

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

export async function writeUserAudit(tx: DbClient, a: UserAuditInput): Promise<void> {
  await tx.insertInto('tenant_audit_log').values({
    organization_id: a.orgId,
    actor_staff_id: a.staff.id,
    actor_email_masked: maskEmail(a.staff.email),
    actor_role: a.staff.role,
    action: a.action,
    target_type: 'user',
    target_id: a.targetUserId,
    target_label: null,
    metadata: JSON.stringify(a.metadata ?? {}),
    ip_hash: hashIp(a.ip),
    ua: a.ua ?? null,
  }).execute();
}
