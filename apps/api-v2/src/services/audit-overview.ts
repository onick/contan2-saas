// apps/api-v2/src/services/audit-overview.ts · overview del Historial para el
// dashboard de auditoría. Read-only, tenant-scoped. KPIs (hoy + delta vs ayer),
// resumen por categoría (donut), actores más activos (con nombre REAL del staff
// vía join) y señales sospechosas soportadas (exportaciones hoy, eliminaciones
// 24h). Todo desde tenant_audit_log. "Hoy/ayer" por día calendario de la DB.

import { sql, type DbClient } from '@contan2/db';
import type { AuditOverviewResponse } from '@contan2/contracts';
import { categoryOf } from './audit-read.js';

const deltaPct = (today: number, yday: number): number | null =>
  yday <= 0 ? null : Math.round(((today - yday) / yday) * 100);

interface KpiRow {
  ev_today: number; ev_yday: number; au_today: number; au_yday: number;
  rep_today: number; rep_yday: number; act_today: number; act_yday: number; del_24h: number;
}
interface ActorRow { actor_staff_id: string | null; full_name: string | null; role: string | null; n: number }
interface ActionRow { action: string; n: number }

export async function auditOverview(db: DbClient, orgId: string): Promise<AuditOverviewResponse> {
  // Límites de día: date_trunc('day', now()) = inicio de hoy; ayer = [hoy-1d, hoy).
  const [kpiRes, catRes, actorRes] = await Promise.all([
    sql<KpiRow>`
      select
        count(*) filter (where created_at >= date_trunc('day', now()))::int as ev_today,
        count(*) filter (where created_at >= date_trunc('day', now()) - interval '1 day' and created_at < date_trunc('day', now()))::int as ev_yday,
        count(distinct actor_staff_id) filter (where created_at >= date_trunc('day', now()))::int as au_today,
        count(distinct actor_staff_id) filter (where created_at >= date_trunc('day', now()) - interval '1 day' and created_at < date_trunc('day', now()))::int as au_yday,
        count(*) filter (where action = 'report.generated' and created_at >= date_trunc('day', now()))::int as rep_today,
        count(*) filter (where action = 'report.generated' and created_at >= date_trunc('day', now()) - interval '1 day' and created_at < date_trunc('day', now()))::int as rep_yday,
        count(*) filter (where action = 'activity.created' and created_at >= date_trunc('day', now()))::int as act_today,
        count(*) filter (where action = 'activity.created' and created_at >= date_trunc('day', now()) - interval '1 day' and created_at < date_trunc('day', now()))::int as act_yday,
        count(*) filter (where action like '%.deleted' and created_at >= now() - interval '24 hours')::int as del_24h
      from tenant_audit_log
      where organization_id = ${orgId} and created_at >= date_trunc('day', now()) - interval '1 day'
    `.execute(db),
    sql<ActionRow>`
      select action, count(*)::int as n from tenant_audit_log
      where organization_id = ${orgId} and created_at >= date_trunc('day', now())
      group by action
    `.execute(db),
    sql<ActorRow>`
      select t.actor_staff_id, s.full_name, s.role, count(*)::int as n
      from tenant_audit_log t
      left join staff_members s on s.id = t.actor_staff_id
      where t.organization_id = ${orgId} and t.created_at >= date_trunc('day', now()) and t.actor_staff_id is not null
      group by t.actor_staff_id, s.full_name, s.role
      order by n desc
      limit 5
    `.execute(db),
  ]);

  const k = kpiRes.rows[0] ?? { ev_today: 0, ev_yday: 0, au_today: 0, au_yday: 0, rep_today: 0, rep_yday: 0, act_today: 0, act_yday: 0, del_24h: 0 };

  // Donut: agrega por categoría UI (categoryOf) las acciones de hoy.
  const catMap = new Map<string, number>();
  for (const r of catRes.rows) catMap.set(categoryOf(r.action), (catMap.get(categoryOf(r.action)) ?? 0) + Number(r.n));
  const byCategory = [...catMap.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);

  const topActors = actorRes.rows.map((r) => ({
    staffId: r.actor_staff_id, name: r.full_name ?? 'Staff', role: r.role, count: Number(r.n),
  }));

  return {
    kpis: {
      eventsToday: Number(k.ev_today), eventsDeltaPct: deltaPct(Number(k.ev_today), Number(k.ev_yday)),
      activeUsersToday: Number(k.au_today), activeUsersDeltaPct: deltaPct(Number(k.au_today), Number(k.au_yday)),
      reportsToday: Number(k.rep_today), reportsDeltaPct: deltaPct(Number(k.rep_today), Number(k.rep_yday)),
      activitiesToday: Number(k.act_today), activitiesDeltaPct: deltaPct(Number(k.act_today), Number(k.act_yday)),
      deletions24h: Number(k.del_24h),
    },
    byCategory,
    topActors,
    suspicious: { exportsToday: Number(k.rep_today), deletions24h: Number(k.del_24h) },
  };
}
