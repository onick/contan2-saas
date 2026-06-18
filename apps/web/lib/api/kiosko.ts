// apps/web/lib/api/kiosko.ts · fetchers/mappers read-only del kiosko.
// Mapea el slice PÚBLICO de api-v2 (#15) a las formas que ya consume la máquina
// de estados del kiosko (KioskActivity / KioskVisitor). Server-only (apiGet usa
// next/headers). Si el fetch falla, el server wrapper cae a demoData → el
// kiosko nunca queda en blanco. Cero escrituras.

import {
  PublicActivitiesResponseSchema,
  PublicBrandingResponseSchema,
  PublicVisitorLookupResponseSchema,
  type PublicActivity,
  type PublicBrandingResponse,
  type PublicVisitor,
} from '@contan2/contracts';
import { apiGet, ApiError } from './client';
import { forwardingHeaders } from './forwarded';
import type { KioskActivity, KioskVisitor } from '../kiosko/demoData';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

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
    imagePosY: a.imagePosY,
    audience: a.audience,
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

// Branding público del tenant (por host, sin cookie). null si falla → la página
// cae al branding local. El kiosko usa el logo VERTICAL (verticalLogoUrl) y, si
// no hay, el horizontal.
export async function getPublicBranding(): Promise<PublicBrandingResponse['organization'] | null> {
  try {
    const { organization } = await apiGet('/api/v2/public/branding', PublicBrandingResponseSchema);
    return organization;
  } catch {
    return null;
  }
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

// Proxy server-side del check-in público (ESCRITURA). El cliente del kiosko lo
// llama same-origin (POST /kiosko/checkin); acá se reenvía a api-v2 con el host
// del tenant (x-forwarded-host) y se relaya status + body tal cual, para que el
// cliente mapee éxito/cupo/duplicado/no-encontrado. api-v2 es el árbitro (cupo
// atómico, idempotencia); este proxy NO valida ni transforma.
export async function proxyKioskCheckin(body: unknown): Promise<Response> {
  // host del tenant + IP real del cliente (x-forwarded-for) → ver forwarded.ts.
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/public/checkin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await forwardingHeaders()),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos completar el registro. Intentá de nuevo.' }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

// Lookup de visitante por código/email/NOMBRE. Resultado:
//   { visitor }            → un único hallado;
//   { matches }            → homónimos por nombre (2..5) para elegir;
//   { needsFullName, hint }→ entrada incompleta (400: falta apellido, etc.) —
//                            la UI guía SIN ofrecer "registrarme como nuevo"
//                            (evita duplicados por nombre a medias);
//   null                   → no encontrado (404).
// Re-lanza el resto (429/5xx/red) para que el route handler responda 502.
export type KioskLookupOutcome =
  | { visitor: KioskVisitor }
  | { matches: KioskVisitor[] }
  | { needsFullName: true; hint: string };

export async function lookupKioskVisitor(q: string): Promise<KioskLookupOutcome | null> {
  try {
    const out = await apiGet(
      `/api/v2/public/users/lookup?q=${encodeURIComponent(q)}`,
      PublicVisitorLookupResponseSchema,
    );
    if ('visitor' in out) return { visitor: toKioskVisitor(out.visitor) };
    return { matches: out.matches.map(toKioskVisitor) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      return { needsFullName: true, hint: e.message || 'Escribe tu nombre y apellido.' };
    }
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
