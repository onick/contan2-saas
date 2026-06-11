// apps/api-v2/src/routes/credentials-bulk.ts · S1 · envío MASIVO de credenciales
// (paridad v1 POST /credentials/bulk-send): owner/admin; body {codes:[...]} (tope
// 1000, formato validado por código) o — conveniencia v2 — {cohort:'noCredential'}
// (todos los visitantes con email y credencial nunca enviada). Procesa SERIAL con
// throttle (default 150 ms, tope 2 s) para respetar el límite de Resend; devuelve
// summary + resultado por código. En dry-run (sin RESEND_API_KEY) reporta
// dryRun:true y NO marca credential_sent_at (igual que el envío individual).

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql } from '@contan2/db';
import { CODE_RE } from '@contan2/codes';
import { BulkCredentialsRequestSchema, type BulkCredentialsResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { deliverCredential } from '../services/credential-delivery.js';

const MANAGER_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);
// 2 lotes/min por org+IP: la operación ya es serial+throttled por dentro; esto
// evita disparar lotes en paralelo (auditoría 2026-06-10).
const bulkLimiter = createRateLimiter({ max: 2, windowMs: 60_000, prefix: endpointPrefix('credentials-bulk') });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ResultRow = BulkCredentialsResponse['results'][number];

export const credentialsBulkRoute: FastifyPluginAsync = async (app) => {
  app.post('/credentials/bulk-send', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403); return { error: 'No tenés permiso para envíos masivos.' };
    }
    const orgId = guard.ctx.org.id;
    if ((await bulkLimiter.hit(`${orgId}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Ya hay un lote reciente en curso. Espera un minuto.' };
    }

    const parsed = BulkCredentialsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400); return { error: 'Body inválido: { codes: [...] } o { cohort: "noCredential" }.' };
    }
    const throttleMs = parsed.data.throttleMs ?? 150;

    // Resolver la lista de códigos objetivo.
    let codes: string[];
    if ('cohort' in parsed.data) {
      const rows = await db.selectFrom('users').select('code')
        .where('organization_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .where(sql<boolean>`users.email is not null and users.credential_sent_at is null`)
        .orderBy('created_at', 'asc')
        .limit(1000)
        .execute();
      codes = rows.map((r) => r.code);
    } else {
      codes = parsed.data.codes.map((c) => c.toUpperCase());
    }

    const dryRun = !process.env.RESEND_API_KEY;
    const results: ResultRow[] = [];

    for (const code of codes) {
      if (!CODE_RE.test(code)) {
        results.push({ code, status: 'invalid-format' });
        continue;
      }
      const user = await db.selectFrom('users')
        .select(['id', 'code', 'email', 'first_name', 'last_name'])
        .where('organization_id', '=', orgId)
        .where('code', '=', code)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!user) {
        results.push({ code, status: 'not-found' });
        continue;
      }
      if (!user.email) {
        results.push({ code, status: 'skipped', reason: 'sin email' });
        continue;
      }
      try {
        const r = await deliverCredential(db, orgId, {
          id: user.id, code: user.code, email: user.email,
          firstName: user.first_name, lastName: user.last_name,
        });
        if ('sent' in r && r.sent === true) results.push({ code, status: 'sent' });
        else if ('skipped' in r && r.skipped && /RESEND/i.test(r.reason ?? '')) results.push({ code, status: 'dry-run' });
        else if ('skipped' in r && r.skipped) results.push({ code, status: 'skipped', reason: r.reason });
        else results.push({ code, status: 'error', reason: 'error' in r ? r.error : 'desconocido' });
      } catch (e) {
        results.push({ code, status: 'error', reason: e instanceof Error ? e.message : 'desconocido' });
      }
      if (throttleMs > 0 && codes.length > 1) await sleep(throttleMs);
    }

    const body: BulkCredentialsResponse = {
      summary: {
        total: codes.length,
        sent: results.filter((r) => r.status === 'sent' || r.status === 'dry-run').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        failed: results.filter((r) => r.status === 'error' || r.status === 'not-found' || r.status === 'invalid-format').length,
        dryRun,
      },
      results,
    };
    return body;
  });
};
