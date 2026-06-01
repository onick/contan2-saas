// apps/web/lib/api/attendance.ts · fetcher read-only de registros de asistencia.
// Mapea AttendanceListItem (GET /api/v2/attendance) → AttendanceRecord. Soporta
// asistencia ANÓNIMA (anonymous=true → user/userCode null) sin romper la UI.
// Devuelve null si falla → la página cae a demoData.

import { AttendanceListResponseSchema, type AttendanceListItem } from '@contan2/contracts';
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

export async function getAttendance(): Promise<AttendanceRecord[] | null> {
  try {
    const { items } = await apiGet('/api/v2/attendance', AttendanceListResponseSchema);
    return items.map(toRecord);
  } catch {
    return null;
  }
}
