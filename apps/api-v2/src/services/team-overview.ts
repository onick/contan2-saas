// apps/api-v2/src/services/team-overview.ts · overview del equipo para el
// dashboard "Mi equipo". Read-only, tenant-scoped. KPIs + resumen por rol, todo
// desde datos reales: staff_members (activos/admins/por rol), staff_invitations
// (pendientes) y tenant_audit_log (actividad de la semana, sin tabla extra).

import { sql, type DbClient } from '@contan2/db';
import type { TeamOverviewResponse } from '@contan2/contracts';

const ROLE_ORDER = ['owner', 'admin', 'operator', 'puerta', 'protocolo', 'consulta'];
const DAY_MS = 86_400_000;
const pct = (part: number, whole: number) => (whole <= 0 ? 0 : Math.round((part / whole) * 100));

export async function teamOverview(db: DbClient, orgId: string): Promise<TeamOverviewResponse> {
  const now = Date.now();
  const weekAgoISO = new Date(now - 7 * DAY_MS).toISOString();
  const twoWeeksAgoISO = new Date(now - 14 * DAY_MS).toISOString();

  const [members, pendingRow, weekRow, prevWeekRow] = await Promise.all([
    // Miembros NO soft-deleted: rol + status (para activos, admins y por rol).
    db.selectFrom('staff_members').select(['role', 'status'])
      .where('organization_id', '=', orgId).where('deleted_at', 'is', null).execute(),
    // Invitaciones pendientes.
    db.selectFrom('staff_invitations').select(db.fn.countAll<number>().as('n'))
      .where('organization_id', '=', orgId).where('status', '=', 'pending').executeTakeFirst(),
    // Actores distintos del staff en la última semana (actividad real).
    db.selectFrom('tenant_audit_log').select(sql<number>`count(distinct actor_staff_id)`.as('n'))
      .where('organization_id', '=', orgId).where('actor_staff_id', 'is not', null)
      .where('created_at', '>=', sql<Date>`${weekAgoISO}`).executeTakeFirst(),
    // Semana anterior (para el delta).
    db.selectFrom('tenant_audit_log').select(sql<number>`count(distinct actor_staff_id)`.as('n'))
      .where('organization_id', '=', orgId).where('actor_staff_id', 'is not', null)
      .where('created_at', '>=', sql<Date>`${twoWeeksAgoISO}`).where('created_at', '<', sql<Date>`${weekAgoISO}`)
      .executeTakeFirst(),
  ]);

  const activeMembers = members.filter((m) => m.status === 'active').length;
  const admins = members.filter((m) => m.status === 'active' && (m.role === 'owner' || m.role === 'admin')).length;
  const pendingInvites = Number(pendingRow?.n ?? 0);
  const activeThisWeek = Number(weekRow?.n ?? 0);
  const activePrevWeek = Number(prevWeekRow?.n ?? 0);
  const activeThisWeekPct = pct(activeThisWeek, activeMembers);
  const activeDeltaPts = activeThisWeekPct - pct(activePrevWeek, activeMembers);

  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.role, (counts.get(m.role) ?? 0) + 1);
  const roles = ROLE_ORDER.map((role) => ({ role, count: counts.get(role) ?? 0 }));

  return {
    kpis: { activeMembers, admins, pendingInvites, activeThisWeek, activeThisWeekPct, activeDeltaPts },
    roles,
  };
}
