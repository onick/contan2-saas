// Datos LOCALES del dashboard tenant-admin (ruta provisional /app). Inspirados
// en la operación real del Centro Cultural Banreservas. Estáticos: no hay
// llamadas a /api/v2. Cuando llegue el wiring real, esta es la única pieza que
// cambia de fuente (los componentes consumen estos tipos sin tocarse).
//
// REAL (de producción): los 4 valores de métrica + sus tendencias +100%, el
// período, y el destacado Los Congos (219/250, 88%), y el conteo gestionado (7).
// ILUSTRATIVO (placeholder de diseño hasta conectar histórico/serie real): la
// curva del gráfico de asistencia, y los estados + ocupaciones de las otras 3
// actividades. Marcado como tal para no mezclar real con placeholder.

export type TrendDir = 'up' | 'down';

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  unit?: string;
  trend?: { dir: TrendDir; label: string };
}

export type ActivityStatus = 'done' | 'live' | 'soon';

export interface ActivitySummary {
  id: string;
  title: string;
  category: string;
  status: ActivityStatus;
  statusLabel: string;
  // null cuando no hay dato real de ocupación (placeholder honesto).
  occupancyPct: number | null;
}

export interface HighlightActivity {
  title: string;
  category: string;
  registered: number;
  capacity: number;
  occupancyPct: number;
  note: string;
}

export interface DashboardInsight {
  key: string;
  tone: 'warn' | 'info';
  title: string;
  message: string;
}

export const DASHBOARD_PERIOD = 'Últimos 30 días';

// 4 métricas (REAL). El período se muestra una vez (chip del topbar), no por
// card. El % de las tasas va como unidad aparte (estilo de la referencia).
export const DASHBOARD_METRICS: DashboardMetric[] = [
  { key: 'asistencias', label: 'Asistencias', value: '510', trend: { dir: 'up', label: '+100%' } },
  { key: 'visitantes', label: 'Visitantes nuevos', value: '1,181', trend: { dir: 'up', label: '+100%' } },
  { key: 'ocupacion', label: 'Ocupación promedio', value: '57', unit: '%', trend: { dir: 'up', label: '+100%' } },
  { key: 'retorno', label: 'Tasa de retorno', value: '27', unit: '%', trend: { dir: 'up', label: '+100%' } },
];

export const ACTIVITIES_MANAGED = 7;

// Serie ILUSTRATIVA de asistencia por semana (para el gráfico). 6 puntos
// normalizados 0..100; la forma comunica tendencia, no es dato real todavía.
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

// Solo Los Congos tiene cifras reales. Estados y ocupaciones del resto son
// ILUSTRATIVOS (placeholder de diseño) hasta conectar datos reales.
export const RECENT_ACTIVITIES: ActivitySummary[] = [
  { id: 'congos', title: 'Los Congos de Villa Mella', category: 'Música y danza tradicional', status: 'done', statusLabel: 'Finalizada', occupancyPct: 88 },
  { id: 'cucu', title: '5to Ciclo de Cine Dominicano | CuCú', category: 'Cine', status: 'live', statusLabel: 'En curso', occupancyPct: 64 },
  { id: 'perdicion', title: 'Cine Clásico | Perdición', category: 'Cine', status: 'done', statusLabel: 'Finalizada', occupancyPct: 72 },
  { id: 'tertulia-adha', title: 'Tertulia ADHA: «Interpretando universos con Manuel Montilla»', category: 'Tertulia', status: 'soon', statusLabel: 'Próxima', occupancyPct: 28 },
];

export const INSIGHTS: DashboardInsight[] = [
  {
    key: 'low-enrollment',
    tone: 'warn',
    title: 'Baja inscripción próxima',
    message: 'Una actividad próxima va por debajo del 30% de su cupo. Conviene reforzar la difusión antes de la fecha.',
  },
  {
    key: 'agenda',
    tone: 'info',
    title: '7 actividades en gestión',
    message: 'El ciclo de cine concentra la mitad de la agenda del mes. Mirá el detalle en Actividades.',
  },
];
