// apps/api-v2/src/services/reports/report-data.ts · capa de DATOS de la
// reportería (S2). Reescritura SET-BASED del periodAggregator.js y del loader
// de actividad de v1 (que hacían N+1 por asistente/actividad), conservando el
// CONTRATO DE SALIDA EXACTO que consumen las plantillas portadas (Excel/PDF).
// Fechas en UTC (paridad v1: month/day keys con getUTC*).

import { sql, type DbClient } from '@contan2/db';

const TYPE_LABELS: Record<string, string> = {
  exposicion: 'Exposición', concierto: 'Concierto', cine: 'Cine', taller: 'Taller',
  teatro: 'Teatro', conferencia: 'Conferencia', otro: 'Otro',
};

const dayKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const monthKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
}
function daysBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const start = new Date(fromIso); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(toIso); end.setUTCHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) out.push(dayKey(new Date(t)));
  return out;
}

export interface PeriodActivityRow {
  id: string; name: string; type: string; typeLabel: string; date: string;
  location: string; capacity: number; status: string; attendances: number;
  occupancyPct: number; enrolledCount: number;
}
export interface PeriodSummary {
  range: { from: string; to: string };
  summary: {
    activitiesCount: number; attendancesCount: number; uniqueAttendees: number;
    avgOccupancy: number; typesCount: number; monthsSpan: number;
  };
  activities: PeriodActivityRow[];
  topActivities: PeriodActivityRow[];
  byType: Array<{ type: string; label: string; activities: number; attendances: number }>;
  byMonth: Array<{ key: string; label: string; activities: number; attendances: number }>;
  byDay: Array<{ date: string; attendances: number }>;
  topUsers: Array<{
    code: string; firstName: string; lastName: string; email: string | null;
    phone: string | null; visitsInPeriod: number; totalVisits: number;
  }>;
}

export interface PeriodQuery {
  from: string; // ISO inclusive
  to: string; // ISO exclusivo (el route ya sumó 1 día)
  types: string[] | null;
  categories: string[] | null;
}

