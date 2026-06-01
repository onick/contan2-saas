// Datos LOCALES del dashboard tenant-admin (ruta provisional /app). Inspirados
// en la operación real del Centro Cultural Banreservas. Estáticos: no hay
// llamadas a /api/v2. Cuando llegue el wiring real, esta es la única pieza que
// cambia de fuente (los componentes consumen estos tipos sin tocarse).
//
// REAL: los 4 KPIs + tendencias +100%, el período, el destacado Los Congos
// (219/250, 88%), la actividad próxima (Visita Guiada · 13/60 · 22%) y el top
// de actividades por asistencia.
// ILUSTRATIVO (placeholder de diseño hasta conectar histórico/serie real): la
// curva del gráfico.
// DATOS DEMO (NO PII real): la lista de "Últimos visitantes" usa nombres y
// correos ficticios (@example.com). Los visitantes reales son PII y vienen de
// la API enmascarados — nunca se hardcodean en el repo.

export type TrendDir = 'up' | 'down';

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  unit?: string;
  trend?: { dir: TrendDir; label: string };
}

export interface RankedActivity {
  id: string;
  title: string;
  category: string;
  registered: number;
  capacity: number;
  occupancyPct: number;
}

export interface HighlightActivity {
  title: string;
  category: string;
  registered: number;
  capacity: number;
  occupancyPct: number;
  note: string;
}

export interface FeaturedActivity {
  title: string;
  category: string;
  date: string;
  location: string;
  startsLabel: string;
  registered: number;
  capacity: number;
  occupancyPct: number;
}

export interface RecentVisitor {
  id: string;
  name: string;
  code: string;
  email: string;
  visits: number;
}

export const DASHBOARD_PERIOD = 'Últimos 30 días';

// 4 métricas (REAL).
export const DASHBOARD_METRICS: DashboardMetric[] = [
  { key: 'asistencias', label: 'Asistencias', value: '510', trend: { dir: 'up', label: '+100%' } },
  { key: 'visitantes', label: 'Visitantes nuevos', value: '1,181', trend: { dir: 'up', label: '+100%' } },
  { key: 'ocupacion', label: 'Ocupación promedio', value: '57', unit: '%', trend: { dir: 'up', label: '+100%' } },
  { key: 'retorno', label: 'Tasa de retorno', value: '27', unit: '%', trend: { dir: 'up', label: '+100%' } },
];

export const ACTIVITIES_MANAGED = 7;

// Serie ILUSTRATIVA de asistencia por semana (forma comunica tendencia).
export const ATTENDANCE_SERIES = [38, 44, 52, 49, 68, 82];
export const ATTENDANCE_LABELS = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6'];

export const HIGHLIGHT: HighlightActivity = {
  title: 'Los Congos de Villa Mella',
  category: 'Música y danza tradicional',
  registered: 219,
  capacity: 250,
  occupancyPct: 88,
  note: 'La de mayor convocatoria del período',
};

// Actividad próxima destacada (REAL). El countdown vivo llega con el wiring;
// acá es una etiqueta estática.
export const FEATURED_ACTIVITY: FeaturedActivity = {
  title: 'Visita Guiada CITLALLY MIRANDA',
  category: 'Otro',
  date: '29 may 2026 · 07:00 p.m.',
  location: 'Centro Cultural Banreservas',
  startsLabel: 'Próxima',
  registered: 13,
  capacity: 60,
  occupancyPct: 22,
};

// Top actividades por asistencia (REAL para las 2 primeras; las siguientes son
// ilustrativas hasta conectar el ranking real).
export const TOP_ACTIVITIES: RankedActivity[] = [
  { id: 'congos', title: 'Los Congos de Villa Mella', category: 'Concierto', registered: 219, capacity: 250, occupancyPct: 88 },
  { id: 'perdicion', title: 'Cine Clásico | Perdición', category: 'Cine', registered: 108, capacity: 150, occupancyPct: 72 },
  { id: 'kacimiro', title: '5to Ciclo de Cine Dominicano | Kacimiro', category: 'Cine', registered: 85, capacity: 150, occupancyPct: 57 },
  { id: 'tertulia', title: 'Tertulia ADHA: «Interpretando universos con Manuel Montilla»', category: 'Tertulia', registered: 14, capacity: 50, occupancyPct: 28 },
];

// Últimos visitantes · DATOS DEMO ficticios (NO PII real). Emails @example.com.
export const RECENT_VISITORS: RecentVisitor[] = [
  { id: 'v1', name: 'Sofía Méndez', code: 'CCB-7K2P9Q', email: 'sofia.m@example.com', visits: 2 },
  { id: 'v2', name: 'Diego Ramírez', code: 'CCB-3H8L4M', email: 'diego.r@example.com', visits: 2 },
  { id: 'v3', name: 'Valentina Cruz', code: 'CCB-9T1X6B', email: 'valentina.c@example.com', visits: 1 },
  { id: 'v4', name: 'Andrés Polanco', code: 'CCB-5R2N7D', email: 'andres.p@example.com', visits: 1 },
];
