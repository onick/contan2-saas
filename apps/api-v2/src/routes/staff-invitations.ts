// apps/api-v2/src/routes/staff-invitations.ts · invitaciones de equipo (S1,
// paridad v1 staffManagement.js + auth.js):
//   GET    /staff/invitations            · lista del tenant (owner/admin)
//   POST   /staff/invitations            · invitar (owner/admin; invitar OWNER
//          sólo lo puede un owner; staff existente → 409; una pendiente para el
//          mismo email se REVOCA y se reemplaza). Token one-shot TTL 24 h;
//          entrega dry-run (token jamás logueado).
//   POST   /staff/invitations/:id/resend · regenera token + TTL (pending only)
//   POST   /staff/invitations/:id/revoke · revoca (pending only)
//   GET    /auth/invitation/:token       · PÚBLICO · preview (org+email+rol)
//   POST   /auth/accept-invitation       · PÚBLICO · crea la cuenta de staff
//          (fortaleza v1, hash argon2id cross-compatible) y marca aceptada.

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import {
  StaffInviteCreateRequestSchema,
  AcceptInvitationRequestSchema,
  type StaffInvitationsListResponse,
  type StaffInvitation,
  type InvitationPreviewResponse,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { resolveTenantFromHost, effectiveHost } from '../tenant.js';
import { sendStaffInviteEmail } from '../services/staff-invite-email.js';
import type { OrgBranding } from '../services/branding-tokens.js';
import { hashStaffPassword } from '../services/password.js';
import { validatePasswordStrength } from '../services/password-policy.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h (paridad v1)
const MANAGER_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);

const inviteLimiter = createRateLimiter({ max: 20, windowMs: 60 * 60 * 1000, prefix: endpointPrefix('staff-invite') });
const acceptLimiter = createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000, prefix: endpointPrefix('invite-accept') });

