// Datos LOCALES del dashboard tenant-admin (ruta provisional /app). Inspirados
// en la operación real del Centro Cultural Banreservas, pero estáticos: no hay
// llamadas a /api/v2. Cuando llegue el wiring real, esta es la única pieza que
// cambia de fuente (los componentes consumen estos tipos sin tocarse).
//
// Los valores numéricos van pre-formateados como string (es-DO) para que el
// render y los tests sean deterministas, sin depender del locale de Intl.

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

export interface ActivitySummary {
  id: string;
  title: string;
  category: string;
}

export interface HighlightActivity {
  title: string;
  registered: number;
  capacity: number;
  occupancyPct: number;
}

export interface DashboardAlert {
  title: string;
  message: string;
  // 'demo' marca explícitamente que es un escenario mock, no un dato real.
  demo: boolean;
}

export const DASHBOARD_PERIOD = 'Últimos 30 días';

// 4 métricas en el grid superior (decisión: "7 actividades administradas" NO
// va acá — vive en el encabezado de la sección de actividades).
export const DASHBOARD_METRICS: DashboardMetric[] = [
  { key: 'asistencias', label: 'Asistencias', value: '510', hint: DASHBOARD_PERIOD },
  { key: 'visitantes', label: 'Visitantes nuevos', value: '1,137', hint: DASHBOARD_PERIOD },
  { key: 'ocupacion', label: 'Ocupación promedio', value: '57%', hint: DASHBOARD_PERIOD },
  { key: 'retorno', label: 'Tasa de retorno', value: '23%', hint: DASHBOARD_PERIOD },
];

// Cantidad de actividades gestionadas — se muestra en el encabezado de la
// sección "Actividades recientes", no como MetricCard.
export const ACTIVITIES_MANAGED = 7;

export const HIGHLIGHT: HighlightActivity = {
  title: 'Los Congos de Villa Mella',
  registered: 219,
  capacity: 250,
  occupancyPct: 88,
};

// Solo Los Congos tiene cifras reales (en HIGHLIGHT). Para el resto NO
// inventamos asistencia/ocupación: solo categoría descriptiva derivada del
// nombre. Placeholder honesto.
export const RECENT_ACTIVITIES: ActivitySummary[] = [
  { id: 'congos', title: 'Los Congos de Villa Mella', category: 'Música y danza tradicional' },
  { id: 'cucu', title: '5to Ciclo de Cine Dominicano | CuCú', category: 'Cine' },
  { id: 'perdicion', title: 'Cine Clásico | Perdición', category: 'Cine' },
  {
    id: 'tertulia-adha',
    title: 'Tertulia ADHA: “Interpretando universos con Manuel Montilla”',
    category: 'Tertulia',
  },
];

// Escenario mock (etiquetado demo): no se basa en una inscripción real.
export const LOW_ENROLLMENT_ALERT: DashboardAlert = {
  title: 'Baja inscripción próxima',
  message:
    'Una actividad próxima va por debajo del 30% de su cupo. Revisá la difusión antes de la fecha.',
  demo: true,
};
