import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import {
  validatePublicCheckin,
  normalizeUserData,
} from '../domain/schemas.js';
import { sendCredentialEmail } from '../services/email.js';

function publicUser(u) {
  return { code: u.code, firstName: u.firstName, lastName: u.lastName, visitCount: u.visitCount };
}

function publicActivity(a) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    location: a.location,
    date: a.date,
    capacity: a.capacity,
    enrolledCount: a.enrolledCount,
    description: a.description,
    imageUrl: a.imageUrl ?? null,
  };
}

export function createPublicRouter(repos) {
  const router = Router();

  router.get('/activities', async (req, res, next) => {
    try {
      const all = await repos.activities.findAll({ status: 'activa' });
      const available = all
        .filter(a => a.enrolledCount < a.capacity)
        .map(publicActivity);
      res.json({ activities: available, total: available.length });
    } catch (e) {
      next(e);
    }
  });

  router.get('/users/:code', async (req, res, next) => {
    try {
      const code = String(req.params.code || '').trim().toUpperCase();
      if (!/^CCB-[A-Z0-9]{6}$/.test(code)) {
        throw new HttpError(400, 'Formato de código inválido');
      }
      const user = await repos.users.findByCode(code);
      if (!user) throw new HttpError(404, 'Código no encontrado');
      res.json(publicUser(user));
    } catch (e) {
      next(e);
    }
  });

  router.post('/checkin', async (req, res, next) => {
    try {
      const errors = validatePublicCheckin(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);

      const activityId = String(req.body.activityId).trim();
      const activity = await repos.activities.findById(activityId);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      if (activity.status !== 'activa') {
        throw new HttpError(409, 'La actividad no está activa');
      }

      let user;
      let isNewUser = false;

      if (req.body.userCode) {
        const code = String(req.body.userCode).trim().toUpperCase();
        user = await repos.users.findByCode(code);
        if (!user) throw new HttpError(404, 'Código no encontrado');

        const existing = await repos.attendance.findOne({
          userId: user.id,
          activityId,
        });
        if (existing) {
          throw new HttpError(409, 'Ya estás registrado en esta actividad');
        }

        const reservation = await repos.activities.incrementEnrolledIfRoom(activityId);
        if (!reservation.ok) {
          if (reservation.reason === 'full') throw new HttpError(409, 'Cupo agotado');
          if (reservation.reason === 'not_active') {
            throw new HttpError(409, 'La actividad no está activa');
          }
          throw new HttpError(404, 'Actividad no encontrada');
        }

        try {
          await repos.attendance.create({
            userId: user.id,
            userCode: user.code,
            activityId,
            activityName: activity.name,
          });
          user = await repos.users.incrementVisit(user.code);
        } catch (e) {
          await repos.activities.decrementEnrolled(activityId);
          throw e;
        }
      } else {
        const data = normalizeUserData(req.body.newUser);

        if (data.email) {
          const existing = await repos.users.findByEmail(data.email);
          if (existing) {
            return res.status(409).json({
              error: 'Este email ya tiene un código registrado',
              existingCode: existing.code,
              existingName: `${existing.firstName} ${existing.lastName}`,
            });
          }
        }

        const reservation = await repos.activities.incrementEnrolledIfRoom(activityId);
        if (!reservation.ok) {
          if (reservation.reason === 'full') throw new HttpError(409, 'Cupo agotado');
          if (reservation.reason === 'not_active') {
            throw new HttpError(409, 'La actividad no está activa');
          }
          throw new HttpError(404, 'Actividad no encontrada');
        }

        try {
          user = await repos.users.create(data);
          isNewUser = true;
          await repos.attendance.create({
            userId: user.id,
            userCode: user.code,
            activityId,
            activityName: activity.name,
          });
        } catch (e) {
          await repos.activities.decrementEnrolled(activityId);
          throw e;
        }
        if (user.email) {
          sendCredentialEmail(user).catch(err =>
            console.error('[public-checkin] envío credencial falló:', err.message),
          );
        }
      }

      res.status(201).json({
        user: {
          code: user.code,
          firstName: user.firstName,
          lastName: user.lastName,
          visitCount: user.visitCount,
        },
        activity: {
          id: activity.id,
          name: activity.name,
          date: activity.date,
          location: activity.location,
          type: activity.type,
        },
        isNewUser,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
