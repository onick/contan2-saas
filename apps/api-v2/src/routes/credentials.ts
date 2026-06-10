// apps/api-v2/src/routes/credentials.ts · PNG público de la credencial (S1 ·
// paridad v1 GET /api/credentials/:code.png + CONTINUIDAD: los emails ya enviados
// por v1 enlazan esta ruta — server.ts registra este plugin BAJO /api/v2 y TAMBIÉN
// bajo /api (legacy) para que ningún link viejo se rompa tras el cutover.
//
// Política (idéntica a v1, ver authorization-matrix):
//   - PÚBLICO bearer-style: el código actúa como token portador (sin auth; el
//     visitante descarga su credencial desde el link del email).
//   - El PNG contiene solo nombre + código + QR + branding (sin email → PII mínima
//     si el link se reenvía).
//   - Regex estricta del código (brute-force inviable) + rate-limit 60/min por IP
//     (corta enumeración por timing). 404 indistinguible para no-existe/archivado.
//   - Tenant por host (resolveTenantFromHost), igual que /public/*.

import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import { resolveTenantFromHost, effectiveHost } from '../tenant.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { generateCredentialPng, loadLogoDataUri } from '../services/credential.js';
import type { OrgBranding } from '../services/branding-tokens.js';

const FILE_RE = /^([A-Z]{2,6}-[A-Z0-9]{6})\.png$/i;
const pngLimiter = createRateLimiter({ max: 60, windowMs: 60_000, prefix: endpointPrefix('credential-png') });

export const credentialsRoute: FastifyPluginAsync = async (app) => {
  app.get('/credentials/:file', async (req, reply) => {
    const db = getDb();
    const tenant = await resolveTenantFromHost(db, effectiveHost(req));
    if (!tenant.ok) {
      reply.code(tenant.reason === 'suspended' ? 503 : 404);
      return { error: tenant.reason === 'suspended' ? 'Organización suspendida' : 'No encontrado' };
    }
    if ((await pngLimiter.hit(`${tenant.org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiadas descargas. Intentá en un momento.' };
    }

    const m = FILE_RE.exec(String((req.params as { file: string }).file ?? ''));
    if (!m) {
      reply.code(400);
      return { error: 'Formato de código inválido' };
    }
    const code = m[1]!.toUpperCase();

    const user = await db
      .selectFrom('users')
      .select(['id', 'code', 'first_name', 'last_name'])
      .where('organization_id', '=', tenant.org.id)
      .where('code', '=', code)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user) {
      reply.code(404);
      return { error: 'No encontrado' };
    }

    const branding: OrgBranding = {
      name: tenant.org.name,
      primaryColor: tenant.org.primaryColor,
      secondaryColor: tenant.org.secondaryColor,
    };
    const logo = await loadLogoDataUri(tenant.org.logoUrl ?? tenant.org.emailLogoUrl ?? null);
    const png = await generateCredentialPng(
      { code: user.code, firstName: user.first_name, lastName: user.last_name },
      branding,
      logo,
    );

    reply.header('content-type', 'image/png');
    reply.header('cache-control', 'public, max-age=300');
    reply.header('content-disposition', `inline; filename="credencial-${code}.png"`);
    reply.header('x-content-type-options', 'nosniff');
    return reply.send(png);
  });
};
