// apps/web/lib/api/attendance.ts · fetcher read-only de registros de asistencia.
// Mapea AttendanceListItem (GET /api/v2/attendance) → AttendanceRecord. Soporta
// asistencia ANÓNIMA (anonymous=true → user/userCode null) sin romper la UI.
// Devuelve null si falla → la página cae a demoData.

import {
  AttendanceListResponseSchema,
  DashboardMetricsResponseSchema,
  type AttendanceListItem,
} from '@contan2/contracts';
import { apiGet } from './client';
import { toApiQuery } from '../admin/list-params';
import type { AttendanceRecord } from '../registros/demoData';

const DT_FMT = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function toRecord(it: AttendanceListItem): AttendanceRecord {
  const present = it.checkedInAt != null;
  const name = it.anonymous
    ? 'Anónimo'
    : `${it.firstName ?? ''} ${it.lastName ?? ''}`.trim() || 'Visitante';
  return {
    id: it.id,
    name,
    code: it.userCode ?? '—', // anónimo → sin código
    activity: it.activityName,
    category: 'Otro', // la API de asistencia no devuelve categoría
    datetime: DT_FMT.format(new Date(it.checkedInAt ?? it.registeredAt)),
    channel: 'Web', // la API aún no provee canal
    status: present ? 'presente' : 'registrado',
    statusLabel: present ? 'Presente' : 'Registrado',
  };
}

// Página de Registros (paginación + búsqueda + filtros SERVER-SIDE). `total` es
// el REAL del filtro aplicado (count en SQL). tasa/no-show salen de
// /dashboard/metrics (globales del tenant, reales — NO del slice). Se eliminó el
// KPI "hoy" (era sobre el set cargado → engañoso). null si falla → Unavailable.
export interface AttendancePage {
  records: AttendanceRecord[];
  total: number;
  tasaPct: number;
  noShowPct: number;
  limit: number;
  offset: number;
}

export interface AttendancePageParams {
  limit: number;
  offset: number;
  q?: string;
  activityId?: string;
  dateFrom?: string; // ISO completo
  dateTo?: string; // ISO completo
}

export async function getAttendancePage(params: AttendancePageParams): Promise<AttendancePage | null> {
  try {
    const qs = toApiQuery(params);
    const [att, metrics] = await Promise.all([
      apiGet(`/api/v2/attendance?${qs}`, AttendanceListResponseSchema),
      apiGet('/api/v2/dashboard/metrics', DashboardMetricsResponseSchema),
    ]);
    const m = metrics.metrics;
    const tasaPct = m.totalAttendance > 0 ? Math.round((m.checkedIn / m.totalAttendance) * 100) : 0;
    return {
      records: att.items.map(toRecord),
      total: att.total,
      tasaPct,
      noShowPct: 100 - tasaPct,
      limit: att.limit,
      offset: att.offset,
    };
  } catch {
    return null;
  }
}
