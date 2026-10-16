// apps/api-v2/src/routes/scanner.ts · auth del scanner v2 (gate por PIN de staff).
// Tenant por host. Verifica el PIN del tenant (organizations.staff_pin_hash,
// bcrypt · mismo hash que v1) y emite una cookie de sesión firmada stateless.
// NO toca el endpoint de check-in (que sigue público): esto solo gatea la
// página /scanner. Rate-limited (anti fuerza bruta del PIN).

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { getDb, sql, withTenant, type DbClient } from '@contan2/db';
import { resolveTenantFromHost, effectiveHost } from '../tenant.js';
import { baseCookieOptions } from '../cookies.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import {
  signScannerSession, verifyScannerSession, SCANNER_COOKIE, SCANNER_TTL_MS,
} from '../scanner-auth.js';

// PIN: 4-8 dígitos (paridad con v1 · staffPin.js).
const PIN_RE = /^\d{4,8}$/;

// Rate-limit del PIN: 8 / 60s. Backend Redis (compartido entre réplicas) si hay
// REDIS_URL, in-memory si no (con degradación grácil si Redis cae). Aislado por
// entorno + tenant + endpoint; la key es `${orgId}:${ip}` (sin PIN ni PII).
const pinLimiter = createRateLimiter({ max: 8, windowMs: 60_000, prefix: endpointPrefix('scanner-pin') });

// Revocación server-side del token del scanner (Q8-59). La cookie es firmada y
// sin estado, así que "Salir" solo la borraba del navegador y el token copiado
// seguía sirviendo hasta su vencimiento (8 h). Sin migración: se guarda el
// SHA-256 del token en `checkin_idempotency` (endpoint 'scanner-revoked',
// PK org+endpoint+key) con `expires_at` = el vencimiento del propio token, así
// la fila solo vive mientras el token podría ser válido y el job de limpieza de
// esa tabla (services/checkin-idempotency.ts) la purga sola. `attendance_id`
// (NOT NULL) lleva un valor fijo: acá no hay asistencia.
const REVOKED_ENDPOINT = 'scanner-revoked';
const tokenKey = (cookie: string) => createHash('sha256').update(cookie).digest('hex');

async function isScannerTokenRevoked(db: DbClient, orgId: string, cookie: string): Promise<boolean> {
  const row = await withTenant(db, orgId, (tx) => tx.selectFrom('checkin_idempotency')
    .select('idempotency_key')
    .where('organization_id', '=', orgId)
    .where('endpoint', '=', REVOKED_ENDPOINT)
    .where('idempotency_key', '=', tokenKey(cookie))
    .where(sql<boolean>`expires_at > now()`)
    .executeTakeFirst());
  return !!row;
}

async function revokeScannerToken(db: DbClient, orgId: string, cookie: string, expMs: number): Promise<void> {
  await withTenant(db, orgId, (tx) => tx.insertInto('checkin_idempotency')
    .values({
      organization_id: orgId,
      endpoint: REVOKED_ENDPOINT,
      idempotency_key: tokenKey(cookie),
      attendance_id: 'revoked',
      expires_at: new Date(expMs).toISOString(),
    })
    .onConflict((oc) => oc.columns(['organization_id', 'endpoint', 'idempotency_key']).doNothing())
    .execute());
}

async function resolveOrg(db: DbClient, req: FastifyRequest) {
  const tenant = await resolveTenantFromHost(db, effectiveHost(req));
  if (tenant.ok) {
    if (tenant.org.status === 'trial_ended') {
      return { ok: false as const, status: 402, error: 'Período de prueba terminado' };
    }
    return { ok: true as const, orgId: tenant.org.id, slug: tenant.org.slug };
  }
  return tenant.reason === 'suspended'
    ? { ok: false as const, status: 503, error: 'Organización suspendida' }
    : { ok: false as const, status: 404, error: 'Organización no encontrada' };
}

export const scannerRoute: FastifyPluginAsync = async (app) => {
  // POST /api/v2/scanner/pin · valida el PIN del tenant y emite la cookie.
  app.post('/scanner/pin', async (req, reply) => {
    const db = getDb();
    const t = await resolveOrg(db, req);
    if (!t.ok) { reply.code(t.status); return { error: t.error }; }

    if ((await pinLimiter.hit(`${t.orgId}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiados intentos. Espera un momento e intenta de nuevo.' };
    }

    const pin = String((req.body as Record<string, unknown> | null)?.pin ?? '');
    if (!PIN_RE.test(pin)) {
      reply.code(400);
      return { error: 'PIN inválido (4 a 8 dígitos).' };
    }

    const row = await db.selectFrom('organizations').select('staff_pin_hash')
      .where('id', '=', t.orgId).executeTakeFirst();
    if (!row?.staff_pin_hash) {
      reply.code(403);
      return { error: 'El scanner no está configurado para este tenant.' };
    }
    if (!(await bcrypt.compare(pin, row.staff_pin_hash))) {
      reply.code(401);
      return { error: 'PIN incorrecto.' };
    }

    reply.setCookie(SCANNER_COOKIE, signScannerSession(t.orgId), {
      ...baseCookieOptions(),
      maxAge: Math.floor(SCANNER_TTL_MS / 1000),
    });
    return { ok: true };
  });

  // GET /api/v2/scanner/me · valida la cookie (gate de la página). La sesión debe
  // ser del MISMO tenant del host (una cookie de ccb no sirve en test-tenant).
  app.get('/scanner/me', async (req, reply) => {
    const db = getDb();
    const t = await resolveOrg(db, req);
    if (!t.ok) { reply.code(t.status); return { error: t.error }; }
    const cookie = req.cookies?.[SCANNER_COOKIE];
    const sess = verifyScannerSession(cookie);
    if (!sess || sess.orgId !== t.orgId || (await isScannerTokenRevoked(db, t.orgId, cookie as string))) {
      reply.code(401);
      return { error: 'Scanner no autenticado.' };
    }
    return { ok: true, orgSlug: t.slug };
  });

  // POST /api/v2/scanner/logout · REVOCA el token en el servidor (si la cookie
  // es válida y del tenant del host) y limpia la cookie (mismos atributos que
  // al setear). Idempotente: sin cookie o inválida solo limpia.
  app.post('/scanner/logout', async (req, reply) => {
    const cookie = req.cookies?.[SCANNER_COOKIE];
    const sess = verifyScannerSession(cookie);
    if (sess && cookie) {
      const db = getDb();
      const t = await resolveOrg(db, req);
      if (t.ok && t.orgId === sess.orgId) await revokeScannerToken(db, sess.orgId, cookie, sess.exp);
    }
    reply.clearCookie(SCANNER_COOKIE, baseCookieOptions());
    return { ok: true };
  });
};
