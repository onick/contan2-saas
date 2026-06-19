// apps/api-v2/src/services/protocol-dashboard.ts · agregados del dashboard de
// Protocolo Institucional, todo desde datos REALES (protocol_profiles +
// invitations kind='protocol' + attendance + activities): KPIs + delta vs hace
// 30 días, stats por invitado (última asistencia + eventos del último año),
// actividad reciente y próximos eventos con invitados.

import { sql, type DbClient } from '@contan2/db';
import type { ProtocolCategory } from '@contan2/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;
const pct = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) : 0);
const deltaPct = (cur: number, prev: number): number | null => (prev <= 0 ? null : Math.round(((cur - prev) / prev) * 100));

export interface ProtocolGuest {
  userId: string; code: string; firstName: string; lastName: string;
  email: string | null; phone: string | null;
  category: ProtocolCategory; honorific: string | null; orgTitle: string | null;
  lastAttendanceAt: string | null; lastActivityName: string | null; eventsLastYear: number;
}
export interface ProtocolDashboard {
  kpis: { guests: number; activeCategories: number; pendingInvites: number; attendanceRate: number };
  deltas: { guests: number | null; activeCategories: number | null; pendingInvites: number | null; attendanceRate: number | null };
  counts: Record<string, number>;
  guests: ProtocolGuest[];
  recentActivity: Array<{ kind: 'sent' | 'confirmed' | 'declined' | 'pending' | 'attended'; who: string; activityName: string; at: string }>;
  upcomingEvents: Array<{ id: string; name: string; date: string; location: string; confirmed: number; pending: number }>;
}

