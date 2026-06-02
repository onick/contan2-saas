// apps/web/lib/api/kiosko.ts · fetchers/mappers read-only del kiosko.
// Mapea el slice PÚBLICO de api-v2 (#15) a las formas que ya consume la máquina
// de estados del kiosko (KioskActivity / KioskVisitor). Server-only (apiGet usa
// next/headers). Si el fetch falla, el server wrapper cae a demoData → el
// kiosko nunca queda en blanco. Cero escrituras.

import {
  PublicActivitiesResponseSchema,
  PublicVisitorLookupResponseSchema,
  type PublicActivity,
  type PublicVisitor,
} from '@contan2/contracts';
import { apiGet, ApiError } from './client';
import type { KioskActivity, KioskVisitor } from '../kiosko/demoData';

// Hora local del tenant (es-DO, 12h). Ej: "7:00 p. m.".
const TIME_FMT = new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true });
// Día + mes corto para fechas que no son hoy/mañana. Ej: "12 jun".
const DAY_FMT = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short' });

// Medianoche local de una fecha (para comparar días sin que la hora interfiera).
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// ISO → label de display: "Hoy · 7:00 p. m." / "Mañana · 6:30 p. m." / "12 jun · 8:00 p. m.".
export function formatKioskDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  const prefix = dayDiff === 0 ? 'Hoy' : dayDiff === 1 ? 'Mañana' : DAY_FMT.format(d);
  return `${prefix} · ${TIME_FMT.format(d)}`;
}

// PublicActivity → KioskActivity. `category` cae a `type` (la columna category
// suele venir null; type trae 'Concierto'/'Cine' que el kiosko mapea a ícono).
export function toKioskActivity(a: PublicActivity): KioskActivity {
  return {
    id: a.id,
    name: a.name,
    category: a.category ?? a.type,
    date: formatKioskDate(a.date),
    location: a.location,
    capacity: a.capacity,
    enrolled: a.enrolledCount,
    imageUrl: a.imageUrl,
  };
}

// PublicVisitor → KioskVisitor. isNew=false (es un visitante hallado);
// companionsChildren lo setea el flujo (CompanionsControl) después.
export function toKioskVisitor(v: PublicVisitor): KioskVisitor {
  return {
    firstName: v.firstName,
    lastName: v.lastName,
    code: v.code,
    visitCount: v.visitCount,
    isNew: false,
    companionsChildren: 0,
  };
}

// Actividades públicas del tenant. null si falla (api caído / sin host / dev sin
// api) → el server wrapper cae a demoData con source='demo'.
export async function getKioskActivities(): Promise<KioskActivity[] | null> {
  try {
    const { activities } = await apiGet('/api/v2/public/activities', PublicActivitiesResponseSchema);
    return activities.map(toKioskActivity);
  } catch {
    return null;
  }
}

// Lookup de visitante por código/email. Devuelve el visitante, o null si "no
// encontrado" (404) o entrada inválida (400). Re-lanza el resto (429/5xx/red)
// para que el route handler responda 502 y el cliente muestre error (sin caer a
// demo: no se mezclan datos reales con demo).
export async function lookupKioskVisitor(q: string): Promise<KioskVisitor | null> {
  try {
    const { visitor } = await apiGet(
      `/api/v2/public/users/lookup?q=${encodeURIComponent(q)}`,
      PublicVisitorLookupResponseSchema,
    );
    return toKioskVisitor(visitor);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}
