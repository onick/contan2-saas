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
  // Contexto corto bajo el valor (qué representa), distinto por métrica.
  unit?: string;
  // Métrica ancla: lleva el acento naranja sutil (top-accent).
  anchor?: boolean;
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

// 4 métricas en el grid superior (decisión: "7 actividades" NO va acá — vive
// en el encabezado de la sección de actividades). El período se muestra una
// sola vez (chip del topbar + título de sección), no repetido por card; cada
// card lleva su propia unidad/contexto.
export const DASHBOARD_METRICS: DashboardMetric[] = [
  { key: 'asistencias', label: 'Asistencias', value: '510', unit: 'personas', anchor: true },
  { key: 'visitantes', label: 'Visitantes nuevos', value: '1,137', unit: 'primera visita' },
  { key: 'ocupacion', label: 'Ocupación promedio', value: '57%', unit: 'del cupo por actividad' },
  { key: 'retorno', label: 'Tasa de retorno', value: '23%', unit: 'vuelven a asistir' },
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
