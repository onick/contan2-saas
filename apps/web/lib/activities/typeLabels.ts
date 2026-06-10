// apps/web/lib/activities/typeLabels.ts · label visible de cada tipo de
// actividad (enum de contracts). ÚNICA fuente: lo usan los formularios (selects)
// y el mapper del listado (cuando una actividad no tiene categoría, el chip cae
// al TIPO — antes caía a 'Otro' y un Concierto sin categoría se mostraba mal).
import type { ActivityType } from '@contan2/contracts';

export const TYPE_LABELS: Record<ActivityType, string> = {
  exposicion: 'Exposición', concierto: 'Concierto', cine: 'Cine', taller: 'Taller',
  teatro: 'Teatro', conferencia: 'Conferencia', otro: 'Otro',
};

// Tolerante a tipos fuera del enum (datos legacy): capitaliza como fallback.
export function typeLabel(type: string | null | undefined): string {
  if (!type) return 'Otro';
  return TYPE_LABELS[type as ActivityType] ?? type.charAt(0).toUpperCase() + type.slice(1);
}
