// apps/api-v2/src/services/audit-mask.ts · helpers de anonimización para auditoría.
// El email del actor se enmascara (a***@dominio) y la IP se hashea (sha256). Sin
// estos, tenant_audit_log filtraría PII. Reutilizable por los writers de audit.

import { createHash } from 'node:crypto';

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex');
}
