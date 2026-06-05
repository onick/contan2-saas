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

import type { ActivityCreateRequest, ActivityDetail } from '@contan2/contracts';

// Columnas a proyectar con RETURNING para construir un ActivityDetail (create +
// cover comparten esta proyección + el mapper de abajo).
export const ACTIVITY_DETAIL_COLUMNS = [
  'id', 'name', 'type', 'location', 'date', 'end_date', 'capacity',
  'enrolled_count', 'status', 'description', 'image_url', 'category',
  'created_at', 'updated_at',
] as const;

// Fila tal como la devuelve Kysely al seleccionar ACTIVITY_DETAIL_COLUMNS.
export interface ActivityDetailRow {
  id: string;
  name: string;
  type: string;
  location: string;
  date: Date;
  end_date: Date | null;
  capacity: number;
  enrolled_count: number;
  status: ActivityDetail['status'];
  description: string;
  image_url: string | null;
  category: string | null;
  created_at: Date;
  updated_at: Date;
}

export function mapActivityDetailRow(r: ActivityDetailRow): ActivityDetail {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    location: r.location,
    date: r.date.toISOString(),
    endDate: r.end_date ? r.end_date.toISOString() : null,
    capacity: r.capacity,
    enrolledCount: r.enrolled_count,
    status: r.status,
    description: r.description,
    imageUrl: r.image_url,
    category: r.category,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

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