export async function protocolDashboard(db: DbClient, orgId: string): Promise<ProtocolDashboard> {
  const now = Date.now();
  const cutoffISO = new Date(now - 30 * DAY_MS).toISOString();
  const yearAgoISO = new Date(now - 365 * DAY_MS).toISOString();
  const nowISO = new Date(now).toISOString();

  const [profiles, countRows, inviteAgg, inviteAggThen, profilesThen, atts, recentInv, upcoming] = await Promise.all([
    // Perfiles activos + datos del usuario.
    db.selectFrom('protocol_profiles as p').innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['p.user_id', 'p.category', 'p.honorific', 'p.org_title', 'u.code', 'u.first_name', 'u.last_name', 'u.email', 'u.phone'])
      .where('p.organization_id', '=', orgId).where('p.active', '=', true).where('u.deleted_at', 'is', null)
      .orderBy('p.created_at', 'desc').limit(500).execute(),
    // Conteo por categoría (para los tabs).
    db.selectFrom('protocol_profiles').select(['category', db.fn.countAll<number>().as('n')])
      .where('organization_id', '=', orgId).where('active', '=', true).groupBy('category').execute(),
    // Invitaciones de protocolo: pendientes + asistidas/total (tasa).
    sql<{ pending: string; total: string; attended: string }>`
      select
        count(*) filter (where i.status = 'pending') as pending,
        count(*) as total,
        count(att.id) as attended
      from invitations i
      left join attendance att on att.activity_id = i.activity_id and att.user_id = i.user_id and att.checked_in_at is not null
      where i.organization_id = ${orgId} and i.kind = 'protocol'
    `.execute(db),
    // Lo mismo "hace 30 días" (cutoff por created_at de la invitación / fecha de actividad).
    sql<{ pending: string; total: string; attended: string }>`
      select
        count(*) filter (where i.status = 'pending' and i.created_at <= ${cutoffISO}) as pending,
        count(*) filter (where a.date <= ${cutoffISO}) as total,
        count(att.id) filter (where a.date <= ${cutoffISO}) as attended
      from invitations i
      join activities a on a.id = i.activity_id
      left join attendance att on att.activity_id = i.activity_id and att.user_id = i.user_id and att.checked_in_at is not null
      where i.organization_id = ${orgId} and i.kind = 'protocol'
    `.execute(db),
    // Perfiles "que ya existían" hace 30 días (para delta de invitados/categorías).
    db.selectFrom('protocol_profiles').select(['category'])
      .where('organization_id', '=', orgId).where('created_at', '<=', sql<Date>`${cutoffISO}`).execute(),
    // Asistencias de los invitados de protocolo (para última asistencia + eventos del último año).
    sql<{ user_id: string; name: string; date: Date }>`
      select att.user_id, a.name, a.date
      from attendance att
      join activities a on a.id = att.activity_id
      join protocol_profiles p on p.user_id = att.user_id and p.organization_id = att.organization_id
      where att.organization_id = ${orgId} and att.user_id is not null and p.active = true
    `.execute(db),
    // Actividad reciente (invitaciones de protocolo, más recientes primero).
    db.selectFrom('invitations as i')
      .innerJoin('activities as a', 'a.id', 'i.activity_id')
      .innerJoin('users as u', 'u.id', 'i.user_id')
      .select(['i.status', 'i.sent_at', 'i.responded_at', 'i.created_at', 'a.name as activityName', 'u.first_name', 'u.last_name'])
      .where('i.organization_id', '=', orgId).where('i.kind', '=', 'protocol')
      .orderBy(sql`coalesce(i.responded_at, i.sent_at, i.created_at)`, 'desc').limit(6).execute(),
    // Próximos eventos con invitados de protocolo.
    sql<{ id: string; name: string; date: Date; location: string; confirmed: string; pending: string }>`
      select a.id, a.name, a.date, a.location,
        count(*) filter (where i.status = 'confirmed') as confirmed,
        count(*) filter (where i.status = 'pending') as pending
      from activities a
      join invitations i on i.activity_id = a.id and i.kind = 'protocol'
      where a.organization_id = ${orgId} and a.date >= ${nowISO}
      group by a.id, a.name, a.date, a.location
      order by a.date asc
      limit 5
    `.execute(db),
  ]);

  // Stats por invitado desde las asistencias.
  const byUser = new Map<string, { last: Date | null; lastName: string | null; year: number }>();
  for (const a of atts.rows) {
    const d = a.date instanceof Date ? a.date : new Date(a.date as unknown as string);
    let e = byUser.get(a.user_id);
    if (!e) { e = { last: null, lastName: null, year: 0 }; byUser.set(a.user_id, e); }
    if (!e.last || d > e.last) { e.last = d; e.lastName = a.name; }
    if (d.toISOString() >= yearAgoISO) e.year += 1;
  }

  const guests: ProtocolGuest[] = profiles.map((p) => {
    const s = byUser.get(p.user_id);
    return {
      userId: p.user_id, code: p.code, firstName: p.first_name, lastName: p.last_name,
      email: p.email, phone: p.phone, category: p.category, honorific: p.honorific, orgTitle: p.org_title,
      lastAttendanceAt: s?.last ? s.last.toISOString() : null,
      lastActivityName: s?.lastName ?? null,
      eventsLastYear: s?.year ?? 0,
    };
  });

  const counts: Record<string, number> = Object.fromEntries(countRows.map((c) => [c.category, Number(c.n)]));
  const inv = inviteAgg.rows[0] ?? { pending: '0', total: '0', attended: '0' };
  const invThen = inviteAggThen.rows[0] ?? { pending: '0', total: '0', attended: '0' };

  const guestsNow = profiles.length;
  const catsNow = Object.keys(counts).length;
  const guestsThen = profilesThen.length;
  const catsThen = new Set(profilesThen.map((p) => p.category)).size;
  const rateNow = pct(Number(inv.attended), Number(inv.total));
  const rateThen = pct(Number(invThen.attended), Number(invThen.total));

  return {
    kpis: { guests: guestsNow, activeCategories: catsNow, pendingInvites: Number(inv.pending), attendanceRate: rateNow },
    deltas: {
      guests: deltaPct(guestsNow, guestsThen),
      activeCategories: deltaPct(catsNow, catsThen),
      pendingInvites: deltaPct(Number(inv.pending), Number(invThen.pending)),
      attendanceRate: deltaPct(rateNow, rateThen),
    },
    counts,
    guests,
    recentActivity: recentInv.map((r) => ({
      kind: r.status === 'confirmed' ? 'confirmed' : r.status === 'declined' ? 'declined' : r.status === 'pending' ? 'pending' : 'sent',
      who: `${r.first_name} ${r.last_name}`.trim(),
      activityName: r.activityName,
      at: new Date((r.responded_at ?? r.sent_at ?? r.created_at) as unknown as string).toISOString(),
    })),
    upcomingEvents: upcoming.rows.map((e) => ({
      id: e.id, name: e.name,
      date: (e.date instanceof Date ? e.date : new Date(e.date as unknown as string)).toISOString(),
      location: e.location, confirmed: Number(e.confirmed), pending: Number(e.pending),
    })),
  };
}
