// apps/api-v2/src/routes/scanner.ts · auth del scanner v2 (gate por PIN de staff).
// Tenant por host. Verifica el PIN del tenant (organizations.staff_pin_hash,
// bcrypt · mismo hash que v1) y emite una cookie de sesión firmada stateless.
// NO toca el endpoint de check-in (que sigue público): esto solo gatea la
// página /scanner. Rate-limited (anti fuerza bruta del PIN).

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { getDb, type DbClient } from '@contan2/db';
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

async function resolveOrg(db: DbClient, req: FastifyRequest) {
  const tenant = await resolveTenantFromHost(db, effectiveHost(req));
  if (tenant.ok) return { ok: true as const, orgId: tenant.org.id, slug: tenant.org.slug };
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
    const sess = verifyScannerSession(req.cookies?.[SCANNER_COOKIE]);
    if (!sess || sess.orgId !== t.orgId) {
      reply.code(401);
      return { error: 'Scanner no autenticado.' };
    }
    return { ok: true, orgSlug: t.slug };
  });

  // POST /api/v2/scanner/logout · limpia la cookie (mismos atributos que al setear).
  app.post('/scanner/logout', async (_req, reply) => {
    reply.clearCookie(SCANNER_COOKIE, baseCookieOptions());
    return { ok: true };
  });
};
