// apps/web/lib/auth/session.ts · gate server-side del admin v2 (/app/*).
//
// Autorización REAL contra api-v2 (no por mera presencia de cookie):
//   · /auth/me     → identidad del staff (sesión válida).
//   · /org/branding→ usa requireTenantStaff (401 sin sesión, 403 cross-tenant,
//     404 host desconocido) → resuelve auth + tenant en una sola llamada.
// Devuelve un resultado discriminado; el layout decide redirect vs indisponible.
// NUNCA cae a datos demo: si api-v2 no responde → 'unavailable'.

import { cache } from 'react';
import { cookies } from 'next/headers';
import {
  StaffMeResponseSchema,
  OrgBrandingResponseSchema,
  type PublicStaff,
} from '@contan2/contracts';
import type { BrandingOrg } from '../branding/theme';
import { forwardingHeaders } from '../api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

export type AdminGate =
  | { status: 'ok'; staff: PublicStaff; branding: BrandingOrg }
  | { status: 'unauthenticated' } // sin cookie, inválida o expirada
  | { status: 'cross-tenant' } // sesión de otra organización (403)
  | { status: 'unknown-host' } // host sin tenant (404)
  | { status: 'unavailable' }; // api-v2 caído / 5xx → NUNCA demo

// Lógica pura (testeable sin el cache de React).
export async function resolveAdminGate(): Promise<AdminGate> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { status: 'unauthenticated' };

  const headers = { cookie: `${SESSION_COOKIE}=${token}`, ...(await forwardingHeaders()) };
  let meRes: Response;
  let brRes: Response;
  try {
    [meRes, brRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/v2/auth/me`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE_URL}/api/v2/org/branding`, { headers, cache: 'no-store' }),
    ]);
  } catch {
    return { status: 'unavailable' }; // api-v2 caído → indisponible, jamás demo
  }

  // El tenant + auth los decide org/branding (requireTenantStaff).
  if (brRes.status === 401 || meRes.status === 401) return { status: 'unauthenticated' };
  if (brRes.status === 403) return { status: 'cross-tenant' };
  if (brRes.status === 404) return { status: 'unknown-host' };
  if (!meRes.ok || !brRes.ok) return { status: 'unavailable' };

  try {
    const { staff } = StaffMeResponseSchema.parse(await meRes.json());
    const { organization } = OrgBrandingResponseSchema.parse(await brRes.json());
    return { status: 'ok', staff, branding: organization };
  } catch {
    return { status: 'unavailable' };
  }
}

// cache(): una sola resolución por request (layout + shell la comparten).
export const getAdminGate = cache(resolveAdminGate);

// `next` seguro para el redirect a /login. SOLO rutas relativas bajo /app.
// Rechaza: URLs absolutas, protocol-relative (//host), backslash, traversal
// (..) y cualquier cosa fuera de /app. Default '/app'.
export function sanitizeNext(raw: string | null | undefined): string {
  if (!raw) return '/app';
  let v: string;
  try {
    v = decodeURIComponent(raw);
  } catch {
    return '/app';
  }
  if (!v.startsWith('/')) return '/app'; // no es relativa
  if (v.startsWith('//') || v.startsWith('/\\')) return '/app'; // //host o /\host
  if (v.includes('..')) return '/app'; // traversal → escaparía de /app
  if (!/^\/app(\/|$|\?)/.test(v)) return '/app'; // fuera de /app
  return v;
}
