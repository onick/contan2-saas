import { Router } from 'express';

const PERIODS = {
  today: { days: 1, label: 'Hoy' },
  '7d': { days: 7, label: 'Últimos 7 días' },
  '30d': { days: 30, label: 'Últimos 30 días' },
  '90d': { days: 90, label: 'Últimos 90 días' },
};

// IMPORTANTE: las metricas de "hoy" se calculan SIEMPRE en la zona
// horaria del tenant. Usar UTC produce off-by-one cuando la consulta
// se hace cerca de medianoche local (ej: Santo Domingo, UTC-4 ->
// despues de las 20:00 local ya estamos en el "manana" UTC y se
// pierden los check-ins del dia).
function startOfLocalDay(now, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const h = parseInt(parts.hour, 10) % 24;
  const m = parseInt(parts.minute, 10);
  const s = parseInt(parts.second, 10);
  const ms = now.getUTCMilliseconds();
  return new Date(now.getTime() - ((h * 3600 + m * 60 + s) * 1000 + ms));
}
function localYmd(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function tenantTz(req) {
  return req.organization?.timezone || 'America/Santo_Domingo';
}
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
      const tz = tenantTz(req);
      const today = startOfLocalDay(now, tz);
      const todayStr = localYmd(today, tz);

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
        req.repos.activities.countByDate(todayStr, tz),
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
      // Importante: agrupar por día LOCAL del tenant (no por slice del ISO
      // UTC), para que cada barra del spark cubra exactamente un día local.
      const sparkline = [];
      for (let i = 0; i < period.days; i++) {
        const d = new Date(periodStart.getTime() + i * 86400000);
        const k = localYmd(d, tz);
        const n = attCurr.filter(a => localYmd(new Date(a.registeredAt), tz) === k).length;
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
      const tz = tenantTz(req);
      const today = startOfLocalDay(now, tz);
      const todayStr = localYmd(today, tz);
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

      // Feed de últimos 12 check-ins: enriquecer con user + activity.
      // Para anónimos (sin user_id), mostrar etiqueta clara y sin código.
      const recentFeed = todayCheckins.slice(0, 12).map(a => {
        const user = a.userId ? usersById.get(a.userId) : null;
        const activity = activitiesById.get(a.activityId);
        return {
          attendanceId: a.id,
          userCode: user?.code || a.userCode || null,
          userName: a.anonymous
            ? 'Visitante sin credencial'
            : (user ? `${user.firstName} ${user.lastName}`.trim() : '—'),
          userEmail: user?.email || null,
          userVisitCount: user?.visitCount || 1,
          anonymous: a.anonymous === true,
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

      // Enriquecer cada activa con: checkedIn / rsvpPending / anonymous counts
      // para que el panel muestre "47 check-in · 8 RSVP" en vez de solo el
      // enrolled total. Esto da visibilidad de la gap (gente reservó pero
      // aun no llegó) y de los walk-ins sin credencial.
      if (activeActivities.length > 0 && req.repos.attendance.countsByActivities) {
        const counts = await req.repos.attendance.countsByActivities(
          activeActivities.map(a => a.id),
        );
        for (const a of activeActivities) {
          const c = counts.get(a.id) || { checkedIn: 0, rsvpPending: 0, anonymous: 0 };
          a.checkedInCount = c.checkedIn;
          a.rsvpPendingCount = c.rsvpPending;
          a.anonymousCount = c.anonymous;
        }
      }

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

      // uniqueAttendeesToday: cada usuario con credencial cuenta una vez,
      // cada anónimo cuenta como individuo separado (no podemos saber si
      // son la misma persona).
      const uniqueWithUser = new Set(
        todayCheckins.filter(c => c.userId).map(c => c.userId),
      ).size;
      const anonymousToday = todayCheckins.filter(c => c.anonymous).length;
      res.json({
        stats: {
          checkinsToday: todayCheckins.length,
          activeActivities: activeActivities.length,
          uniqueAttendeesToday: uniqueWithUser + anonymousToday,
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
