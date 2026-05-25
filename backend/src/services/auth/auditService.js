// =============================================================================
// auditService.js · helper para escribir entries al audit log.
// Nunca tumba un request: cualquier error se loggea y se traga.
// =============================================================================

import { createHash } from 'node:crypto';
import { AuditLogRepository } from '../../db/postgres/platform/AuditLogRepository.js';
import { initRepositories } from '../../db/repositories.js';
import { maskEmail } from '../../utils/log.js';
import { config } from '../../config.js';

let _repo = null;

async function getRepo() {
  if (config.DB_DRIVER !== 'postgres') return null;
  if (_repo) return _repo;
  const inst = await initRepositories();
  _repo = new AuditLogRepository(inst.pool);
  return _repo;
}

function sha256(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

/**
 * Escribe una entrada en el audit log derivando contexto del request.
 *
 * @param opts.req         request Express. Usamos req.organizationId,
 *                         req.currentStaff, req.ip, req.headers['user-agent'].
 * @param opts.action      string, ej "auth.login"
 * @param opts.targetType  string opcional, ej "staff_member"
 * @param opts.targetId    string|number opcional
 * @param opts.targetLabel string opcional, ej nombre legible del target
 * @param opts.metadata    objeto plano, será serializado a jsonb
 * @param opts.actorOverride {staffId?, emailMasked?, role?} cuando no hay
 *                          req.currentStaff (login fallido, accept-invitation)
 * @param opts.organizationIdOverride para flujos donde aún no se resolvió tenant
 */
export async function recordAudit({
  req,
  action,
  targetType,
  targetId,
  targetLabel,
  metadata,
  actorOverride,
  organizationIdOverride,
}) {
  try {
    const repo = await getRepo();
    if (!repo) return null;

    const organizationId = organizationIdOverride || req?.organizationId || req?.organization?.id || null;
    if (!organizationId) return null; // sin tenant no hay audit (esperado)

    const actorStaff = req?.currentStaff || null;
    const actor = actorOverride || {};

    const actorStaffId = actor.staffId || actorStaff?.id || null;
    const actorEmailMasked = actor.emailMasked
      || (actorStaff?.email ? maskEmail(actorStaff.email) : null);
    const actorRole = actor.role || actorStaff?.role || null;

    const ip = req?.ip || req?.socket?.remoteAddress || null;
    const ua = req?.headers?.['user-agent'] || null;

    return await repo.record({
      organizationId,
      actorStaffId,
      actorEmailMasked,
      actorRole,
      action,
      targetType: targetType || null,
      targetId: targetId != null ? String(targetId) : null,
      targetLabel: targetLabel || null,
      metadata: metadata || {},
      ipHash: ip ? sha256(ip) : null,
      ua,
    });
  } catch (e) {
    console.warn('[audit] recordAudit falló:', e.message);
    return null;
  }
}
