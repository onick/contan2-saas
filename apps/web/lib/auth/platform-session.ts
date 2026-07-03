// apps/web/lib/auth/platform-session.ts · gate server-side del PLATFORM ADMIN.
// Valida la cookie contan2_admin_session contra api-v2 (/platform/auth/me).
// Espejo de getAdminGate() pero para el super-admin. NUNCA cae a datos demo.

import { cache } from 'react';
import { cookies } from 'next/headers';
import { PlatformMeResponseSchema, type PlatformAdminPublic } from '@contan2/contracts';
import { forwardingHeaders } from '../api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const ADMIN_COOKIE = 'contan2_admin_session';

export type PlatformGate =
  | { status: 'ok'; admin: PlatformAdminPublic }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export async function resolvePlatformGate(): Promise<PlatformGate> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return { status: 'unauthenticated' };
  const headers = { cookie: `${ADMIN_COOKIE}=${token}`, ...(await forwardingHeaders()) };
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v2/platform/auth/me`, { headers, cache: 'no-store' });
  } catch {
    return { status: 'unavailable' };
  }
  if (res.status === 401) return { status: 'unauthenticated' };
  if (!res.ok) return { status: 'unavailable' };
  try {
    const { admin } = PlatformMeResponseSchema.parse(await res.json());
    return { status: 'ok', admin };
  } catch {
    return { status: 'unavailable' };
  }
}

export const getPlatformGate = cache(resolvePlatformGate);
