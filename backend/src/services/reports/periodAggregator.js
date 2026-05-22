// =============================================================================
// periodAggregator.js · agrega datos para un reporte de período.
// Carga actividades + asistencias en el rango y produce un summary listo
// para que las plantillas (Excel/PDF) lo rendericen sin recomputar nada.
// =============================================================================

const TYPE_LABELS = {
  exposicion: 'Exposición',
  concierto: 'Concierto',
  cine: 'Cine',
  taller: 'Taller',
  teatro: 'Teatro',
  conferencia: 'Conferencia',
  otro: 'Otro',
};

function monthKey(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Genera array continuo de fechas YYYY-MM-DD desde `from` hasta `to` (inclusive).
// Para que el sparkline tenga 0 en días sin actividad y se vea continuo.
function daysBetween(fromIso, toIso) {
  const out = [];
  const start = new Date(fromIso); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(toIso); end.setUTCHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(dayKey(new Date(t).toISOString()));
  }
  return out;
}

function monthLabel(key) {
  if (!key) return '—';
  const [y, m] = key.split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
}

/**
 * Carga todas las actividades en el rango, sus asistencias, los usuarios
 * únicos asistentes y devuelve el summary necesario para renderizar el
 * reporte.
 */
export async function buildPeriodSummary({ repos, from, to, types, categories }) {
  const activities = await repos.activities.findByDateRange(from, to, { types, categories });

  // Asistencias por actividad. Cargamos en paralelo.
  const attendancesByActivity = await Promise.all(
    activities.map(a => repos.attendance.findByActivityId(a.id)),
  );

  // Set global de usuarios únicos en el período + total asistencias.
  const uniqueUserIds = new Set();
  let totalAttendances = 0;
  for (const list of attendancesByActivity) {
    for (const att of list) {
      uniqueUserIds.add(att.userId);
      totalAttendances += 1;
    }
  }

  // Por actividad: enriched row
  const activityRows = activities.map((a, i) => {
    const atts = attendancesByActivity[i];
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      typeLabel: TYPE_LABELS[a.type] || a.type,
      date: a.date,
      location: a.location,
      capacity: a.capacity,
      status: a.status,
      attendances: atts.length,
      occupancyPct: a.capacity ? Math.round((atts.length / a.capacity) * 100) : 0,
      enrolledCount: a.enrolledCount,
    };
  });

  // Top 5 actividades por asistencia
  const topActivities = [...activityRows]
    .sort((x, y) => y.attendances - x.attendances)
    .slice(0, 5);

  // Por tipo
  const byTypeMap = new Map();
  for (const row of activityRows) {
    const cur = byTypeMap.get(row.type) || { type: row.type, label: row.typeLabel, activities: 0, attendances: 0 };
    cur.activities += 1;
    cur.attendances += row.attendances;
    byTypeMap.set(row.type, cur);
  }
  const byType = [...byTypeMap.values()].sort((a, b) => b.attendances - a.attendances);

  // Evolución por mes
  const byMonthMap = new Map();
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    const key = monthKey(a.date);
    if (!key) continue;
    const cur = byMonthMap.get(key) || { key, label: monthLabel(key), activities: 0, attendances: 0 };
    cur.activities += 1;
    cur.attendances += attendancesByActivity[i].length;
    byMonthMap.set(key, cur);
  }
  const byMonth = [...byMonthMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  // Serie diaria: para cada día del rango cuántas asistencias ocurrieron.
  // Útil para sparkline en la vista previa. Agrupa por la fecha del registro
  // de asistencia (registeredAt), no por la fecha de la actividad — refleja
  // el flujo real día a día.
  const byDayMap = new Map();
  for (const list of attendancesByActivity) {
    for (const att of list) {
      const k = dayKey(att.registeredAt);
      if (!k) continue;
      byDayMap.set(k, (byDayMap.get(k) || 0) + 1);
    }
  }
  const allDays = daysBetween(from, to);
  const byDay = allDays.map(d => ({ date: d, attendances: byDayMap.get(d) || 0 }));

  // Top visitantes (asistencias dentro del período)
  const visitsPerUser = new Map();
  for (const list of attendancesByActivity) {
    for (const att of list) {
      visitsPerUser.set(att.userId, (visitsPerUser.get(att.userId) || 0) + 1);
    }
  }
  const topUserIds = [...visitsPerUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const topUsers = await Promise.all(topUserIds.map(async ([uid, n]) => {
    const u = await repos.users.findById(uid);
    if (!u) return null;
    return {
      code: u.code,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      visitsInPeriod: n,
      totalVisits: u.visitCount,
    };
  }));

  const avgOccupancy = activityRows.length
    ? Math.round(activityRows.reduce((s, r) => s + r.occupancyPct, 0) / activityRows.length)
    : 0;

  return {
    range: { from, to },
    summary: {
      activitiesCount: activities.length,
      attendancesCount: totalAttendances,
      uniqueAttendees: uniqueUserIds.size,
      avgOccupancy,
      typesCount: byType.length,
      monthsSpan: byMonth.length,
    },
    activities: activityRows,
    topActivities,
    byType,
    byMonth,
    byDay,
    topUsers: topUsers.filter(Boolean),
  };
}

/**
 * Calcula el rango "anterior" del mismo span. Si el rango actual es
 * 2026-05-01 → 2026-05-21 (21 días), el rango anterior es 2026-04-10 →
 * 2026-04-30 (mismos 21 días, terminando el día antes de `from`).
 */
export function previousRange(from, to) {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (isNaN(fromMs) || isNaN(toMs)) return null;
  const span = toMs - fromMs;
  const prevTo = new Date(fromMs - 86400000);
  const prevFrom = new Date(prevTo.getTime() - span);
  const fmt = d => d.toISOString().slice(0, 10);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}