const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  return at <= 0 ? '***' : `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
};

interface InvRow {
  id: string; email: string; full_name: string | null; role: string;
  status: string; expires_at: Date; created_at: Date;
}
const toPublic = (r: InvRow): StaffInvitation => ({
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  role: r.role as StaffInvitation['role'],
  // Una pendiente ya vencida se REPORTA como expirada (sin job de barrido).
  status: (r.status === 'pending' && new Date(r.expires_at).getTime() < Date.now()
    ? 'expired'
    : r.status) as StaffInvitation['status'],
  expiresAt: new Date(r.expires_at).toISOString(),
  createdAt: new Date(r.created_at).toISOString(),
});

async function writeAudit(db: ReturnType<typeof getDb>, orgId: string, staff: { id: string; role: string }, action: string, targetId: string, label: string, metadata: Record<string, unknown>) {
  await db.insertInto('tenant_audit_log').values({
    organization_id: orgId,
    actor_staff_id: staff.id,
    actor_email_masked: null,
    actor_role: staff.role,
    action,
    target_type: 'staff_invitation',
    target_id: targetId,
    target_label: label,
    metadata: JSON.stringify(metadata),
  }).execute();
}

export const staffInvitationsRoute: FastifyPluginAsync = async (app) => {
  app.get('/staff/invitations', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar invitaciones.' }; }

    const rows = await db.selectFrom('staff_invitations')
      .select(['id', 'email', 'full_name', 'role', 'status', 'expires_at', 'created_at'])
      .where('organization_id', '=', guard.ctx.org.id)
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute();
    const body: StaffInvitationsListResponse = { invitations: (rows as InvRow[]).map(toPublic) };
    return body;
  });

  app.post('/staff/invitations', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para invitar.' }; }
    if ((await inviteLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiadas invitaciones. Espera un momento.' };
    }

    const parsed = StaffInviteCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.' }; }
    const { email, fullName, role } = parsed.data;
    const orgId = guard.ctx.org.id;

    // Invitar a un OWNER sólo lo puede un owner (paridad v1).
    if (role === 'owner' && guard.ctx.staff.role !== 'owner') {
      reply.code(403); return { error: 'Solo el propietario puede invitar a otros owners.' };
    }

    const existing = await db.selectFrom('staff_members').select(['id', 'status'])
      .where('organization_id', '=', orgId).where('email', '=', email).executeTakeFirst();
    if (existing && existing.status !== 'deleted') {
      reply.code(409); return { error: 'Ya existe un staff con este correo en la organización.' };
    }

    const plain = randomBytes(32).toString('hex');
    const inv = await db.transaction().execute(async (tx) => {
      // Pendiente previa para el mismo email → revocada y reemplazada.
      await tx.updateTable('staff_invitations')
        .set({ status: 'revoked', revoked_at: sql<string>`now()`, updated_at: sql<string>`now()` as unknown as string })
        .where('organization_id', '=', orgId).where('email', '=', email).where('status', '=', 'pending')
        .execute();
      return tx.insertInto('staff_invitations').values({
        organization_id: orgId,
        email,
        role,
        full_name: fullName?.trim() || null,
        token_hash: hashToken(plain),
        invited_by_staff_id: guard.ctx.staff.id,
        expires_at: new Date(Date.now() + INVITATION_TTL_MS).toISOString(),
      }).returning(['id', 'email', 'full_name', 'role', 'status', 'expires_at', 'created_at'])
        .executeTakeFirstOrThrow();
    });

    await writeAudit(db, orgId, guard.ctx.staff, 'staff.invited', inv.id, email, { role });

    // Envío REAL del correo (Resend) si hay RESEND_API_KEY; si no, dry-run honesto.
    // Best-effort post-commit (la invitación ya existe): si el email falla, el admin
    // puede reenviar. El token viaja SOLO en el link del correo, jamás se loguea.
    const inviteUrl = `https://${effectiveHost(req)}/invite/${plain}`;
    const branding: OrgBranding = { name: guard.ctx.org.name, primaryColor: guard.ctx.org.primaryColor, secondaryColor: guard.ctx.org.secondaryColor };
    const mail = await sendStaffInviteEmail(email, { orgName: guard.ctx.org.name, role, inviteUrl, branding });
    const delivery = 'sent' in mail ? 'sent' : 'skipped' in mail ? 'dry-run' : 'error';
    if ('error' in mail) req.log.error({ email: maskEmail(email), role, err: mail.error }, 'invitación de equipo: fallo al enviar el email');
    else req.log.info({ email: maskEmail(email), role, org: guard.ctx.org.slug, delivery }, 'invitación de equipo creada');

    reply.code(201);
    return { ok: true, invitation: toPublic(inv as InvRow), delivery };
  });

  app.post('/staff/invitations/:id/resend', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar invitaciones.' }; }
    const id = (req.params as { id: string }).id;

    const inv = await db.selectFrom('staff_invitations').select(['id', 'email', 'status'])
      .where('organization_id', '=', guard.ctx.org.id).where('id', '=', id).executeTakeFirst();
    if (!inv) { reply.code(404); return { error: 'Invitación no encontrada.' }; }
    if (inv.status !== 'pending') { reply.code(400); return { error: `La invitación está ${inv.status}; no se puede reenviar.` }; }

    const plain = randomBytes(32).toString('hex');
    const updated = await db.updateTable('staff_invitations')
      .set({ token_hash: hashToken(plain), expires_at: new Date(Date.now() + INVITATION_TTL_MS).toISOString(), updated_at: sql<string>`now()` as unknown as string })
      .where('id', '=', id)
      .returning(['id', 'email', 'full_name', 'role', 'status', 'expires_at', 'created_at'])
      .executeTakeFirstOrThrow();

    const inviteUrl = `https://${effectiveHost(req)}/invite/${plain}`;
    const branding: OrgBranding = { name: guard.ctx.org.name, primaryColor: guard.ctx.org.primaryColor, secondaryColor: guard.ctx.org.secondaryColor };
    const mail = await sendStaffInviteEmail(inv.email, { orgName: guard.ctx.org.name, role: updated.role, inviteUrl, branding });
    const delivery = 'sent' in mail ? 'sent' : 'skipped' in mail ? 'dry-run' : 'error';
    if ('error' in mail) req.log.error({ email: maskEmail(inv.email), err: mail.error }, 'invitación de equipo: fallo al reenviar el email');
    else req.log.info({ email: maskEmail(inv.email), org: guard.ctx.org.slug, delivery }, 'invitación reenviada');
    return { ok: true, invitation: toPublic(updated as InvRow), delivery };
  });

  app.post('/staff/invitations/:id/revoke', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para gestionar invitaciones.' }; }
    const id = (req.params as { id: string }).id;

    const updated = await db.updateTable('staff_invitations')
      .set({ status: 'revoked', revoked_at: sql<string>`now()`, updated_at: sql<string>`now()` as unknown as string })
      .where('organization_id', '=', guard.ctx.org.id).where('id', '=', id).where('status', '=', 'pending')
      .returning(['id', 'email', 'full_name', 'role', 'status', 'expires_at', 'created_at'])
      .executeTakeFirst();
    if (!updated) { reply.code(404); return { error: 'Invitación no encontrada o ya no está pendiente.' }; }

    await writeAudit(db, guard.ctx.org.id, guard.ctx.staff, 'staff.invitation_revoked', id, updated.email, {});
    return { ok: true, invitation: toPublic(updated as InvRow) };
  });

  // ── Lado público (aceptación) ──────────────────────────────────────────────

  app.get('/auth/invitation/:token', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const tenant = await resolveTenantFromHost(db, effectiveHost(req));
    if (!tenant.ok) { reply.code(404); return { error: 'Organización no encontrada' }; }

    const token = (req.params as { token: string }).token;
    const inv = await db.selectFrom('staff_invitations')
      .select(['email', 'full_name', 'role', 'status', 'expires_at', 'organization_id'])
      .where('token_hash', '=', hashToken(token))
      .executeTakeFirst();
    if (!inv || inv.organization_id !== tenant.org.id) { reply.code(404); return { error: 'Invitación no encontrada' }; }
    if (inv.status !== 'pending') { reply.code(410); return { error: `Invitación ${inv.status}` }; }
    if (new Date(inv.expires_at).getTime() < Date.now()) { reply.code(410); return { error: 'Invitación expirada' }; }

    const body: InvitationPreviewResponse = {
      invitation: {
        email: inv.email,
        fullName: inv.full_name,
        role: inv.role as 'owner' | 'admin' | 'operator' | 'protocolo',
        expiresAt: new Date(inv.expires_at).toISOString(),
        organization: { slug: tenant.org.slug, name: tenant.org.name },
      },
    };
    return body;
  });

  app.post('/auth/accept-invitation', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const tenant = await resolveTenantFromHost(db, effectiveHost(req));
    if (!tenant.ok) { reply.code(404); return { error: 'Organización no encontrada' }; }
    if ((await acceptLimiter.hit(req.ip)).limited) {
      reply.code(429); return { error: 'Demasiados intentos. Espera una hora.' };
    }

    const parsed = AcceptInvitationRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.' }; }
    const strength = validatePasswordStrength(parsed.data.password);
    if (strength.length > 0) { reply.code(400); return { error: `Password débil: ${strength.join(', ')}` }; }

    const inv = await db.selectFrom('staff_invitations')
      .select(['id', 'email', 'full_name', 'role', 'status', 'expires_at', 'organization_id'])
      .where('token_hash', '=', hashToken(parsed.data.token))
      .executeTakeFirst();
    if (!inv || inv.organization_id !== tenant.org.id) { reply.code(404); return { error: 'Invitación no encontrada' }; }
    if (inv.status !== 'pending') { reply.code(410); return { error: `Invitación ${inv.status}` }; }
    if (new Date(inv.expires_at).getTime() < Date.now()) { reply.code(410); return { error: 'Invitación expirada' }; }

    const existing = await db.selectFrom('staff_members').select('id')
      .where('organization_id', '=', inv.organization_id).where('email', '=', inv.email)
      .where('status', '!=', 'deleted').executeTakeFirst();
    if (existing) { reply.code(409); return { error: 'Ya existe una cuenta con este correo. Usá "Olvidé mi contraseña".' }; }

    const finalName = parsed.data.fullName?.trim() || inv.full_name || inv.email.split('@')[0]!;
    const passwordHash = await hashStaffPassword(parsed.data.password);

    const staff = await db.transaction().execute(async (tx) => {
      const created = await tx.insertInto('staff_members').values({
        organization_id: inv.organization_id,
        email: inv.email,
        password_hash: passwordHash,
        full_name: finalName,
        role: inv.role as 'owner' | 'admin' | 'operator' | 'protocolo',
        status: 'active',
        must_change_password: false,
      }).returning(['id', 'email']).executeTakeFirstOrThrow();
      await tx.updateTable('staff_invitations')
        .set({ status: 'accepted', accepted_by_staff_id: created.id, accepted_at: sql<string>`now()`, updated_at: sql<string>`now()` as unknown as string })
        .where('id', '=', inv.id).execute();
      return created;
    });

    req.log.info({ email: maskEmail(staff.email), org: tenant.org.slug, role: inv.role }, 'invitación aceptada');
    reply.code(201);
    return { ok: true, message: 'Cuenta creada. Ya podés ingresar.' };
  });
};
