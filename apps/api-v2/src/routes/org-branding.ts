import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import { resolveStaffSession } from '@contan2/auth';
import type { OrgBrandingResponse } from '@contan2/contracts';
import { resolveTenantFromHost } from '../tenant.js';

// GET /api/v2/org/branding · primer endpoint tenant-aware read-only.
// Orden de checks (igual que v1: tenant antes que auth):
//   host no-tenant / inexistente → 404 (suspended → 503)
//   sin cookie / inválida        → 401
//   staff de otra org            → 403
//   ok                           → 200 { organization }
const SESSION_COOKIE = 'contan2_session';

export const orgBrandingRoute: FastifyPluginAsync = async (app) => {
  app.get('/org/branding', async (req, reply) => {
    const db = getDb();

    // 1. Tenant por host.
    const tenant = await resolveTenantFromHost(db, req.headers.host);
    if (!tenant.ok) {
      if (tenant.reason === 'suspended') {
        reply.code(503);
        return { error: 'Organización suspendida' };
      }
      reply.code(404);
      return { error: 'Organización no encontrada' };
    }

    // 2. Sesión staff (cookie compartida con v1).
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      reply.code(401);
      return { error: 'No autenticado' };
    }
    const resolved = await resolveStaffSession(db, token);
    if (!resolved) {
      reply.code(401);
      return { error: 'Sesión expirada o inválida' };
    }

    // 3. Cross-tenant: la sesión debe ser de ESTE tenant.
    if (resolved.staff.organizationId !== tenant.org.id) {
      reply.code(403);
      return { error: 'Sesión de otra organización' };
    }

    // 4. Branding.
    const body: OrgBrandingResponse = {
      organization: {
        id: tenant.org.id,
        slug: tenant.org.slug,
        name: tenant.org.name,
        logoUrl: tenant.org.logoUrl,
        emailLogoUrl: tenant.org.emailLogoUrl,
        primaryColor: tenant.org.primaryColor,
        secondaryColor: tenant.org.secondaryColor,
        sidebarTheme: tenant.org.sidebarStyle,
        status: tenant.org.status,
      },
    };
    return body;
  });
};
