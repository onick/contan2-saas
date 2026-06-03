// apps/api-v2/src/scanner-auth.ts · sesión de scanner STATELESS (cookie firmada).
// Tras verificar el PIN del tenant, se emite una cookie `scanner_session` con
// `base64url(orgId|exp)` + HMAC-SHA256 (clave SCANNER_SECRET). El gate del
// scanner la valida sin tocar la DB (sin tabla de sesiones). El check-in en sí
// sigue siendo público; esto solo gatea la página del scanner.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SCANNER_COOKIE = 'scanner_session';
export const SCANNER_TTL_MS = 8 * 60 * 60 * 1000; // 8 h (un turno de puerta)

// SCANNER_SECRET se setea en staging/prod. En dev/tests cae a un default fijo
// (el scanner no protege prod hasta que se configure el secret real).
function secret(): string {
  return process.env.SCANNER_SECRET ?? 'dev-scanner-secret-change-me';
}

function hmac(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('hex');
}

/** Firma una sesión de scanner para `orgId`: `base64url(orgId|exp).hmac`. */
export function signScannerSession(orgId: string, now: number = Date.now()): string {
  const payloadB64 = Buffer.from(`${orgId}|${now + SCANNER_TTL_MS}`).toString('base64url');
  return `${payloadB64}.${hmac(payloadB64)}`;
}

/** Verifica firma + expiración; devuelve { orgId } o null. Timing-safe. */
export function verifyScannerSession(value: string | undefined, now: number = Date.now()): { orgId: string } | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = hmac(payloadB64);
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  let payload: string;
  try { payload = Buffer.from(payloadB64, 'base64url').toString(); } catch { return null; }
  const sep = payload.indexOf('|');
  if (sep <= 0) return null;
  const orgId = payload.slice(0, sep);
  const exp = Number(payload.slice(sep + 1));
  if (!orgId || !Number.isFinite(exp) || now >= exp) return null;
  return { orgId };
}
