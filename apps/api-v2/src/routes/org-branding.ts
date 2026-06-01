import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import type { OrgBrandingResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';

// GET /api/v2/org/branding · primer endpoint tenant-aware read-only.
// El orden de checks (tenant antes que auth, cross-tenant 403) vive en
// requireTenantStaff (guard.ts), compartido con los endpoints de negocio.
export const orgBrandingRoute: FastifyPluginAsync = async (app) => {
  app.get('/org/branding', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const { org } = guard.ctx;

    const body: OrgBrandingResponse = {
      organization: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        logoUrl: org.logoUrl,
        emailLogoUrl: org.emailLogoUrl,
        primaryColor: org.primaryColor,
        secondaryColor: org.secondaryColor,
        sidebarTheme: org.sidebarStyle,
        status: org.status,
      },
    };
    return body;
  });
};
