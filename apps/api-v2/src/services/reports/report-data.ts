// apps/api-v2/src/services/reports/report-data.ts · capa de DATOS de la
// reportería del informe POR ACTIVIDAD. Los agregados de PERÍODO viven en
// period-engine.ts (un solo motor). Reescritura SET-BASED del loader de actividad
// de v1 (que hacía N+1 por asistente), conservando el CONTRATO DE SALIDA que
// consumen las plantillas portadas (Excel/PDF). Zona del tenant: ver ./fmt.ts.

import { sql, type DbClient } from '@contan2/db';

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
  attendances: Array<{ userId: string | null; userCode: string | null; registeredAt: string; checkedInAt: string | null; anonymous: boolean; companionsChildren: number; companionsAdults: number }>;
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
    .select(['user_id', 'user_code', 'registered_at', 'checked_in_at', 'anonymous', 'companions_children', 'companions_adults'])
    .where('organization_id', '=', orgId).where('activity_id', '=', activityId)
    // Check-ins primero (más recientes arriba); las reservas (NULL) al final.
    .orderBy(sql`checked_in_at desc nulls last, registered_at desc`)
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
    // Afinidad = visitas reales (solo check-ins).
    .where('checked_in_at', 'is not', null)
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
      checkedInAt: x.checked_in_at ? new Date(x.checked_in_at as unknown as string).toISOString() : null,
      anonymous: x.anonymous,
      companionsChildren: x.companions_children ?? 0,
      companionsAdults: x.companions_adults ?? 0,
    })),
    users,
    affinities,
    protocol: await loadActivityProtocol(db, orgId, activityId),
  };
}
