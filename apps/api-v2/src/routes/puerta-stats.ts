// apps/api-v2/src/routes/puerta-stats.ts · GET /puerta/stats — reportes y
// estadísticas PROPIAS del módulo Puerta (salas permanentes). Todo en PERSONAS
// (1 + acompañantes/alumnos) además de registros: KPIs con delta vs el período
// inmediatamente anterior de igual duración, serie diaria (actual vs anterior),
// distribución por sala / hora / día de la semana, composición del público,
// grupos que nos visitaron y resultado de la agenda de reservas (VR).
// Scoped a las salas permanentes del tenant → nunca expone el padrón general.
// `?sala=` acota todo menos `bySala` (la vista comparativa entre salas).

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, withTenant } from '@contan2/db';
import { type PuertaStatsResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';

const TZ = process.env.CHECKIN_TZ ?? 'America/Santo_Domingo';
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const AFORO_MAX = 200; // mismo criterio que /puerta/salas: > esto ⇒ ilimitada
const MAX_RANGE_DAYS = 400;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const deltaPct = (cur: number, prev: number): number | null =>
  prev <= 0 ? null : Math.round(((cur - prev) / prev) * 100);

function shiftYmd(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
function dayLabel(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;
}

// Personas de una fila de asistencia (el registrado + su grupo/acompañantes).
const PEOPLE = sql<string>`coalesce(sum(1 + a.companions_children + a.companions_adults), 0)`;

export const puertaStatsRoute: FastifyPluginAsync = async (app) => {
  app.get('/puerta/stats', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {

    const q = req.query as Record<string, unknown>;
    const from = typeof q.from === 'string' && YMD_RE.test(q.from) ? q.from : null;
    const to = typeof q.to === 'string' && YMD_RE.test(q.to) ? q.to : null;
    if (!from || !to || from > to) { reply.code(400); return { error: 'Rango inválido (from/to en YYYY-MM-DD).' }; }
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
    if (days > MAX_RANGE_DAYS) { reply.code(400); return { error: `Rango demasiado largo (máx. ${MAX_RANGE_DAYS} días).` }; }
    const prevFrom = shiftYmd(from, -days);
    const prevTo = shiftYmd(from, -1);

    // Salas permanentes del tenant — sin filtrar status: el histórico de una
    // sala desactivada sigue contando en sus reportes.
    const salasRows = await db.selectFrom('activities')
      .select(['id', 'name', 'capacity'])
      .where('organization_id', '=', orgId).where('is_permanent', '=', true)
      .orderBy('name', 'asc').execute();
    if (salasRows.length === 0) { reply.code(404); return { error: 'No hay salas permanentes configuradas.' }; }
    const salas = salasRows.map((s) => ({ id: s.id, name: s.name, aforo: s.capacity <= AFORO_MAX ? s.capacity : null }));
    const allIds = salas.map((s) => s.id);
    const salaId = typeof q.sala === 'string' && q.sala.trim() ? q.sala.trim() : null;
    if (salaId && !allIds.includes(salaId)) { reply.code(404); return { error: 'Sala no encontrada.' }; }
    const scopeIds = salaId ? [salaId] : allIds;

    // Ventana [f, t] inclusiva en la TZ de la puerta (mismo criterio del export).
    const winGe = (f: string) => sql<boolean>`a.registered_at >= (${f}::date AT TIME ZONE ${sql.lit(TZ)})`;
    const winLt = (t: string) => sql<boolean>`a.registered_at < ((${t}::date + 1) AT TIME ZONE ${sql.lit(TZ)})`;
    const base = (ids: string[], f: string, t: string) =>
      db.selectFrom('attendance as a')
        .where('a.organization_id', '=', orgId)
        .where('a.is_permanent', '=', true)
        .where('a.activity_id', 'in', ids)
        .where(winGe(f)).where(winLt(t));

    // KPIs de una ventana (secuencial: withTenant trabaja sobre una conexión).
    async function kpisOf(f: string, t: string) {
      const r = await base(scopeIds, f, t)
        .select([
          sql<string>`count(*)`.as('entries'),
          PEOPLE.as('people'),
          sql<string>`count(distinct a.user_id)`.as('identified'),
          sql<string>`coalesce(sum(case when a.group_label is not null then 1 + a.companions_children + a.companions_adults end), 0)`.as('groupPeople'),
        ])
        .executeTakeFirst();
      return {
        people: Number(r?.people ?? 0), entries: Number(r?.entries ?? 0),
        identified: Number(r?.identified ?? 0), groupPeople: Number(r?.groupPeople ?? 0),
      };
    }
    const kpis = await kpisOf(from, to);
    const prev = await kpisOf(prevFrom, prevTo);

    // Serie diaria de personas (día en la TZ de la puerta).
    const dayExpr = sql<string>`to_char(a.registered_at AT TIME ZONE ${sql.lit(TZ)}, 'YYYY-MM-DD')`;
    async function dailyOf(f: string, t: string): Promise<Map<string, number>> {
      const rows = await base(scopeIds, f, t)
        .select([dayExpr.as('d'), PEOPLE.as('people')])
        .groupBy(dayExpr).execute();
      return new Map(rows.map((r) => [r.d, Number(r.people)]));
    }
    const curDaily = await dailyOf(from, to);
    const prevDaily = await dailyOf(prevFrom, prevTo);
    const daily = Array.from({ length: days }, (_, i) => {
      const d = shiftYmd(from, i);
      return { label: dayLabel(d), current: curDaily.get(d) ?? 0, previous: prevDaily.get(shiftYmd(prevFrom, i)) ?? 0 };
    });

    // Por sala — SIEMPRE todas las salas (vista comparativa, ignora ?sala=).
    const bySalaRows = await base(allIds, from, to)
      .select(['a.activity_id', sql<string>`count(*)`.as('entries'), PEOPLE.as('people')])
      .groupBy('a.activity_id').execute();
    const bySalaMap = new Map(bySalaRows.map((r) => [r.activity_id, r]));
    const bySala = salas.map((s) => ({
      ...s,
      entries: Number(bySalaMap.get(s.id)?.entries ?? 0),
      people: Number(bySalaMap.get(s.id)?.people ?? 0),
    }));

    // Composición del público: partición de los registros del período.
    // grupos (group_label) · identificados (user_id) · anónimos (el resto).
    const comp = await base(scopeIds, from, to)
      .select([
        sql<string>`coalesce(sum(case when a.group_label is not null then 1 end), 0)`.as('gE'),
        sql<string>`coalesce(sum(case when a.group_label is not null then 1 + a.companions_children + a.companions_adults end), 0)`.as('gP'),
        sql<string>`coalesce(sum(case when a.group_label is null and a.user_id is not null then 1 end), 0)`.as('iE'),
        sql<string>`coalesce(sum(case when a.group_label is null and a.user_id is not null then 1 + a.companions_children + a.companions_adults end), 0)`.as('iP'),
        sql<string>`coalesce(sum(case when a.group_label is null and a.user_id is null then 1 end), 0)`.as('aE'),
        sql<string>`coalesce(sum(case when a.group_label is null and a.user_id is null then 1 + a.companions_children + a.companions_adults end), 0)`.as('aP'),
      ])
      .executeTakeFirst();
    const composition: PuertaStatsResponse['composition'] = [
      { key: 'identificados', entries: Number(comp?.iE ?? 0), people: Number(comp?.iP ?? 0) },
      { key: 'grupos', entries: Number(comp?.gE ?? 0), people: Number(comp?.gP ?? 0) },
      { key: 'anonimos', entries: Number(comp?.aE ?? 0), people: Number(comp?.aP ?? 0) },
    ];

    // Personas por hora y por día de la semana (TZ de la puerta).
    const hourExpr = sql<number>`extract(hour from a.registered_at AT TIME ZONE ${sql.lit(TZ)})::int`;
    const hourRows = await base(scopeIds, from, to)
      .select([hourExpr.as('hour'), PEOPLE.as('count')])
      .groupBy(hourExpr).orderBy(hourExpr, 'asc').execute();
    const dowExpr = sql<number>`extract(dow from a.registered_at AT TIME ZONE ${sql.lit(TZ)})::int`;
    const dowRows = await base(scopeIds, from, to)
      .select([dowExpr.as('weekday'), PEOPLE.as('count')])
      .groupBy(dowExpr).orderBy(dowExpr, 'asc').execute();

    // Grupos que nos visitaron (top por personas). max(group_kind) resuelve el
    // tipo cuando la misma etiqueta entró con y sin kind (null = colegio).
    const peopleSum = sql<string>`sum(1 + a.companions_children + a.companions_adults)`;
    const groupRows = await base(scopeIds, from, to)
      .where('a.group_label', 'is not', null)
      .select([
        'a.group_label',
        sql<string | null>`max(a.group_kind)`.as('kind'),
        sql<string>`count(*)`.as('visits'),
        peopleSum.as('people'),
      ])
      .groupBy('a.group_label')
      .orderBy(peopleSum, 'desc')
      .limit(8).execute();

    // Reservas de la agenda (VR) del período, por fecha agendada.
    const bookRows = await db.selectFrom('space_bookings as b')
      .select(['b.status', sql<string>`count(*)`.as('n'), sql<string>`coalesce(sum(b.student_count + 1), 0)`.as('people')])
      .where('b.organization_id', '=', orgId)
      .where('b.activity_id', 'in', scopeIds)
      .where(sql<boolean>`b.scheduled_at >= (${from}::date AT TIME ZONE ${sql.lit(TZ)})`)
      .where(sql<boolean>`b.scheduled_at < ((${to}::date + 1) AT TIME ZONE ${sql.lit(TZ)})`)
      .groupBy('b.status').execute();
    const bk = { scheduled: 0, confirmed: 0, attended: 0, noShow: 0, cancelled: 0, peopleExpected: 0 };
    for (const r of bookRows) {
      const n = Number(r.n);
      if (r.status === 'scheduled') bk.scheduled = n;
      else if (r.status === 'confirmed') bk.confirmed = n;
      else if (r.status === 'attended') bk.attended = n;
      else if (r.status === 'no_show') bk.noShow = n;
      else if (r.status === 'cancelled') bk.cancelled = n;
      if (r.status !== 'cancelled') bk.peopleExpected += Number(r.people);
    }
    const decided = bk.attended + bk.noShow;

    const body: PuertaStatsResponse = {
      range: { from, to },
      prevRange: { from: prevFrom, to: prevTo },
      salas,
      kpis, prev,
      deltas: {
        people: deltaPct(kpis.people, prev.people),
        entries: deltaPct(kpis.entries, prev.entries),
        identified: deltaPct(kpis.identified, prev.identified),
        groupPeople: deltaPct(kpis.groupPeople, prev.groupPeople),
      },
      daily,
      bySala,
      composition,
      byHour: hourRows.map((r) => ({ hour: Number(r.hour), count: Number(r.count) })),
      byWeekday: dowRows.map((r) => ({ weekday: Number(r.weekday), count: Number(r.count) })),
      groups: groupRows.map((r) => ({
        label: r.group_label as string, kind: r.kind ?? null,
        visits: Number(r.visits), people: Number(r.people),
      })),
      bookings: { ...bk, attendedPct: decided > 0 ? Math.round((bk.attended / decided) * 100) : null },
    };
    return body;
    });
  });
};
