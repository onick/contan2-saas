import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';

const DAY_MS = 86_400_000;
const RECENT_WINDOW_MS = 90 * DAY_MS;
const ACTIVE_WINDOW_MS = 30 * DAY_MS;
const DORMANT_THRESHOLD_MS = 90 * DAY_MS;

async function buildAffinityForUser(repos, user) {
  const attendances = await repos.attendance.findByUserId(user.id);
  const activities = await Promise.all(
    attendances.map(a => repos.activities.findById(a.activityId)),
  );

  const byType = {};
  const byLocation = {};
  const byCategory = {};
  let lastAttendanceAt = null;
  let recentCount = 0;
  const now = Date.now();

  for (let i = 0; i < attendances.length; i++) {
    const att = attendances[i];
    const act = activities[i];
    if (!act) continue;
    byType[act.type] = (byType[act.type] || 0) + 1;
    byLocation[act.location] = (byLocation[act.location] || 0) + 1;
    if (act.category) {
      byCategory[act.category] = (byCategory[act.category] || 0) + 1;
    }
    const t = new Date(att.registeredAt).getTime();
    if (!lastAttendanceAt || t > lastAttendanceAt) lastAttendanceAt = t;
    if (now - t < RECENT_WINDOW_MS) recentCount += 1;
  }

  const totalAttendances = attendances.length;
  const daysSinceLastVisit = lastAttendanceAt
    ? Math.floor((now - lastAttendanceAt) / DAY_MS)
    : null;

  let status = 'nuevo';
  if (totalAttendances === 0) status = 'nuevo';
  else if (now - lastAttendanceAt < ACTIVE_WINDOW_MS) status = 'activo';
  else if (now - lastAttendanceAt > DORMANT_THRESHOLD_MS) status = 'dormido';
  else status = 'regular';

  return {
    code: user.code,
    userId: user.id,
    hasEmail: !!user.email,
    name: `${user.firstName} ${user.lastName}`,
    visitCount: user.visitCount,
    totalAttendances,
    byType,
    byLocation,
    byCategory,
    lastAttendanceAt: lastAttendanceAt ? new Date(lastAttendanceAt).toISOString() : null,
    daysSinceLastVisit,
    recentCount,
    status,
  };
}

function computeScore(affinity, { type, location } = {}) {
  let score = 0;
  if (type && affinity.byType[type]) score += affinity.byType[type] * 10;
  if (location && affinity.byLocation[location]) {
    score += affinity.byLocation[location] * 3;
  }
  if (affinity.status === 'activo') score += 5;
  if (affinity.totalAttendances >= 10) score += 3;
  if (affinity.recentCount > 0) score += affinity.recentCount * 2;
  return score;
}

