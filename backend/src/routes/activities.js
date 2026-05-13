import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import {
  validateActivityCreate,
  validateActivityUpdate,
  normalizeActivityData,
} from '../domain/schemas.js';
import { deleteUploadFile } from './uploads.js';

export function createActivitiesRouter() {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const errors = validateActivityCreate(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);
      const data = normalizeActivityData(req.body);
      const activity = await req.repos.activities.create(data);
      res.status(201).json(activity);
    } catch (e) {
      next(e);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const filters = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.type) filters.type = req.query.type;
      if (req.query.date) filters.date = req.query.date;
      const activities = await req.repos.activities.findAll(filters);
      res.json({ activities, total: activities.length });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const activity = await req.repos.activities.findById(req.params.id);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      res.json(activity);
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id/attendees', async (req, res, next) => {
    try {
      const activity = await req.repos.activities.findById(req.params.id);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      const attendances = await req.repos.attendance.findByActivityId(req.params.id);
      const attendees = await Promise.all(
        attendances.map(async a => {
          const user = await req.repos.users.findById(a.userId);
          return {
            attendanceId: a.id,
            code: a.userCode,
            firstName: user?.firstName || '',
            lastName: user?.lastName || '',
            email: user?.email || null,
            phone: user?.phone || null,
            visitCount: user?.visitCount || 0,
            registeredAt: a.registeredAt,
          };
        }),
      );
      attendees.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
      res.json({ activity, attendees, total: attendees.length });
    } catch (e) {
      next(e);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const errors = validateActivityUpdate(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);
      const activity = await req.repos.activities.findById(req.params.id);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      const data = normalizeActivityData(req.body);
      if (data.capacity != null && data.capacity < activity.enrolledCount) {
        throw new HttpError(
          409,
          `capacity (${data.capacity}) no puede ser menor que el número de inscritos (${activity.enrolledCount})`,
        );
      }
      const oldImage = activity.imageUrl;
      const updated = await req.repos.activities.update(req.params.id, data);
      if (oldImage && oldImage !== updated.imageUrl) {
        deleteUploadFile(oldImage);
      }
      res.json(updated);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const activity = await req.repos.activities.findById(req.params.id);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      const attendances = await req.repos.attendance.findByActivityId(req.params.id);
      if (attendances.length > 0) {
        throw new HttpError(409, 'La actividad tiene asistencias registradas');
      }
      const imageToDelete = activity.imageUrl;
      await req.repos.activities.delete(req.params.id);
      if (imageToDelete) deleteUploadFile(imageToDelete);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
