// apps/web/lib/api/activities.ts · fetcher read-only de actividades.
// Mapea ActivityListItem (GET /api/v2/activities) → la forma Activity que
// consume ActivitiesTable. Devuelve null si falla (sin sesión / api-v2 caído)
// → la página cae a demoData.

import { ActivitiesListResponseSchema, type ActivityListItem } from '@contan2/contracts';
import { apiGet } from './client';
import { typeLabel } from '../activities/typeLabels';
import type { Activity, ActivityStatus } from '../activities/demoData';

// status de la API (activa/finalizada/cancelada) → semáforo UI (StatusBadge).
// La API no distingue "próxima"; cancelada reusa el estilo apagado de draft.
const STATUS_MAP: Record<'activa' | 'finalizada' | 'cancelada', { status: ActivityStatus; label: string }> = {
  activa: { status: 'live', label: 'Activa' },
  finalizada: { status: 'done', label: 'Finalizada' },
  cancelada: { status: 'draft', label: 'Cancelada' },
};

const DATE_FMT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

function toActivity(it: ActivityListItem): Activity {
  const s = STATUS_MAP[it.status];
  const occupancyPct = it.capacity > 0 ? Math.round((it.enrolledCount / it.capacity) * 100) : null;
  return {
    id: it.id,
    title: it.name,
    category: it.category ?? typeLabel(it.type), // sin categoría → el TIPO (un Concierto no es 'Otro')
    date: DATE_FMT.format(new Date(it.date)),
    // Preserva el ISO real de la API (hoy se descartaba) para filtrar por fecha.
    startsAt: it.date,
    location: it.location,
    status: s.status,
    statusLabel: s.label,
    registered: it.enrolledCount,
    capacity: it.capacity,
    occupancyPct,
    // Portada real del listado (image_url → imageUrl); null si la actividad no
    // tiene portada → las cards caen al fallback de ícono.
    imageUrl: it.imageUrl ?? null,
    imagePosY: it.imagePosY ?? null,
    // Crudos para Lifecycle B (edición + acciones de estado). El listado no
    // proyecta endDate/description → el form de edición los deja vacíos y sólo
    // envía lo modificado (PATCH parcial preserva lo no tocado).
    type: it.type,
    statusRaw: it.status,
  };
}

// Vista completa de Actividades: un solo fetch deriva tabla + KPIs + conteos de
// pills (todo-real o todo-demo, sin mezclar). `total` es real (response.total);
// los conteos por estado y el promedio de ocupación son sobre el SET CARGADO
// (limit 100) — exactos para tenants con <100 actividades; estimación si hay más.
export interface ActivitiesView {
  activities: Activity[];
  total: number;
  activas: number;
  finalizadas: number;
  canceladas: number;
  avgOccupancyPct: number;
}

export async function getActivitiesView(): Promise<ActivitiesView | null> {
  try {
    const { items, total } = await apiGet('/api/v2/activities?limit=100', ActivitiesListResponseSchema);
    const activities = items.map(toActivity);
    const occ = activities.map((a) => a.occupancyPct).filter((p): p is number => p != null);
    return {
      activities,
      total,
      activas: items.filter((i) => i.status === 'activa').length,
      finalizadas: items.filter((i) => i.status === 'finalizada').length,
      canceladas: items.filter((i) => i.status === 'cancelada').length,
      avgOccupancyPct: occ.length ? Math.round(occ.reduce((s, p) => s + p, 0) / occ.length) : 0,
    };
  } catch {
    return null;
  }
}