export function createInsightsRouter() {
  const router = Router();

  router.get('/user-affinity/:code', async (req, res, next) => {
    try {
      const user = await req.repos.users.findByCode(req.params.code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const affinity = await buildAffinityForUser(req.repos,user);
      res.json(affinity);
    } catch (e) {
      next(e);
    }
  });

  router.get('/suggestions', async (req, res, next) => {
    try {
      const { type, location, limit, excludeActivityId } = req.query;
      const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
      const users = await req.repos.users.findAll();

      let excludeUserIds = new Set();
      if (excludeActivityId) {
        const attendances = await req.repos.attendance.findByActivityId(excludeActivityId);
        attendances.forEach(a => excludeUserIds.add(a.userId));
      }

      const filtered = users.filter(u => !excludeUserIds.has(u.id));
      const enriched = await Promise.all(
        filtered.map(async u => {
          const aff = await buildAffinityForUser(req.repos,u);
          return {
            user: {
              code: u.code,
              firstName: u.firstName,
              lastName: u.lastName,
              email: u.email,
              phone: u.phone,
              visitCount: u.visitCount,
            },
            affinity: {
              totalAttendances: aff.totalAttendances,
              typeMatches: type ? aff.byType[type] || 0 : 0,
              locationMatches: location ? aff.byLocation[location] || 0 : 0,
              status: aff.status,
              lastAttendanceAt: aff.lastAttendanceAt,
            },
            score: computeScore(aff, { type, location }),
          };
        }),
      );

      enriched.sort((a, b) => b.score - a.score);
      const top = enriched.filter(e => e.score > 0).slice(0, limitNum);

      res.json({
        suggestions: top,
        total: top.length,
        filters: { type: type || null, location: location || null },
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/segments', async (req, res, next) => {
    try {
      const users = await req.repos.users.findAll();
      const affs = await Promise.all(
        users.map(u => buildAffinityForUser(req.repos,u)),
      );
      const categories = await discoverCategories(req.repos);
      const counts = computeSegmentCounts(affs, categories);
      res.json({ segments: counts });
    } catch (e) {
      next(e);
    }
  });

  router.get('/segments/:id', async (req, res, next) => {
    try {
      const users = await req.repos.users.findAll();
      const all = await Promise.all(
        users.map(async u => ({
          user: u,
          affinity: await buildAffinityForUser(req.repos,u),
        })),
      );
      const categories = await discoverCategories(req.repos);
      const matches = filterBySegment(all, req.params.id, categories);
      if (matches === null) throw new HttpError(404, 'Segmento no encontrado');
      matches.sort((a, b) => b.affinity.totalAttendances - a.affinity.totalAttendances);
      res.json({
        segmentId: req.params.id,
        users: matches.map(({ user, affinity }) => ({
          id: user.id,
          code: user.code,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          visitCount: user.visitCount,
          totalAttendances: affinity.totalAttendances,
          lastAttendanceAt: affinity.lastAttendanceAt,
          daysSinceLastVisit: affinity.daysSinceLastVisit,
          status: affinity.status,
          byType: affinity.byType,
        })),
        total: matches.length,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/activity-summary/:id', async (req, res, next) => {
    try {
      const activity = await req.repos.activities.findById(req.params.id);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');

      const attendances = await req.repos.attendance.findByActivityId(req.params.id);
      const userAffs = await Promise.all(
        attendances.map(async a => {
          const user = await req.repos.users.findById(a.userId);
          if (!user) return null;
          const aff = await buildAffinityForUser(req.repos,user);
          return { user, attendance: a, affinity: aff };
        }),
      );
      const valid = userAffs.filter(Boolean);

      const newcomers = valid.filter(v => v.affinity.totalAttendances === 1).length;
      const returning = valid.length - newcomers;
      const vip = valid.filter(v => v.affinity.totalAttendances >= 10).length;
      const occupancyPct = activity.capacity
        ? Math.round((activity.enrolledCount / activity.capacity) * 100)
        : 0;

      const avgPriorAttendances = valid.length
        ? valid.reduce((sum, v) => sum + (v.affinity.totalAttendances - 1), 0) / valid.length
        : 0;

      res.json({
        activity: {
          id: activity.id,
          name: activity.name,
          type: activity.type,
          location: activity.location,
          date: activity.date,
          status: activity.status,
          capacity: activity.capacity,
          enrolledCount: activity.enrolledCount,
        },
        summary: {
          totalAttendances: valid.length,
          occupancyPct,
          newcomers,
          returning,
          vipCount: vip,
          avgPriorAttendances: Math.round(avgPriorAttendances * 10) / 10,
          newcomerRatio: valid.length ? Math.round((newcomers / valid.length) * 100) : 0,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

const ACTIVITY_TYPES = ['concierto', 'cine', 'taller', 'exposicion', 'teatro', 'conferencia', 'otro'];

// Descubre categorías distintas activas en la org. Devuelve array
// de strings (las categorías normalizadas guardadas en DB).
async function discoverCategories(repos) {
  const all = await repos.activities.findAll();
  const set = new Set();
  for (const a of all) {
    if (a.category) set.add(a.category);
  }
  return [...set].sort();
}

// kebab-case slug para usar como id de segmento URL-safe.
function slugifyCategory(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function categorySegmentId(category) {
  return `fans-cat-${slugifyCategory(category)}`;
}

// Capitaliza para el label visible.
function prettyCategory(category) {
  return String(category)
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function computeSegmentCounts(affs, categories = []) {
  const segments = [
    {
      id: 'vip',
      label: 'Visitantes VIP',
      description: '10 o más visitas totales',
      icon: 'fa-crown',
      color: 'orange',
      match: a => a.totalAttendances >= 10,
    },
    {
      id: 'active',
      label: 'Activos recientes',
      description: 'Asistieron en los últimos 30 días',
      icon: 'fa-bolt',
      color: 'green',
      match: a => a.status === 'activo',
    },
    {
      id: 'newcomers',
      label: 'Nuevos visitantes',
      description: 'Una sola visita registrada',
      icon: 'fa-seedling',
      color: 'blue',
      match: a => a.totalAttendances === 1,
    },
    {
      id: 'dormant',
      label: 'Dormidos',
      description: 'Sin visitar hace 90 días o más',
      icon: 'fa-moon',
      color: 'purple',
      match: a => a.status === 'dormido',
    },
    {
      id: 'with-email',
      label: 'Con correo',
      description: 'Usuarios contactables por email',
      icon: 'fa-envelope',
      color: 'green',
      match: a => a.hasEmail,
    },
    {
      id: 'without-email',
      label: 'Sin correo',
      description: 'Falta capturar correo electrónico',
      icon: 'fa-envelope-open',
      color: 'orange',
      match: a => !a.hasEmail,
    },
  ];

  ACTIVITY_TYPES.forEach(t => {
    if (t === 'otro') return;
    const minVisits = t === 'taller' || t === 'cine' ? 2 : 3;
    segments.push({
      id: `fans-${t}`,
      label: `Fans de ${capitalize(typeLabel(t))}`,
      description: `${minVisits} o más asistencias de ${typeLabel(t).toLowerCase()}`,
      icon: typeIcon(t),
      color: 'blue',
      match: a => (a.byType[t] || 0) >= minVisits,
    });
  });

  // Segmentos dinámicos por categoría/ciclo. Umbral más bajo (>=1)
  // porque las categorías suelen ser temáticas más específicas
  // (ej: "5to ciclo cine dominicano") y queremos detectar interés
  // desde la primera visita al ciclo.
  for (const cat of categories) {
    segments.push({
      id: categorySegmentId(cat),
      label: `Audiencia · ${prettyCategory(cat)}`,
      description: `Han asistido al menos una vez a ${prettyCategory(cat)}`,
      icon: 'fa-bookmark',
      color: 'purple',
      match: a => (a.byCategory && a.byCategory[cat]) >= 1,
    });
  }

  return segments.map(s => ({
    id: s.id,
    label: s.label,
    description: s.description,
    icon: s.icon,
    color: s.color,
    count: affs.filter(s.match).length,
  }));
}

function filterBySegment(all, id, categories = []) {
  if (id === 'vip') return all.filter(x => x.affinity.totalAttendances >= 10);
  if (id === 'active') return all.filter(x => x.affinity.status === 'activo');
  if (id === 'newcomers') return all.filter(x => x.affinity.totalAttendances === 1);
  if (id === 'dormant') return all.filter(x => x.affinity.status === 'dormido');
  if (id === 'with-email') return all.filter(x => x.affinity.hasEmail);
  if (id === 'without-email') return all.filter(x => !x.affinity.hasEmail);
  for (const t of ACTIVITY_TYPES) {
    if (t === 'otro') continue;
    if (id === `fans-${t}`) {
      const min = t === 'taller' || t === 'cine' ? 2 : 3;
      return all.filter(x => (x.affinity.byType[t] || 0) >= min);
    }
  }
  // Segmentos dinámicos por categoría.
  for (const cat of categories) {
    if (id === categorySegmentId(cat)) {
      return all.filter(x => (x.affinity.byCategory && x.affinity.byCategory[cat]) >= 1);
    }
  }
  return null;
}

function typeLabel(t) {
  return ({
    concierto: 'Concierto',
    cine: 'Cine',
    taller: 'Taller',
    exposicion: 'Exposición',
    teatro: 'Teatro',
    conferencia: 'Conferencia',
  })[t] || t;
}

function typeIcon(t) {
  return ({
    concierto: 'fa-music',
    cine: 'fa-film',
    taller: 'fa-screwdriver-wrench',
    exposicion: 'fa-image',
    teatro: 'fa-masks-theater',
    conferencia: 'fa-microphone',
  })[t] || 'fa-calendar';
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
