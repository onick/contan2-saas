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

// Vista completa de Registros: combina /attendance (tabla + total real + "hoy"
// sobre el set) con /dashboard/metrics (tasa de asistencia real = checkedIn /
// totalAttendance). todo-real o todo-demo (si cualquiera falla → null → demo).
export interface AttendanceView {
  records: AttendanceRecord[];
  total: number; // real (attendance.total)
  tasaPct: number; // real (metrics: checkedIn/totalAttendance)
  noShowPct: number; // 100 - tasa
  hoy: number; // check-ins de hoy, sobre el set cargado (estimación)
}

export async function getAttendanceView(): Promise<AttendanceView | null> {
  try {
    const [att, metrics] = await Promise.all([
      apiGet('/api/v2/attendance?limit=100', AttendanceListResponseSchema),
      apiGet('/api/v2/dashboard/metrics', DashboardMetricsResponseSchema),
    ]);
    const records = att.items.map(toRecord);
    const m = metrics.metrics;
    const tasaPct = m.totalAttendance > 0 ? Math.round((m.checkedIn / m.totalAttendance) * 100) : 0;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const hoy = att.items.filter((i) => i.checkedInAt != null && new Date(i.checkedInAt) >= startOfToday).length;
    return { records, total: att.total, tasaPct, noShowPct: 100 - tasaPct, hoy };
  } catch {
    return null;
  }
}
