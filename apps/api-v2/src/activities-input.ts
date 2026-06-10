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

import type { ActivityCreateRequest, ActivityUpdateRequest, ActivityDetail } from '@contan2/contracts';

// Columnas a proyectar con RETURNING para construir un ActivityDetail (create +
// cover comparten esta proyección + el mapper de abajo).
export const ACTIVITY_DETAIL_COLUMNS = [
  'id', 'name', 'type', 'location', 'date', 'end_date', 'capacity',
  'enrolled_count', 'status', 'description', 'image_url', 'image_pos_y', 'category',
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
  image_pos_y: number | null;
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
    imagePosY: r.image_pos_y,
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

// SET parcial (snake_case) para el UPDATE de edición: SÓLO las claves enviadas,
// normalizadas igual que el create. `endDate`/`category` null → limpian el valor.
// `updated_at` y la guarda de capacidad las pone el route (no acá).
export interface ActivityUpdateSet {
  name?: string;
  type?: string;
  location?: string;
  date?: string;
  end_date?: string | null;
  capacity?: number;
  description?: string;
  category?: string | null;
  image_pos_y?: number | null;
}

export function normalizeActivityUpdate(data: ActivityUpdateRequest): ActivityUpdateSet {
  const set: ActivityUpdateSet = {};
  if (data.name !== undefined) set.name = data.name.trim();
  if (data.type !== undefined) set.type = data.type;
  if (data.location !== undefined) set.location = data.location.trim();
  if (data.date !== undefined) set.date = new Date(data.date).toISOString();
  if (data.endDate !== undefined) set.end_date = data.endDate ? new Date(data.endDate).toISOString() : null;
  if (data.capacity !== undefined) set.capacity = data.capacity;
  if (data.description !== undefined) set.description = data.description.trim();
  if (data.category !== undefined) {
    const c = data.category?.trim();
    set.category = c ? c.toLowerCase().replace(/\s+/g, ' ') : null;
  }
  if (data.imagePosY !== undefined) set.image_pos_y = data.imagePosY; // null = centro
  return set;
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
