import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { buildActivityExcelReport, reportFilename } from '../services/reports/activityExcelReport.js';

export function createReportsRouter() {
  const router = Router();

  // GET /api/reports/activity/:id.xlsx
  // Genera un informe Excel branded de asistencia para la actividad.
  router.get('/activity/:id.xlsx', async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Sin organización');
      const activity = await req.repos.activities.findById(req.params.id);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');

      const attendances = await req.repos.attendance.findByActivityId(req.params.id);

      // Cargar usuarios + total de asistencias (para clasificar primera-visita / recurrente / VIP)
      const usersAndAffs = await Promise.all(
        attendances.map(async att => {
          const user = await req.repos.users.findById(att.userId);
          if (!user) return { user: null, affinity: { totalAttendances: 0 } };
          const allAtts = await req.repos.attendance.findByUserId(user.id);
          return {
            user,
            affinity: { totalAttendances: allAtts.length },
          };
        }),
      );
      const users = usersAndAffs.map(x => x.user).filter(Boolean);
      const affinities = usersAndAffs.map(x => x.affinity);

      const wb = await buildActivityExcelReport({
        organization: req.organization,
        activity,
        attendances,
        users,
        affinities,
      });

      const filename = reportFilename(activity);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
