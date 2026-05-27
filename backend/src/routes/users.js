import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  validateUserCreate,
  validateUserUpdate,
  normalizeUserData,
} from '../domain/schemas.js';
import { sendCredentialEmail } from '../services/email.js';

// Tier de autorización por endpoint (ver docs/migration-v2/05-authorization-matrix.md):
//   POST   /                  → STAFF        (operator crea visitantes en recepción)
//   POST   /bulk              → ADMIN/OWNER  (import masivo es operación de admin)
//   GET    /                  → STAFF
//   GET    /:code             → STAFF
//   PATCH  /:code/visit       → STAFF        (incremento de visita durante check-in)
//   PUT    /:code             → STAFF        (operator corrige typos)
//   DELETE /:code             → ADMIN/OWNER  (destructivo)

export function createUsersRouter() {
  const router = Router();

  router.post('/', requireStaffSession, async (req, res, next) => {
    try {
      const errors = validateUserCreate(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);
      const data = normalizeUserData(req.body);
      const existing = await req.repos.users.findByEmail(data.email);
      if (existing) throw new HttpError(409, 'El email ya está registrado');
      const user = await req.repos.users.create(data);
      if (user.email) {
        sendCredentialEmail(user, req.organization).then(r => {
          if (r?.sent) {
            req.repos.users.markCredentialSent(user.code).catch(() => {});
          }
        }).catch(err =>
          console.error('[users] envío credencial falló:', err.message),
        );
      }
      res.status(201).json(user);
    } catch (e) {
      next(e);
    }
  });

  router.post('/bulk', requireStaffSession, requireRole(['owner', 'admin']), async (req, res, next) => {
    try {
      const list = Array.isArray(req.body?.users) ? req.body.users : null;
      if (!list) throw new HttpError(400, 'Body debe contener { users: [...] }');
      if (list.length === 0) throw new HttpError(400, 'Lista de usuarios vacía');
      if (list.length > 5000) {
        throw new HttpError(400, 'Máximo 5000 usuarios por importación');
      }

      const created = [];
      const errors = [];
      const seenEmails = new Set();

      for (let i = 0; i < list.length; i++) {
        const raw = list[i];
        const validation = validateUserCreate(raw);
        if (validation.length) {
          errors.push({
            index: i,
            email: raw?.email ?? null,
            error: 'Datos inválidos',
            details: validation.map(d => `${d.field}: ${d.message}`),
          });
          continue;
        }
        const data = normalizeUserData(raw);
        if (data.email) {
          if (seenEmails.has(data.email)) {
            errors.push({
              index: i,
              email: data.email,
              error: 'Email duplicado dentro del archivo',
            });
            continue;
          }
          seenEmails.add(data.email);

          const existing = await req.repos.users.findByEmail(data.email);
          if (existing) {
            errors.push({
              index: i,
              email: data.email,
              error: 'Email ya registrado en el sistema',
            });
            continue;
          }
        }
        try {
          const user = await req.repos.users.create(data);
          created.push(user);
        } catch (e) {
          errors.push({
            index: i,
            email: data.email,
            error: e.message || 'Error al crear usuario',
          });
        }
      }

      res.status(201).json({
        created,
        errors,
        summary: {
          total: list.length,
          created: created.length,
          failed: errors.length,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/', requireStaffSession, async (req, res, next) => {
    try {
      const users = await req.repos.users.findAll();
      users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Enriquecer con lastVisitAt + visitsByWeek (8 semanas hacia atrás)
      // de un solo barrido sobre attendance (cheap: 1 query, O(N) en memoria).
      // Skip si no hay repo de attendance (modo memory legacy resiliente).
      try {
        const allAtt = await req.repos.attendance.findAll();
        const now = Date.now();
        const WEEK_MS = 7 * 86400000;
        const byUser = new Map();
        for (const a of allAtt) {
          if (!a.userId) continue;
          const t = new Date(a.registeredAt).getTime();
          let bucket = byUser.get(a.userId);
          if (!bucket) {
            bucket = { lastAt: t, weeks: [0, 0, 0, 0, 0, 0, 0, 0] };
            byUser.set(a.userId, bucket);
          } else if (t > bucket.lastAt) {
            bucket.lastAt = t;
          }
          const wIdx = Math.floor((now - t) / WEEK_MS);
          if (wIdx >= 0 && wIdx < 8) bucket.weeks[wIdx]++;
        }
        for (const u of users) {
          const b = byUser.get(u.id);
          u.lastVisitAt = b ? new Date(b.lastAt).toISOString() : null;
          u.visitsByWeek = b ? b.weeks : [0, 0, 0, 0, 0, 0, 0, 0];
        }
      } catch (e) {
        // No queremos romper el listado si el enrichment falla; los
        // campos quedan undefined y el frontend tolera ausencia.
        console.warn('[users:list] enrichment skipped:', e.message);
      }

      res.json({ users, total: users.length });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:code', requireStaffSession, async (req, res, next) => {
    try {
      const user = await req.repos.users.findByCode(req.params.code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      res.json(user);
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:code/visit', requireStaffSession, async (req, res, next) => {
    try {
      const user = await req.repos.users.incrementVisit(req.params.code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      res.json(user);
    } catch (e) {
      next(e);
    }
  });

  router.put('/:code', requireStaffSession, async (req, res, next) => {
    try {
      const errors = validateUserUpdate(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);
      const user = await req.repos.users.findByCode(req.params.code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const data = normalizeUserData(req.body);
      if (data.email && data.email !== user.email) {
        const conflict = await req.repos.users.findByEmail(data.email);
        if (conflict) throw new HttpError(409, 'El email ya está registrado');
      }
      const updated = await req.repos.users.update(req.params.code, data);
      res.json(updated);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:code', requireStaffSession, requireRole(['owner', 'admin']), async (req, res, next) => {
    try {
      const user = await req.repos.users.findByCode(req.params.code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const attendances = await req.repos.attendance.findByUserId(user.id);
      if (attendances.length > 0) {
        throw new HttpError(409, 'El usuario tiene asistencias registradas');
      }
      await req.repos.users.delete(req.params.code);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
