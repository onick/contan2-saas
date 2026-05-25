// =============================================================================
// requirePlatformAdmin · valida sesión de platform admin (cookie distinta).
// =============================================================================

import { HttpError } from './errorHandler.js';
import { validateSession } from '../services/auth/sessionService.js';
import { PlatformSessionRepository } from '../db/postgres/platform/PlatformSessionRepository.js';
import { PlatformAdminRepository } from '../db/postgres/platform/PlatformAdminRepository.js';
import { initRepositories } from '../db/repositories.js';
import { config } from '../config.js';

const COOKIE = 'contan2_admin_session';

export function getPlatformCookieName() { return COOKIE; }

export async function requirePlatformAdmin(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return next(new HttpError(401, 'No autenticado'));

    if (config.DB_DRIVER !== 'postgres') {
      return next(new HttpError(503, 'Platform auth requiere Postgres'));
    }

    const inst = await initRepositories();
    const sessionRepo = new PlatformSessionRepository(inst.pool);
    const adminRepo = new PlatformAdminRepository(inst.pool);

    const session = await validateSession({ repo: sessionRepo, token });
    if (!session) return next(new HttpError(401, 'Sesión expirada o inválida'));

    const admin = await adminRepo.findById(session.accountId);
    if (!admin || admin.status !== 'active') {
      return next(new HttpError(401, 'Cuenta no disponible'));
    }

    req.platformAdmin = admin;
    req.platformSessionId = session.id;
    next();
  } catch (e) {
    next(e);
  }
}