export async function buildPeriodSummary(db: DbClient, orgId: string, q: PeriodQuery): Promise<PeriodSummary> {
  // 1) Actividades del rango (por fecha de la actividad), con filtros.
  let actsQ = db.selectFrom('activities')
    .select(['id', 'name', 'type', 'date', 'location', 'capacity', 'status', 'enrolled_count', 'category'])
    .where('organization_id', '=', orgId)
    .where('date', '>=', sql<Date>`${q.from}::timestamptz`)
    .where('date', '<', sql<Date>`${q.to}::timestamptz`)
    .orderBy('date', 'asc');
  if (q.types && q.types.length > 0) actsQ = actsQ.where('type', 'in', q.types);
  if (q.categories && q.categories.length > 0) {
    const lowered = q.categories.map((c) => c.toLowerCase());
    actsQ = actsQ.where(sql<boolean>`lower(coalesce(category, '')) in (${sql.join(lowered)})`);
  }
  const acts = await actsQ.execute();
  const actIds = acts.map((a) => a.id);

  // 2) Asistencias de esas actividades, en UN query (vs N+1 de v1).
  const atts = actIds.length === 0 ? [] : await db.selectFrom('attendance')
    .select(['activity_id', 'user_id', 'registered_at'])
    .where('organization_id', '=', orgId)
    .where('activity_id', 'in', actIds)
    .execute();

  const attsByActivity = new Map<string, number>();
  const byDayMap = new Map<string, number>();
  const visitsPerUser = new Map<string, number>();
  const uniqueUserIds = new Set<string>();
  for (const att of atts) {
    attsByActivity.set(att.activity_id, (attsByActivity.get(att.activity_id) ?? 0) + 1);
    const reg = new Date(att.registered_at as unknown as string);
    if (!Number.isNaN(reg.getTime())) byDayMap.set(dayKey(reg), (byDayMap.get(dayKey(reg)) ?? 0) + 1);
    if (att.user_id) {
      uniqueUserIds.add(att.user_id);
      visitsPerUser.set(att.user_id, (visitsPerUser.get(att.user_id) ?? 0) + 1);
    }
  }

  const activityRows: PeriodActivityRow[] = acts.map((a) => {
    const n = attsByActivity.get(a.id) ?? 0;
    return {
      id: a.id, name: a.name, type: a.type, typeLabel: TYPE_LABELS[a.type] ?? a.type,
      date: new Date(a.date).toISOString(), location: a.location, capacity: a.capacity,
      status: a.status, attendances: n,
      occupancyPct: a.capacity ? Math.round((n / a.capacity) * 100) : 0,
      enrolledCount: a.enrolled_count,
    };
  });

  const topActivities = [...activityRows].sort((x, y) => y.attendances - x.attendances).slice(0, 5);

  const byTypeMap = new Map<string, { type: string; label: string; activities: number; attendances: number }>();
  const byMonthMap = new Map<string, { key: string; label: string; activities: number; attendances: number }>();
  for (const row of activityRows) {
    const t = byTypeMap.get(row.type) ?? { type: row.type, label: row.typeLabel, activities: 0, attendances: 0 };
    t.activities += 1; t.attendances += row.attendances;
    byTypeMap.set(row.type, t);
    const mk = monthKey(new Date(row.date));
    const m = byMonthMap.get(mk) ?? { key: mk, label: monthLabel(mk), activities: 0, attendances: 0 };
    m.activities += 1; m.attendances += row.attendances;
    byMonthMap.set(mk, m);
  }
  const byType = [...byTypeMap.values()].sort((a, b) => b.attendances - a.attendances);
  const byMonth = [...byMonthMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  // byDay sobre el rango VISIBLE (to es exclusivo → restamos 1 día para el eje).
  const lastDay = new Date(new Date(q.to).getTime() - 86_400_000).toISOString();
  const byDay = daysBetween(q.from, lastDay).map((d) => ({ date: d, attendances: byDayMap.get(d) ?? 0 }));

  // Top 20 visitantes del período, hidratados en UN query.
  const topPairs = [...visitsPerUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const topUsers: PeriodSummary['topUsers'] = [];
  if (topPairs.length > 0) {
    const users = await db.selectFrom('users')
      .select(['id', 'code', 'first_name', 'last_name', 'email', 'phone', 'visit_count'])
      .where('organization_id', '=', orgId)
      .where('id', 'in', topPairs.map(([uid]) => uid))
      .execute();
    const byId = new Map(users.map((u) => [u.id, u]));
    for (const [uid, n] of topPairs) {
      const u = byId.get(uid);
      if (!u) continue;
      topUsers.push({
        code: u.code, firstName: u.first_name, lastName: u.last_name,
        email: u.email, phone: u.phone, visitsInPeriod: n, totalVisits: u.visit_count,
      });
    }
  }

  const avgOccupancy = activityRows.length
    ? Math.round(activityRows.reduce((s, r) => s + r.occupancyPct, 0) / activityRows.length)
    : 0;

  return {
    range: { from: q.from, to: q.to },
    summary: {
      activitiesCount: acts.length,
      attendancesCount: atts.length,
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
    topUsers,
  };
}

// Rango "anterior" del mismo span (paridad v1 previousRange).
export function previousRange(from: string, to: string): { from: string; to: string } | null {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
  const span = toMs - fromMs;
  const prevTo = new Date(fromMs - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - span);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}

// ── Datos del reporte por ACTIVIDAD (asistentes + afinidad) ──────────────────
// Contrato que esperan activity-excel-report / activity-pdf-template (port v1):
// activity (camelCase); attendances (userId/userCode/registeredAt/anonymous/
// companionsChildren); AFFINITIES ALINEADAS POR ÍNDICE con attendances (los
// anónimos llevan {totalAttendances:0}); users es un POOL de lookup por id.

export interface ActivityReportData {
  activity: {
    id: string; name: string; type: string; location: string; date: string;
    endDate: string | null; capacity: number; enrolledCount: number;
    status: string; description: string; category: string | null;
  };
  attendances: Array<{ userId: string | null; userCode: string | null; registeredAt: string; anonymous: boolean; companionsChildren: number; companionsAdults: number }>;
  users: Array<{ id: string; code: string; firstName: string; lastName: string; email: string | null; phone: string | null; visitCount: number; createdAt: string }>;
  affinities: Array<{ totalAttendances: number }>;
  // Protocolo (PR-6): invitados especiales de la actividad (invitación kind
  // 'protocol'); attended = su asistencia tiene checked_in_at (vino).
  protocol: {
    rows: Array<{ name: string; category: string; status: string; plusOnes: number; attended: boolean }>;
    summary: { invited: number; confirmed: number; attended: number; totalParty: number };
  };
}

async function loadActivityProtocol(db: DbClient, orgId: string, activityId: string): Promise<ActivityReportData['protocol']> {
  const rows = await db.selectFrom('invitations as i')
    .innerJoin('users as u', 'u.id', 'i.user_id')
    .leftJoin('protocol_profiles as p', 'p.user_id', 'i.user_id')
    .leftJoin('attendance as att', (join) => join
      .onRef('att.user_id', '=', 'i.user_id')
      .onRef('att.activity_id', '=', 'i.activity_id'))
    .select(['i.status', 'i.plus_ones', 'i.expires_at', 'u.first_name', 'u.last_name',
      'p.honorific', 'p.category', 'att.checked_in_at'])
    .where('i.organization_id', '=', orgId)
    .where('i.activity_id', '=', activityId)
    .where('i.kind', '=', 'protocol')
    .orderBy('u.last_name')
    .execute();

  const now = Date.now();
  const out: ActivityReportData['protocol'] = {
    rows: [], summary: { invited: 0, confirmed: 0, attended: 0, totalParty: 0 },
  };
  for (const r of rows) {
    const status = r.status === 'pending' && new Date(r.expires_at).getTime() < now ? 'expired' : r.status;
    const attended = !!r.checked_in_at;
    out.rows.push({
      name: `${r.honorific ? `${r.honorific} ` : ''}${r.first_name} ${r.last_name}`.trim(),
      category: r.category ?? 'otro',
      status,
      plusOnes: r.plus_ones,
      attended,
    });
    out.summary.invited += 1;
    if (status === 'confirmed') {
      out.summary.confirmed += 1;
      out.summary.totalParty += 1 + r.plus_ones;
    }
    if (attended) out.summary.attended += 1;
  }
  return out;
}

export async function loadActivityReportData(db: DbClient, orgId: string, activityId: string): Promise<ActivityReportData | null> {
  const a = await db.selectFrom('activities')
    .select(['id', 'name', 'type', 'location', 'date', 'end_date', 'capacity', 'enrolled_count', 'status', 'description', 'category'])
    .where('organization_id', '=', orgId).where('id', '=', activityId)
    .executeTakeFirst();
  if (!a) return null;

  const atts = await db.selectFrom('attendance')
    .select(['user_id', 'user_code', 'registered_at', 'anonymous', 'companions_children', 'companions_adults'])
    .where('organization_id', '=', orgId).where('activity_id', '=', activityId)
    .orderBy('registered_at', 'desc')
    .execute();

  const userIds = [...new Set(atts.flatMap((x) => (x.user_id ? [x.user_id] : [])))];
  const userRows = userIds.length === 0 ? [] : await db.selectFrom('users')
    .select(['id', 'code', 'first_name', 'last_name', 'email', 'phone', 'visit_count', 'created_at'])
    .where('organization_id', '=', orgId).where('id', 'in', userIds)
    .execute();
  const byId = new Map(userRows.map((u) => [u.id, u]));

  // Afinidad (asistencias totales en la org) en UN GROUP BY (v1: N+1).
  const counts = userIds.length === 0 ? [] : await db.selectFrom('attendance')
    .select(['user_id', db.fn.countAll<number>().as('n')])
    .where('organization_id', '=', orgId).where('user_id', 'in', userIds)
    .groupBy('user_id')
    .execute();
  const countById = new Map(counts.map((c) => [c.user_id, Number(c.n)]));

  // POOL de usuarios (lookup por id en las plantillas) + AFFINITIES alineadas
  // por índice con attendances (anónimos → 0; contrato v1).
  const users: ActivityReportData['users'] = userRows.map((u) => ({
    id: u.id, code: u.code, firstName: u.first_name, lastName: u.last_name,
    email: u.email, phone: u.phone, visitCount: u.visit_count,
    createdAt: new Date(u.created_at).toISOString(),
  }));
  const affinities: ActivityReportData['affinities'] = atts.map((att) => ({
    totalAttendances: att.user_id ? (countById.get(att.user_id) ?? 0) : 0,
  }));

  return {
    activity: {
      id: a.id, name: a.name, type: a.type, location: a.location,
      date: new Date(a.date).toISOString(),
      endDate: a.end_date ? new Date(a.end_date).toISOString() : null,
      capacity: a.capacity, enrolledCount: a.enrolled_count, status: a.status,
      description: a.description, category: a.category,
    },
    attendances: atts.map((x) => ({
      userId: x.user_id,
      userCode: x.user_code,
      registeredAt: new Date(x.registered_at as unknown as string).toISOString(),
      anonymous: x.anonymous,
      companionsChildren: x.companions_children ?? 0,
      companionsAdults: x.companions_adults ?? 0,
    })),
    users,
    affinities,
    protocol: await loadActivityProtocol(db, orgId, activityId),
  };
}
