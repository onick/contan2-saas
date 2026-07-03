import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb } from '@contan2/db';
import type { OrgBrandingResponse, BrandingLogoUploadResponse } from '@contan2/contracts';
import { AdminBrandingUpdateRequestSchema } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { hashIp, maskEmail } from '../services/audit-mask.js';
import { ensureWritableRoot, writeLogoAtomic } from '../storage.js';
import { processLogo, MAX_LOGO_BYTES, CoverError } from '../services/cover-upload.js';

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
    const guard = await requireTenantStaff(db, req, { allowTrialEnded: true });
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
        credentialLogoUrl: org.credentialLogoUrl,
        logoScale: org.logoScale,
        primaryColor: org.primaryColor,
        secondaryColor: org.secondaryColor,
        sidebarTheme: org.sidebarStyle,
        status: org.status,
        plan: org.plan,
        trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
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
    if (p.credentialLogoUrl !== undefined) set.credential_logo_url = p.credentialLogoUrl;
    if (p.logoScale !== undefined) set.logo_scale = p.logoScale;

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
        .select(['id', 'slug', 'name', 'logo_url', 'email_logo_url', 'credential_logo_url', 'logo_scale', 'primary_color', 'secondary_color', 'sidebar_style', 'status', 'plan', 'trial_ends_at'])
        .where('id', '=', org.id)
        .executeTakeFirstOrThrow();
    });

    // invalidateTenantCache(updated.slug) — no-op hasta que tenant.ts cachee.

    let status = updated.status;
    if (
      status === 'active' &&
      updated.plan === 'free' &&
      updated.trial_ends_at &&
      new Date() > new Date(updated.trial_ends_at)
    ) {
      status = 'trial_ended';
    }

    const body: OrgBrandingResponse = {
      organization: {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        logoUrl: updated.logo_url,
        emailLogoUrl: updated.email_logo_url,
        credentialLogoUrl: updated.credential_logo_url,
        logoScale: updated.logo_scale,
        primaryColor: updated.primary_color,
        secondaryColor: updated.secondary_color,
        sidebarTheme: updated.sidebar_style,
        status,
        plan: updated.plan,
        trialEndsAt: updated.trial_ends_at ? new Date(updated.trial_ends_at).toISOString() : null,
      },
    };
    return body;
  });

  // POST /api/v2/org/branding/logo · sube el logo del tenant. owner/admin,
  // multipart (un archivo, ≤2MB). Valida por MAGIC BYTES + decode (sharp),
  // normaliza a PNG (preserva transparencia) en /uploads y devuelve la ruta.
  // NO persiste logo_url: el editor lo pone en el form y "Guardar" lo guarda.
  app.post('/org/branding/logo', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    if (!CAN_EDIT_BRANDING.has(staff.role)) { reply.code(403); return { error: 'No tenés permiso para editar la identidad.' }; }
    if ((await writeLimiter.hit(`${org.id}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas operaciones seguidas. Espera un momento.' }; }

    // Multipart: exactamente un archivo (igual patrón que la portada).
    let buf: Buffer | undefined;
    let fileCount = 0, oversize = false, parseErr = false;
    try {
      for await (const part of req.parts()) {
        if (part.type !== 'file') continue;
        fileCount += 1;
        if (fileCount > 1) break;
        buf = await part.toBuffer();
        if (part.file.truncated) oversize = true;
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') oversize = true;
      else parseErr = true;
    }
    if (parseErr) { reply.code(400); return { error: 'Carga de archivo inválida.' }; }
    if (fileCount > 1) { reply.code(400); return { error: 'Subí exactamente un archivo.' }; }
    if (oversize || (buf && buf.length > MAX_LOGO_BYTES)) { reply.code(413); return { error: 'El logo supera el máximo de 2 MB.' }; }
    if (fileCount === 0 || !buf) { reply.code(400); return { error: 'Se requiere un archivo de logo.' }; }

    let png: Buffer;
    try {
      png = await processLogo(buf);
    } catch (e) {
      reply.code(e instanceof CoverError && e.code === 'unsupported_type' ? 415 : 400);
      return { error: e instanceof Error ? e.message : 'Imagen inválida.' };
    }

    let root: string;
    try { root = await ensureWritableRoot(); }
    catch (e) { req.log.error({ err: e }, 'uploads dir no escribible (logo)'); reply.code(500); return { error: 'Almacenamiento de logos no disponible.' }; }

    let name: string;
    try { name = await writeLogoAtomic(root, png); }
    catch (e) { req.log.error({ err: e }, 'logo: fallo al escribir'); reply.code(500); return { error: 'No se pudo guardar el logo.' }; }

    req.log.info({ org: org.id, name }, 'logo de identidad subido');
    reply.code(201);
    return { logoUrl: `/uploads/${name}` } satisfies BrandingLogoUploadResponse;
  });
};
