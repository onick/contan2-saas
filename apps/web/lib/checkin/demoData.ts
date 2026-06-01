// Datos LOCALES de la pantalla Check-in (ruta provisional /app/check-in).
// Estáticos: no hay tiempo real ni /api/v2 todavía. Los números y el feed son
// DATOS DEMO ficticios (nombres/correos @example.com, no PII real) para
// comunicar el producto; el "EN VIVO" es decorativo hasta el wiring real.

export interface CheckinStat {
  key: string;
  label: string;
  value: string;
}

export interface ActiveActivity {
  id: string;
  title: string;
  category: string;
  registered: number;
  capacity: number;
  occupancyPct: number;
  attendedToday: number;
}

export interface CheckinEntry {
  id: string;
  name: string;
  code: string;
  activity: string;
  timeAgo: string;
}

export const CHECKIN_STATS: CheckinStat[] = [
  { key: 'hoy', label: 'Check-ins hoy', value: '48' },
  { key: 'ultimos', label: 'Últimos 10 min', value: '6' },
  { key: 'unicos', label: 'Visitantes únicos', value: '41' },
  { key: 'activas', label: 'Actividades activas', value: '2' },
];

export const ACTIVE_ACTIVITIES: ActiveActivity[] = [
  { id: 'congos', title: 'Los Congos de Villa Mella', category: 'Concierto', registered: 219, capacity: 250, occupancyPct: 88, attendedToday: 31 },
  { id: 'kacimiro', title: '5to Ciclo de Cine Dominicano · Kacimiro', category: 'Cine', registered: 85, capacity: 150, occupancyPct: 57, attendedToday: 17 },
];

// Feed "en vivo" · DATOS DEMO ficticios (no PII real).
export const LIVE_FEED: CheckinEntry[] = [
  { id: 'f1', name: 'Sofía Méndez', code: 'CCB-7K2P9Q', activity: 'Los Congos de Villa Mella', timeAgo: 'hace 1 min' },
  { id: 'f2', name: 'Diego Ramírez', code: 'CCB-3H8L4M', activity: 'Los Congos de Villa Mella', timeAgo: 'hace 3 min' },
  { id: 'f3', name: 'Valentina Cruz', code: 'CCB-9T1X6B', activity: '5to Ciclo de Cine Dominicano', timeAgo: 'hace 6 min' },
  { id: 'f4', name: 'Andrés Polanco', code: 'CCB-5R2N7D', activity: 'Los Congos de Villa Mella', timeAgo: 'hace 9 min' },
  { id: 'f5', name: 'Carla Núñez', code: 'CCB-2W8H1K', activity: '5to Ciclo de Cine Dominicano', timeAgo: 'hace 12 min' },
  { id: 'f6', name: 'Luis Fermín', code: 'CCB-6P3Q4R', activity: 'Los Congos de Villa Mella', timeAgo: 'hace 15 min' },
];
