// apps/api-v2/src/activities-input.ts · normalización del input de creación de
// actividad, puro y testeable. La VALIDACIÓN vive en el contrato Zod
// (ActivityCreateRequestSchema, @contan2/contracts); acá sólo se normaliza el
// dato ya validado antes del INSERT, con paridad v1 (normalizeActivityData):
//   · name/location: trim
//   · date/endDate: ISO 8601 canónico
//   · category: lowercase + colapsa espacios (vacío → null)
//   · description: trim, default '' (la columna es NOT NULL DEFAULT '')
// status e image_url NO se tocan acá: el route fija status='activa' e
// image_url=null (decisiones de producto), nunca desde el body.

import type { ActivityCreateRequest } from '@contan2/contracts';

export interface NormalizedActivityInput {
  name: string;
  type: string;
  location: string;
  date: string;
  endDate: string | null;
  capacity: number;
  description: string;
  category: string | null;
}

export function normalizeActivityInput(data: ActivityCreateRequest): NormalizedActivityInput {
  const rawCategory = data.category?.trim();
  const category = rawCategory ? rawCategory.toLowerCase().replace(/\s+/g, ' ') : null;
  return {
    name: data.name.trim(),
    type: data.type,
    location: data.location.trim(),
    date: new Date(data.date).toISOString(),
    endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
    capacity: data.capacity,
    description: data.description?.trim() ?? '',
    category,
  };
}
