// Datos LOCALES de la pantalla de Actividades (ruta provisional /app/actividades).
// Estáticos: no hay llamadas a /api/v2. La fila Los Congos (219/250, 88%) es
// REAL; el resto de fechas/ocupaciones son ILUSTRATIVAS hasta conectar la API.

export type ActivityStatus = 'soon' | 'live' | 'done' | 'draft';

export interface Activity {
  id: string;
  title: string;
  category: string;
  date: string;
  // ISO 8601 (o null si "sin fecha"/borrador). Para filtrar/ordenar por fecha;
  // `date` es solo el string de display. Se preserva del ISO real de la API.
  startsAt: string | null;
  location: string;
  status: ActivityStatus;
  statusLabel: string;
  // null = sin dato de ocupación (p.ej. borrador no publicado).
  registered: number | null;
  capacity: number | null;
  occupancyPct: number | null;
  // Portada (activities.image_url). Hoy el listado real (ActivityListItem) NO la
  // proyecta → las actividades reales caen al fallback de ícono; se muestra en
  // demo. Opcional: undefined/null → sin portada.
  imageUrl?: string | null;
}

export interface StatusTab {
  key: 'todas' | ActivityStatus;
  label: string;
  count: number;
}

export const ACTIVITIES: Activity[] = [
  { id: 'visita-citlally', title: 'Visita Guiada CITLALLY MIRANDA', category: 'Otro', date: '29 may 2026, 7:00 p.m.', startsAt: '2026-05-29T19:00:00.000Z', location: 'Centro Cultural Banreservas', status: 'soon', statusLabel: 'Próxima', registered: 13, capacity: 60, occupancyPct: 22 },
  { id: 'tertulia-adha', title: 'Tertulia ADHA: «Interpretando universos con Manuel Montilla»', category: 'Tertulia', date: '27 may 2026', startsAt: '2026-05-27T00:00:00.000Z', location: 'CCB', status: 'soon', statusLabel: 'Próxima', registered: 14, capacity: 50, occupancyPct: 28 },
  { id: 'kacimiro', title: '5to Ciclo de Cine Dominicano · Kacimiro', category: 'Cine', date: '24 may 2026', startsAt: '2026-05-24T00:00:00.000Z', location: 'CCB', status: 'live', statusLabel: 'En curso', registered: 85, capacity: 150, occupancyPct: 57, imageUrl: '/kiosko/demo/cine.jpg' },
  { id: 'perdicion', title: 'Cine Clásico · Perdición', category: 'Cine', date: '18 may 2026', startsAt: '2026-05-18T00:00:00.000Z', location: 'CCB', status: 'done', statusLabel: 'Finalizada', registered: 108, capacity: 150, occupancyPct: 72 },
  { id: 'congos', title: 'Los Congos de Villa Mella', category: 'Concierto', date: '12 may 2026', startsAt: '2026-05-12T00:00:00.000Z', location: 'CCB', status: 'done', statusLabel: 'Finalizada', registered: 219, capacity: 250, occupancyPct: 88 },
  { id: 'memoria-territorio', title: 'Exposición: Memoria y Territorio', category: 'Exposición', date: '8 may 2026', startsAt: '2026-05-08T00:00:00.000Z', location: 'CCB', status: 'done', statusLabel: 'Finalizada', registered: 140, capacity: 200, occupancyPct: 70 },
  { id: 'serigrafia', title: 'Taller de Serigrafía', category: 'Taller', date: 'Sin fecha', startsAt: null, location: 'CCB', status: 'draft', statusLabel: 'Borrador', registered: null, capacity: null, occupancyPct: null },
];

export const STATUS_TABS: StatusTab[] = [
  { key: 'todas', label: 'Todas', count: ACTIVITIES.length },
  { key: 'soon', label: 'Próximas', count: ACTIVITIES.filter((a) => a.status === 'soon').length },
  { key: 'live', label: 'En curso', count: ACTIVITIES.filter((a) => a.status === 'live').length },
  { key: 'done', label: 'Finalizadas', count: ACTIVITIES.filter((a) => a.status === 'done').length },
  { key: 'draft', label: 'Borradores', count: ACTIVITIES.filter((a) => a.status === 'draft').length },
];

// Mini-KPIs del encabezado.
export const ACTIVITIES_KPIS = {
  total: ACTIVITIES.length,
  proximas: ACTIVITIES.filter((a) => a.status === 'soon').length,
  ocupacionPromedio: '57%',
};
