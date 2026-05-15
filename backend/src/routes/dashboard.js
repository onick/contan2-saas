import { Router } from 'express';

const PERIODS = {
  today: { days: 1, label: 'Hoy' },
  '7d': { days: 7, label: 'Últimos 7 días' },
  '30d': { days: 30, label: 'Últimos 30 días' },
  '90d': { days: 90, label: 'Últimos 90 días' },
};

function startOfDay(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function ymd(d) { return d.toISOString().slice(0, 10); }
function deltaPct(curr, prev) {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 100);
}

export function createDashboardRouter() {
  const router = Router();

  router.get('/stats', async (req, res, next) => {
    try {
      const periodKey = PERIODS[req.query.period] ? req.query.period : '30d';
      const period = PERIODS[periodKey];
      const now = new Date();
      const today = startOfDay(now);
      const todayStr = ymd(today);

      const periodStart = new Date(today.getTime() - (period.days - 1) * 86400000);
      const prevStart = new Date(periodStart.getTime() - period.days * 86400000);
      const tomorrow = new Date(today.getTime() + 86400000);

      // --- Carga base ---
      const [
        totalUsers,
        activitiesToday,
        activeActivities,
        totalAttendances,
        topActivities,
        allUsers,
        allAttendance,
        allActivitiesInPeriod,
        allActivitiesPrevPeriod,
        upcomingActivities,
      ] = await Promise.all([
        req.repos.users.count(),
        req.repos.activities.countByDate(todayStr),
        req.repos.activities.countByStatus('activa'),
        req.repos.attendance.count(),
        req.repos.activities.findTopByEnrolled(5),
        req.repos.users.findAll(),
        req.repos.attendance.findAll(),
        req.repos.activities.findByDateRange(
          periodStart.toISOString(), tomorrow.toISOString(),
        ),
        req.repos.activities.findByDateRange(
          prevStart.toISOString(), periodStart.toISOString(),
        ),
        req.repos.activities.findByDateRange(
          now.toISOString(),
          new Date(now.getTime() + 365 * 86400000).toISOString(),
          { status: 'activa' },
        ),
      ]);

      // --- KPI Hero: asistencias del período ---
      const periodStartMs = periodStart.getTime();
      const prevStartMs = prevStart.getTime();
      const tomorrowMs = tomorrow.getTime();
      const attCurr = allAttendance.filter(a => {
        const t = new Date(a.registeredAt).getTime();
        return t >= periodStartMs && t < tomorrowMs;
      });
      const attPrev = allAttendance.filter(a => {
        const t = new Date(a.registeredAt).getTime();
        return t >= prevStartMs && t < periodStartMs;
      });

      // Sparkline: count por día (todos los días del período, aunque sean 0)
      const sparkline = [];
      for (let i = 0; i < period.days; i++) {
        const d = new Date(periodStart.getTime() + i * 86400000);
        const k = ymd(d);
        const n = attCurr.filter(a => a.registeredAt.slice(0, 10) === k).length;
        sparkline.push({ date: k, value: n });
      }

      // --- Secondary: nuevos usuarios en el período ---
      const newUsersCurr = allUsers.filter(u => {
        const t = new Date(u.createdAt).getTime();
        return t >= periodStartMs && t < tomorrowMs;
      });
      const newUsersPrev = allUsers.filter(u => {
        const t = new Date(u.createdAt).getTime();
        return t >= prevStartMs && t < periodStartMs;
      });

      // --- Secondary: % ocupación promedio ---
      const occActsCurr = allActivitiesInPeriod.filter(a => a.capacity > 0);
      const avgOccupancyCurr = occActsCurr.length
        ? Math.round(occActsCurr.reduce((s, a) => s + (a.enrolledCount / a.capacity) * 100, 0) / occActsCurr.length)
        : 0;
      const occActsPrev = allActivitiesPrevPeriod.filter(a => a.capacity > 0);
      const avgOccupancyPrev = occActsPrev.length
        ? Math.round(occActsPrev.reduce((s, a) => s + (a.enrolledCount / a.capacity) * 100, 0) / occActsPrev.length)
        : 0;

      // --- Secondary: tasa de retorno (asistencias de usuarios con > 1 visita / total asistencias del período) ---
      const visitsPerUser = new Map();
      for (const a of allAttendance) {
        visitsPerUser.set(a.userId, (visitsPerUser.get(a.userId) || 0) + 1);
      }
      const returningCurr = attCurr.filter(a => (visitsPerUser.get(a.userId) || 0) > 1).length;
      const returningCurrPct = attCurr.length ? Math.round((returningCurr / attCurr.length) * 100) : 0;
      const returningPrev = attPrev.filter(a => (visitsPerUser.get(a.userId) || 0) > 1).length;
      const returningPrevPct = attPrev.length ? Math.round((returningPrev / attPrev.length) * 100) : 0;

      // --- Próxima actividad: primera activa con fecha futura ---
      const nextActivity = upcomingActivities
        .filter(a => a.status === 'activa' && new Date(a.date).getTime() > now.getTime())
        .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;

      let nextActivityPayload = null;
      if (nextActivity) {
        nextActivityPayload = {
          id: nextActivity.id,
          name: nextActivity.name,
          type: nextActivity.type,
          location: nextActivity.location,
          date: nextActivity.date,
          capacity: nextActivity.capacity,
          enrolledCount: nextActivity.enrolledCount,
          imageUrl: nextActivity.imageUrl,
          description: nextActivity.description,
          countdownMs: new Date(nextActivity.date).getTime() - now.getTime(),
        };
      }

      // --- Insights contextuales ---
      const insights = [];
      // 1. Próxima actividad con baja inscripción
      if (nextActivity && nextActivity.capacity > 0) {
        const occ = (nextActivity.enrolledCount / nextActivity.capacity) * 100;
        const daysToStart = (new Date(nextActivity.date).getTime() - now.getTime()) / 86400000;
        if (occ < 30 && daysToStart < 14) {
          insights.push({
            type: 'low_enrollment',
            severity: 'warning',
            title: 'Baja inscripción próxima',
            message: `"${nextActivity.name}" tiene ${nextActivity.enrolledCount}/${nextActivity.capacity} inscritos a ${Math.ceil(daysToStart)} días del evento.`,
            action: { label: 'Invitar audiencia', href: `#/activities` },
          });
        }
        if (occ >= 90 && occ < 100) {
          insights.push({
            type: 'near_full',
            severity: 'info',
            title: 'Casi lleno',
            message: `"${nextActivity.name}" está al ${Math.round(occ)}% de capacidad.`,
            action: { label: 'Ver detalle', href: `#/activities` },
          });
        }
      }
      // 2. Actividades sin inscripciones aún
      const emptyActive = upcomingActivities.filter(a => a.status === 'activa' && a.enrolledCount === 0).length;
      if (emptyActive > 0) {
        insights.push({
          type: 'empty_activities',
          severity: 'info',
          title: 'Actividades sin inscritos',
          message: `Tienes ${emptyActive} actividad(es) activa(s) sin inscritos todavía.`,
          action: { label: 'Ver actividades', href: '#/activities' },
        });
      }

      // --- Recent users (lo que ya teníamos) ---
      const recentUsers = allUsers
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);

      res.json({
        period: {
          key: periodKey,
          label: period.label,
          from: periodStart.toISOString(),
          to: tomorrow.toISOString(),
          days: period.days,
        },
        hero: {
          label: 'Asistencias',
          value: attCurr.length,
          deltaPct: deltaPct(attCurr.length, attPrev.length),
          sparkline,
        },
        secondary: [
          {
            key: 'new_users',
            label: 'Visitantes nuevos',
            value: newUsersCurr.length,
            deltaPct: deltaPct(newUsersCurr.length, newUsersPrev.length),
            tooltip: 'Usuarios registrados por primera vez en el período seleccionado.',
          },
          {
            key: 'avg_occupancy',
            label: 'Ocupación promedio',
            value: avgOccupancyCurr,
            unit: '%',
            deltaPct: deltaPct(avgOccupancyCurr, avgOccupancyPrev),
            tooltip: 'Promedio de % de capacidad llenada en actividades del período.',
          },
          {
            key: 'returning_rate',
            label: 'Tasa de retorno',
            value: returningCurrPct,
            unit: '%',
            deltaPct: deltaPct(returningCurrPct, returningPrevPct),
            tooltip: 'Porcentaje de asistencias del período que son de usuarios con más de una visita.',
          },
        ],
        // Compat con UI vieja
        totalUsers,
        totalActivities: allActivitiesInPeriod.length,
        activitiesToday,
        activeActivities,
        totalAttendances,
        // Premium fields
        nextActivity: nextActivityPayload,
        topActivities,
        recentUsers,
        insights,
      });
    } catch (e) {
      next(e);
    }
  });

  // ==============================================================
  // GET /api/dashboard/checkin-context — datos vivos para la pantalla
  // de Check-in del staff. Stats del día + feed de últimos check-ins.
  // ==============================================================
  router.get('/checkin-context', async (req, res, next) => {
    try {
      const now = new Date();
      const today = startOfDay(now);
      const todayStr = ymd(today);
      const tomorrow = new Date(today.getTime() + 86400000);

      const [allAttendance, allActivities, allUsers] = await Promise.all([
        req.repos.attendance.findAll(),
        req.repos.activities.findAll(),
        req.repos.users.findAll(),
      ]);

      const todayMs = today.getTime();
      const tomorrowMs = tomorrow.getTime();

      // Check-ins de HOY (creados o registrados hoy)
      const todayCheckins = allAttendance
        .filter(a => {
          const t = new Date(a.registeredAt).getTime();
          return t >= todayMs && t < tomorrowMs;
        })
        .sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));

      const activitiesById = new Map(allActivities.map(a => [a.id, a]));
      const usersById = new Map(allUsers.map(u => [u.id, u]));

      // Feed de últimos 12 check-ins: enriquecer con user + activity
      const recentFeed = todayCheckins.slice(0, 12).map(a => {
        const user = usersById.get(a.userId);
        const activity = activitiesById.get(a.activityId);
        return {
          attendanceId: a.id,
          userCode: user?.code || a.userCode,
          userName: user ? `${user.firstName} ${user.lastName}`.trim() : '—',
          userEmail: user?.email || null,
          userVisitCount: user?.visitCount || 1,
          activityId: a.activityId,
          activityName: activity?.name || a.activityName,
          activityType: activity?.type || null,
          registeredAt: a.registeredAt,
        };
      });

      // Actividades activas con datos enriquecidos
      const activeActivities = allActivities
        .filter(a => a.status === 'activa')
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      // Actividad de HOY (la primera activa cuya fecha cae en este día)
      const todayActivity = activeActivities.find(a => {
        const d = new Date(a.date).getTime();
        return d >= todayMs && d < tomorrowMs;
      }) || null;

      // Próxima (después de hoy)
      const nextActivity = activeActivities.find(a => {
        const d = new Date(a.date).getTime();
        return d >= tomorrowMs;
      }) || null;

      // Lista de usuarios "recientes para check-in": últimos 8 que vinieron HOY
      // (única vez por usuario, ordenado por más reciente).
      const seen = new Set();
      const recentUsersToday = [];
      for (const a of todayCheckins) {
        if (seen.has(a.userId)) continue;
        seen.add(a.userId);
        const u = usersById.get(a.userId);
        if (!u) continue;
        recentUsersToday.push({
          code: u.code,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          visitCount: u.visitCount,
          lastActivityName: activitiesById.get(a.activityId)?.name || null,
          lastCheckinAt: a.registeredAt,
        });
        if (recentUsersToday.length >= 8) break;
      }

      res.json({
        stats: {
          checkinsToday: todayCheckins.length,
          activeActivities: activeActivities.length,
          uniqueAttendeesToday: new Set(todayCheckins.map(c => c.userId)).size,
        },
        todayActivity,
        nextActivity,
        activeActivities,
        recentFeed,
        recentUsersToday,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
