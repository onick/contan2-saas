import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  validateActivityCreate,
  validateActivityUpdate,
  normalizeActivityData,
} from '../domain/schemas.js';
import { deleteUploadFile } from './uploads.js';
import { notifyActivityCancelled } from '../services/activityCancellation.js';
import { inviteUsersToActivity } from '../services/invitations.js';

// Tier de autorización por endpoint (ver docs/migration-v2/05-authorization-matrix.md):
//   POST   /                                    → STAFF        (operator crea actividades)
//   GET    /                                    → STAFF
//   GET    /:id                                 → STAFF
//   GET    /:id/attendees                       → STAFF
//   PUT    /:id                                 → STAFF
//   DELETE /:id                                 → ADMIN/OWNER  (destructivo)
//   GET    /:id/invitations                     → STAFF
//   POST   /:id/invitations                     → STAFF        (operator invita)
//   DELETE /:id/invitations/:invId              → STAFF        (revocar)

export function createActivitiesRouter() {
  const router = Router();
  // Aplicar requireStaffSession a TODO el router; los handlers que requieren
  // ADMIN/OWNER suman requireRole inline.
  router.use(requireStaffSession);

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
      const oldStatus = activity.status;
      const updated = await req.repos.activities.update(req.params.id, data);
      if (oldImage && oldImage !== updated.imageUrl) {
        deleteUploadFile(oldImage);
      }
      if (oldStatus !== 'cancelada' && updated.status === 'cancelada') {
        notifyActivityCancelled({
          repos: req.repos,
          activity: updated,
          organization: req.organization,
        }).catch(err =>
          console.error('[activities] notify cancelled failed:', err.message),
        );
      }
      res.json(updated);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', requireRole(['owner', 'admin']), async (req, res, next) => {
    try {
      const activity = await req.repos.activities.findById(req.params.id);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      const attendances = await req.repos.attendance.findByActivityId(req.params.id);
      if (attendances.length > 0 && activity.status !== 'cancelada') {
        throw new HttpError(
          409,
          'La actividad tiene asistencias registradas. Cancélala primero (los inscritos serán notificados por email) y luego podrás borrarla.',
        );
      }
      // Si está cancelada o sin asistencias, borrar (purgando attendance asociado primero)
      if (attendances.length > 0) {
        for (const att of attendances) {
          await req.repos.attendance.delete(att.id);
        }
      }
      const imageToDelete = activity.imageUrl;
      await req.repos.activities.delete(req.params.id);
      if (imageToDelete) deleteUploadFile(imageToDelete);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  // =========================================================================
  // Invitaciones (RSVP)
  // =========================================================================
  router.get('/:id/invitations', async (req, res, next) => {
    try {
      const activity = await req.repos.activities.findById(req.params.id);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      const invitations = await req.repos.invitations.findByActivity(req.params.id);
      // Enriquecer con datos del usuario (nombre + email)
      const enriched = await Promise.all(
        invitations.map(async inv => {
          const user = await req.repos.users.findById(inv.userId);
          return {
            ...inv,
            user: user
              ? {
                  code: user.code,
                  firstName: user.firstName,
                  lastName: user.lastName,
                  email: user.email,
                }
              : null,
          };
        }),
      );
      const counts = {
        pending: enriched.filter(i => i.status === 'pending').length,
        confirmed: enriched.filter(i => i.status === 'confirmed').length,
        declined: enriched.filter(i => i.status === 'declined').length,
        canceled: enriched.filter(i => i.status === 'canceled').length,
      };
      res.json({ invitations: enriched, total: enriched.length, counts });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/invitations', async (req, res, next) => {
    try {
      const activity = await req.repos.activities.findById(req.params.id);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      if (activity.status !== 'activa') {
        throw new HttpError(409, 'Solo se puede invitar a actividades activas');
      }
      const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : null;
      if (!userIds || userIds.length === 0) {
        throw new HttpError(400, 'Se requiere lista userIds');
      }
      if (userIds.length > 500) {
        throw new HttpError(400, 'Máximo 500 invitaciones por lote');
      }
      const result = await inviteUsersToActivity({
        repos: req.repos,
        organization: req.organization,
        activity,
        userIds,
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id/invitations/:invId', async (req, res, next) => {
    try {
      const inv = await req.repos.invitations.findById(req.params.invId);
      if (!inv) throw new HttpError(404, 'Invitación no encontrada');
      if (inv.activityId !== req.params.id) {
        throw new HttpError(404, 'Invitación no pertenece a esta actividad');
      }
      if (inv.status !== 'pending') {
        throw new HttpError(409, `No se puede cancelar (status: ${inv.status})`);
      }
      await req.repos.invitations.cancel(inv.id);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
