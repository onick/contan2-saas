import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { validateAttendanceCreate } from '../domain/schemas.js';

export function createAttendanceRouter() {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const errors = validateAttendanceCreate(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);
      const { userCode, activityId } = req.body;
      const retroactive = req.body.retroactive === true;

      const user = await req.repos.users.findByCode(userCode);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');

      const activity = await req.repos.activities.findById(activityId);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');

      const existing = await req.repos.attendance.findOne({
        userId: user.id,
        activityId,
      });
      if (existing) {
        if (!existing.checkedInAt) {
          // RSVP previo confirmado, ahora check-in real
          const updated = await req.repos.attendance.markCheckedIn(existing.id);
          await req.repos.users.incrementVisit(user.code);
          return res.status(200).json({ ...updated, upgradedFromRsvp: true });
        }
        throw new HttpError(409, 'El usuario ya está registrado en esta actividad');
      }

      // Path retroactivo: para corregir asistencia a una actividad ya
      // finalizada. Bypassa el check de status='activa' y capacidad
      // (asume que la actividad ya pasó y estamos completando datos).
      // Nunca permite si está cancelada.
      const result = retroactive
        ? await req.repos.activities.incrementEnrolledForce(activityId)
        : await req.repos.activities.incrementEnrolledIfRoom(activityId);

      if (!result.ok) {
        if (result.reason === 'full') throw new HttpError(409, 'Cupo agotado');
        if (result.reason === 'not_active') {
          throw new HttpError(409, 'La actividad no está activa');
        }
        if (result.reason === 'cancelled') {
          throw new HttpError(409, 'La actividad está cancelada');
        }
        throw new HttpError(404, 'Actividad no encontrada');
      }

      const attendance = await req.repos.attendance.create({
        userId: user.id,
        userCode: user.code,
        activityId,
        activityName: activity.name,
      });

      await req.repos.users.incrementVisit(user.code);

      res.status(201).json({ ...attendance, retroactive });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/attendance/anonymous · check-in sin credencial
  // Caso: visitante pasa por la puerta sin escanear (grupo en pico, VIP,
  // prensa, alguien que perdió su credencial). El staff dispara este
  // endpoint para que el conteo refleje la realidad. count opcional 1..10
  // permite registrar grupos. Cero PII queda asociada — quedan trazables
  // por activity/timestamp/anonymous=TRUE.
  router.post('/anonymous', async (req, res, next) => {
    try {
      const activityId = String(req.body?.activityId || '').trim();
      const count = Math.max(1, Math.min(10, Number(req.body?.count) || 1));
      if (!activityId) throw new HttpError(400, 'activityId requerido');

      const activity = await req.repos.activities.findById(activityId);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      if (activity.status !== 'activa') {
        throw new HttpError(409, 'La actividad no está activa');
      }

      const created = [];
      const errors = [];
      for (let i = 0; i < count; i++) {
        const reservation = await req.repos.activities.incrementEnrolledIfRoom(activityId);
        if (!reservation.ok) {
          errors.push(reservation.reason || 'unknown');
          break;
        }
        try {
          const att = await req.repos.attendance.create({
            activityId,
            activityName: activity.name,
            anonymous: true,
            checkedIn: true,
          });
          created.push(att);
        } catch (e) {
          await req.repos.activities.decrementEnrolled(activityId);
          errors.push(e.message);
          break;
        }
      }

      const status = created.length === count ? 201 : (created.length > 0 ? 207 : 409);
      res.status(status).json({
        registered: created.length,
        requested: count,
        errors,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const filters = {};
      if (req.query.userCode) filters.userCode = req.query.userCode;
      if (req.query.activityId) filters.activityId = req.query.activityId;
      const attendances = await req.repos.attendance.findAll(filters);
      res.json({ attendances, total: attendances.length });
    } catch (e) {
      next(e);
    }
  });

  router.get('/by-user/:userCode', async (req, res, next) => {
    try {
      const user = await req.repos.users.findByCode(req.params.userCode);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const attendances = await req.repos.attendance.findByUserId(user.id);
      res.json({ attendances, total: attendances.length });
    } catch (e) {
      next(e);
    }
  });

  router.get('/by-activity/:activityId', async (req, res, next) => {
    try {
      const activity = await req.repos.activities.findById(req.params.activityId);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      const attendances = await req.repos.attendance.findByActivityId(
        req.params.activityId,
      );
      res.json({ attendances, total: attendances.length });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const att = await req.repos.attendance.delete(req.params.id);
      if (!att) throw new HttpError(404, 'Registro no encontrado');
      await req.repos.activities.decrementEnrolled(att.activityId);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
