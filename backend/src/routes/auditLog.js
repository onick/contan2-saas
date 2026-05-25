// =============================================================================
// auditLog.js · endpoint de consulta del audit_log para owners/admins.
// =============================================================================

import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';
import { requireRole } from '../middleware/requireRole.js';
import { config } from '../config.js';
import { initRepositories } from '../db/repositories.js';
import { AuditLogRepository } from '../db/postgres/platform/AuditLogRepository.js';

export function createAuditLogRouter() {
  const router = Router();

  router.get('/',
    requireStaffSession,
    requireRole(['owner', 'admin']),
    async (req, res, next) => {
      try {
        if (config.DB_DRIVER !== 'postgres') {
          throw new HttpError(503, 'Audit log requiere DB_DRIVER=postgres');
        }
        const inst = await initRepositories();
        const repo = new AuditLogRepository(inst.pool);

        const result = await repo.list({
          organizationId: req.organization.id,
          limit: req.query.limit ? Number(req.query.limit) : 50,
          before: req.query.before ? String(req.query.before) : undefined,
          action: req.query.action ? String(req.query.action) : undefined,
          actorStaffId: req.query.actor ? String(req.query.actor) : undefined,
          since: req.query.since ? String(req.query.since) : undefined,
          until: req.query.until ? String(req.query.until) : undefined,
        });
        res.json(result);
      } catch (e) { next(e); }
    }
  );

  return router;
}
