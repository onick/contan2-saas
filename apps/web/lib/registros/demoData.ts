// Datos LOCALES de la pantalla Registros de asistencia (/app/registros).
// Estáticos: no hay /api/v2. DATOS DEMO ficticios (@example.com / visitantes no
// reales) — los registros reales son PII y vienen de la API enmascarados.

export type AttendanceStatus = 'presente' | 'registrado' | 'noshow';
export type Channel = 'Kiosko' | 'Web' | 'Invitación';

export interface AttendanceRecord {
  id: string;
  name: string;
  code: string;
  activity: string;
  category: string;
  datetime: string;
  channel: Channel;
  status: AttendanceStatus;
  statusLabel: string;
}

export interface AttendanceKpi {
  key: string;
  label: string;
  value: string;
  trend?: { dir: 'up' | 'down'; label: string };
}

export const ATTENDANCE_KPIS: AttendanceKpi[] = [
  { key: 'hoy', label: 'Asistencias hoy', value: '48' },
  { key: 'total', label: 'Total (30 días)', value: '510' },
  { key: 'tasa', label: 'Tasa de asistencia', value: '78%', trend: { dir: 'up', label: '+6%' } },
  { key: 'noshow', label: 'No-show', value: '22%' },
];

export const ATTENDANCE_TABS = ['Todas', 'Hoy', 'Esta semana', 'Este mes'] as const;

export const TOTAL_RECORDS = '510';

export const ATTENDANCE_RECORDS: AttendanceRecord[] = [
  { id: 'r1', name: 'Sofía Méndez', code: 'CCB-7K2P9Q', activity: 'Los Congos de Villa Mella', category: 'Concierto', datetime: '29 may 2026, 7:02 p.m.', channel: 'Kiosko', status: 'presente', statusLabel: 'Presente' },
  { id: 'r2', name: 'Diego Ramírez', code: 'CCB-3H8L4M', activity: 'Los Congos de Villa Mella', category: 'Concierto', datetime: '29 may 2026, 7:05 p.m.', channel: 'Web', status: 'presente', statusLabel: 'Presente' },
  { id: 'r3', name: 'Valentina Cruz', code: 'CCB-9T1X6B', activity: '5to Ciclo de Cine Dominicano', category: 'Cine', datetime: '29 may 2026, 6:48 p.m.', channel: 'Invitación', status: 'presente', statusLabel: 'Presente' },
  { id: 'r4', name: 'Andrés Polanco', code: 'CCB-5R2N7D', activity: '5to Ciclo de Cine Dominicano', category: 'Cine', datetime: '28 may 2026, 7:15 p.m.', channel: 'Kiosko', status: 'presente', statusLabel: 'Presente' },
  { id: 'r5', name: 'Carla Núñez', code: 'CCB-2W8H1K', activity: 'Cine Clásico · Perdición', category: 'Cine', datetime: '18 may 2026, 8:01 p.m.', channel: 'Web', status: 'presente', statusLabel: 'Presente' },
  { id: 'r6', name: 'Luis Fermín', code: 'CCB-6P3Q4R', activity: 'Tertulia ADHA', category: 'Tertulia', datetime: '27 may 2026', channel: 'Invitación', status: 'registrado', statusLabel: 'Registrado' },
  { id: 'r7', name: 'Mariana Tavárez', code: 'CCB-8D5V3J', activity: 'Los Congos de Villa Mella', category: 'Concierto', datetime: '12 may 2026', channel: 'Web', status: 'noshow', statusLabel: 'No-show' },
];
