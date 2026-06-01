// apps/web/lib/api/activities.ts · fetcher read-only de actividades.
// Mapea ActivityListItem (GET /api/v2/activities) → la forma Activity que
// consume ActivitiesTable. Devuelve null si falla (sin sesión / api-v2 caído)
// → la página cae a demoData.

import { ActivitiesListResponseSchema, type ActivityListItem } from '@contan2/contracts';
import { apiGet } from './client';
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
    category: it.category ?? 'Otro',
    date: DATE_FMT.format(new Date(it.date)),
    location: it.location,
    status: s.status,
    statusLabel: s.label,
    registered: it.enrolledCount,
    capacity: it.capacity,
    occupancyPct,
  };
}

export async function getActivities(): Promise<Activity[] | null> {
  try {
    const { items } = await apiGet('/api/v2/activities', ActivitiesListResponseSchema);
    return items.map(toActivity);
  } catch {
    return null;
  }
}
