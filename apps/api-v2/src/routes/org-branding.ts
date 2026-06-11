import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import type { OrgBrandingResponse } from '@contan2/contracts';
import { AdminBrandingUpdateRequestSchema } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { hashIp, maskEmail } from '../services/audit-mask.js';

const CAN_EDIT_BRANDING = new Set(['owner', 'admin']);

// GET /api/v2/org/branding · primer endpoint tenant-aware read-only.
// PATCH /api/v2/org/branding · edición de identidad (F5): nombre/logo/colores/sidebar.
// El orden de checks (tenant antes que auth, cross-tenant 403) vive en
// requireTenantStaff (guard.ts), compartido con los endpoints de negocio.
// 20 escrituras/min por org+IP (auditoría 2026-06-10: faltaba limiter).
const writeLimiter = createRateLimiter({ max: 20, windowMs: 60_000, prefix: endpointPrefix('branding-write') });

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

  // PATCH · owner/admin. Solo campos permitidos (validados por zod, sin CSS/HTML
  // arbitrario). Auditoría sin PII (nombres de campos). Tras actualizar, invalidar
  // la cache de tenant (HOY no-op: tenant.ts aún no cachea — el hook queda listo
  // para cuando llegue la cache, sin depender de Redis).
  app.patch('/org/branding', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    if (!CAN_EDIT_BRANDING.has(staff.role)) { reply.code(403); return { error: 'No tenés permiso para editar la identidad.' }; }
    if ((await writeLimiter.hit(`${org.id}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas operaciones seguidas. Espera un momento.' }; }

    const parsed = AdminBrandingUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos de identidad inválidos.' }; }
    const p = parsed.data;
    const fields = Object.keys(p);
    if (fields.length === 0) { reply.code(400); return { error: 'No hay cambios para guardar.' }; }

    // Map a columnas (solo las presentes en el patch).
    const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (p.name !== undefined) set.name = p.name;
    if (p.primaryColor !== undefined) set.primary_color = p.primaryColor;
    if (p.secondaryColor !== undefined) set.secondary_color = p.secondaryColor;
    if (p.sidebarTheme !== undefined) set.sidebar_style = p.sidebarTheme;
    if (p.logoUrl !== undefined) set.logo_url = p.logoUrl;

    const updated = await db.transaction().execute(async (tx) => {
      await tx.updateTable('organizations').set(set).where('id', '=', org.id).execute();
      await tx.insertInto('tenant_audit_log').values({
        organization_id: org.id,
        actor_staff_id: staff.id,
        actor_email_masked: maskEmail(staff.email),
        actor_role: staff.role,
        action: 'branding.updated',
        target_type: 'branding',
        target_id: org.id,
        target_label: null,
        metadata: JSON.stringify({ fields }),
        ip_hash: hashIp(req.ip),
        ua: req.headers['user-agent'] ?? null,
      }).execute();
      return tx
        .selectFrom('organizations')
        .select(['id', 'slug', 'name', 'logo_url', 'email_logo_url', 'primary_color', 'secondary_color', 'sidebar_style', 'status'])
        .where('id', '=', org.id)
        .executeTakeFirstOrThrow();
    });

    // invalidateTenantCache(updated.slug) — no-op hasta que tenant.ts cachee.

    const body: OrgBrandingResponse = {
      organization: {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        logoUrl: updated.logo_url,
        emailLogoUrl: updated.email_logo_url,
        primaryColor: updated.primary_color,
        secondaryColor: updated.secondary_color,
        sidebarTheme: updated.sidebar_style,
        status: updated.status,
      },
    };
    return body;
  });
};
