// apps/web/lib/api/platform-data.ts · fetchers server-side del panel de
// plataforma. GET autenticado con la cookie de admin. null si api-v2 falla
// (la UI muestra estado de indisponibilidad, nunca datos demo).

import { cookies } from 'next/headers';
import {
  PlatformKpisResponseSchema, type PlatformKpisResponse,
  PlatformTenantsResponseSchema, type PlatformTenantsResponse,
  PlatformTenantDetailResponseSchema, type PlatformTenantDetailResponse,
  PlatformAuditResponseSchema, type PlatformAuditResponse,
} from '@contan2/contracts';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const ADMIN_COOKIE = 'contan2_admin_session';

async function platformGet(path: string): Promise<unknown | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const headers = { cookie: `${ADMIN_COOKIE}=${token}`, ...(await forwardingHeaders()) };
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getPlatformKpis(): Promise<PlatformKpisResponse | null> {
  const data = await platformGet('/api/v2/platform/kpis');
  if (!data) return null;
  try { return PlatformKpisResponseSchema.parse(data); } catch { return null; }
}

export interface TenantsQuery { q?: string; status?: string; plan?: string }

export async function getPlatformTenants(params: TenantsQuery = {}): Promise<PlatformTenantsResponse | null> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.plan) qs.set('plan', params.plan);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await platformGet(`/api/v2/platform/tenants${suffix}`);
  if (!data) return null;
  try { return PlatformTenantsResponseSchema.parse(data); } catch { return null; }
}

export interface AuditQuery { tenant?: string; action?: string; since?: string; until?: string; cursor?: string }

export async function getPlatformAudit(params: AuditQuery = {}): Promise<PlatformAuditResponse | null> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) { if (v) qs.set(k, v); }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await platformGet(`/api/v2/platform/audit-log${suffix}`);
  if (!data) return null;
  try { return PlatformAuditResponseSchema.parse(data); } catch { return null; }
}

export async function getPlatformTenantDetail(id: string): Promise<PlatformTenantDetailResponse | null | 'not-found'> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const headers = { cookie: `${ADMIN_COOKIE}=${token}`, ...(await forwardingHeaders()) };
  try {
    const res = await fetch(`${API_BASE_URL}/api/v2/platform/tenants/${encodeURIComponent(id)}`, { headers, cache: 'no-store' });
    if (res.status === 404) return 'not-found';
    if (!res.ok) return null;
    return PlatformTenantDetailResponseSchema.parse(await res.json());
  } catch {
    return null;
  }
}
