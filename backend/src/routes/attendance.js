import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { validateAttendanceCreate } from '../domain/schemas.js';

export function createAttendanceRouter(repos) {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const errors = validateAttendanceCreate(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);
      const { userCode, activityId } = req.body;

      const user = await repos.users.findByCode(userCode);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');

      const activity = await repos.activities.findById(activityId);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');

      const existing = await repos.attendance.findOne({
        userId: user.id,
        activityId,
      });
      if (existing) {
        throw new HttpError(409, 'El usuario ya está registrado en esta actividad');
      }

      const result = await repos.activities.incrementEnrolledIfRoom(activityId);
      if (!result.ok) {
        if (result.reason === 'full') throw new HttpError(409, 'Cupo agotado');
        if (result.reason === 'not_active') {
          throw new HttpError(409, 'La actividad no está activa');
        }
        throw new HttpError(404, 'Actividad no encontrada');
      }

      const attendance = await repos.attendance.create({
        userId: user.id,
        userCode: user.code,
        activityId,
        activityName: activity.name,
      });

      await repos.users.incrementVisit(user.code);

      res.status(201).json(attendance);
    } catch (e) {
      next(e);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const filters = {};
      if (req.query.userCode) filters.userCode = req.query.userCode;
      if (req.query.activityId) filters.activityId = req.query.activityId;
      const attendances = await repos.attendance.findAll(filters);
      res.json({ attendances, total: attendances.length });
    } catch (e) {
      next(e);
    }
  });

  router.get('/by-user/:userCode', async (req, res, next) => {
    try {
      const user = await repos.users.findByCode(req.params.userCode);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const attendances = await repos.attendance.findByUserId(user.id);
      res.json({ attendances, total: attendances.length });
    } catch (e) {
      next(e);
    }
  });

  router.get('/by-activity/:activityId', async (req, res, next) => {
    try {
      const activity = await repos.activities.findById(req.params.activityId);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      const attendances = await repos.attendance.findByActivityId(
        req.params.activityId,
      );
      res.json({ attendances, total: attendances.length });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const att = await repos.attendance.delete(req.params.id);
      if (!att) throw new HttpError(404, 'Registro no encontrado');
      await repos.activities.decrementEnrolled(att.activityId);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
