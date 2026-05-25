// =============================================================================
// staffManagement.js · endpoints para que owners/admins gestionen su staff.
//
// Montado en `/api/staff/members` y `/api/staff/invitations`. NO se mezcla
// con el router legacy `/api/staff/login` (PIN).
// =============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';
import { requireRole } from '../middleware/requireRole.js';
import { rateLimit } from '../utils/rateLimit.js';
import { config } from '../config.js';
import { initRepositories } from '../db/repositories.js';
import { StaffMemberRepository } from '../db/postgres/platform/StaffMemberRepository.js';
import { StaffSessionRepository } from '../db/postgres/platform/StaffSessionRepository.js';
import { StaffInvitationRepository } from '../db/postgres/platform/StaffInvitationRepository.js';
import { generateOpaqueToken } from '../services/auth/passwordService.js';
import { recordAudit } from '../services/auth/auditService.js';
import { sendStaffInvitationEmail } from '../services/auth/authEmails.js';
import { maskEmail } from '../utils/log.js';

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

const ROLES = ['owner', 'admin', 'operator'];

const inviteSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().trim().max(160).optional(),
  role: z.enum(ROLES),
});

const roleSchema = z.object({
  role: z.enum(ROLES),
});

const inviteRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  message: 'Demasiadas invitaciones desde tu cuenta. Espera una hora.',
  key: req => `inv:${req.currentStaff?.id || req.ip}`,
});

function ensurePostgres() {
  if (config.DB_DRIVER !== 'postgres') {
    throw new HttpError(503, 'Auth requiere DB_DRIVER=postgres');
  }
}

function publicMember(m) {
  if (!m) return null;
  return {
    id: m.id,
    email: m.email,
    fullName: m.fullName,
    role: m.role,
    status: m.status,
    lastLoginAt: m.lastLoginAt,
    createdAt: m.createdAt,
  };
}

function publicInvitation(inv) {
  if (!inv) return null;
  return {
    id: inv.id,
    email: inv.email,
    fullName: inv.fullName,
    role: inv.role,
    status: inv.status,
    invitedByStaffId: inv.invitedByStaffId,
    expiresAt: inv.expiresAt,
    acceptedAt: inv.acceptedAt,
    createdAt: inv.createdAt,
  };
}

function buildInviteUrl(organization, plainToken) {
  // Si la org tiene custom domain verificado, usamos ese host. Si no, slug.root.
  const root = config.ROOT_DOMAIN || 'localhost';
  if (organization.customDomain && organization.customDomainVerifiedAt) {
    return `https://${organization.customDomain}/invite/${plainToken}`;
  }
  const proto = root === 'localhost' ? 'http' : 'https';
  return `${proto}://${organization.slug}.${root}/invite/${plainToken}`;
}

export function createStaffManagementRouter() {
  const router = Router();

  // ============================================================
  // Members
  // ============================================================

  router.get('/members',
    requireStaffSession,
    requireRole(['owner', 'admin']),
    async (req, res, next) => {
      try {
        ensurePostgres();
        const inst = await initRepositories();
        const staffRepo = new StaffMemberRepository(inst.pool);
        const members = await staffRepo.listByOrganization(req.organization.id);
        res.json({ members: members.map(publicMember) });
      } catch (e) { next(e); }
    }
  );

  router.post('/members/:id/role',
    requireStaffSession,
    requireRole(['owner', 'admin']),
    async (req, res, next) => {
      try {
        ensurePostgres();
        const parsed = roleSchema.safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'Datos inválidos');
        const newRole = parsed.data.role;

        if (req.params.id === req.currentStaff.id) {
          throw new HttpError(400, 'No puedes modificar tu propio rol.');
        }

        // Solo owners pueden asignar el rol owner.
        if (newRole === 'owner' && req.currentStaff.role !== 'owner') {
          throw new HttpError(403, 'Solo el propietario puede asignar el rol owner.');
        }

        const inst = await initRepositories();
        const staffRepo = new StaffMemberRepository(inst.pool);
        const target = await staffRepo.findById(req.params.id);
        if (!target || target.organizationId !== req.organization.id) {
          throw new HttpError(404, 'Staff no encontrado');
        }
        if (target.role === newRole) {
          return res.json({ ok: true, member: publicMember(target) });
        }

        // Si bajamos a un owner, asegurarnos que no es el último.
        if (target.role === 'owner' && newRole !== 'owner') {
          const owners = await staffRepo.countActiveOwners(req.organization.id);
          if (owners <= 1) {
            throw new HttpError(400, 'La organización debe tener al menos un owner activo. Asigna otro owner antes de cambiar este rol.');
          }
        }

        const updated = await staffRepo.updateRole(target.id, newRole);

        recordAudit({
          req,
          action: 'staff.role_changed',
          targetType: 'staff_member',
          targetId: target.id,
          targetLabel: target.email,
          metadata: { from: target.role, to: newRole },
        }).catch(() => {});

        res.json({ ok: true, member: publicMember(updated) });
      } catch (e) { next(e); }
    }
  );

  router.post('/members/:id/suspend',
    requireStaffSession,
    requireRole(['owner', 'admin']),
    async (req, res, next) => {
      try {
        ensurePostgres();
        if (req.params.id === req.currentStaff.id) {
          throw new HttpError(400, 'No puedes suspenderte a ti mismo.');
        }

        const inst = await initRepositories();
        const staffRepo = new StaffMemberRepository(inst.pool);
        const sessionRepo = new StaffSessionRepository(inst.pool);

        const target = await staffRepo.findById(req.params.id);
        if (!target || target.organizationId !== req.organization.id) {
          throw new HttpError(404, 'Staff no encontrado');
        }
        if (target.status === 'suspended') {
          return res.json({ ok: true, member: publicMember(target) });
        }
        if (target.role === 'owner') {
          const owners = await staffRepo.countActiveOwners(req.organization.id);
          if (owners <= 1) {
            throw new HttpError(400, 'No puedes suspender al último owner activo.');
          }
        }

        const updated = await staffRepo.updateStatus(target.id, 'suspended');
        // Revoca TODAS sus sesiones.
        await sessionRepo.revokeAllForAccount(target.id);

        recordAudit({
          req,
          action: 'staff.suspended',
          targetType: 'staff_member',
          targetId: target.id,
          targetLabel: target.email,
          metadata: { previousStatus: target.status },
        }).catch(() => {});

        res.json({ ok: true, member: publicMember(updated) });
      } catch (e) { next(e); }
    }
  );

  router.post('/members/:id/reactivate',
    requireStaffSession,
    requireRole(['owner', 'admin']),
    async (req, res, next) => {
      try {
        ensurePostgres();
        const inst = await initRepositories();
        const staffRepo = new StaffMemberRepository(inst.pool);
        const target = await staffRepo.findById(req.params.id);
        if (!target || target.organizationId !== req.organization.id) {
          throw new HttpError(404, 'Staff no encontrado');
        }
        if (target.status === 'active') {
          return res.json({ ok: true, member: publicMember(target) });
        }
        const updated = await staffRepo.updateStatus(target.id, 'active');
        recordAudit({
          req,
          action: 'staff.reactivated',
          targetType: 'staff_member',
          targetId: target.id,
          targetLabel: target.email,
        }).catch(() => {});
        res.json({ ok: true, member: publicMember(updated) });
      } catch (e) { next(e); }
    }
  );

  router.delete('/members/:id',
    requireStaffSession,
    requireRole(['owner']),
    async (req, res, next) => {
      try {
        ensurePostgres();
        if (req.params.id === req.currentStaff.id) {
          throw new HttpError(400, 'No puedes eliminarte a ti mismo.');
        }

        const inst = await initRepositories();
        const staffRepo = new StaffMemberRepository(inst.pool);
        const sessionRepo = new StaffSessionRepository(inst.pool);

        const target = await staffRepo.findById(req.params.id);
        if (!target || target.organizationId !== req.organization.id) {
          throw new HttpError(404, 'Staff no encontrado');
        }
        if (target.role === 'owner') {
          const owners = await staffRepo.countActiveOwners(req.organization.id);
          if (owners <= 1) {
            throw new HttpError(400, 'No puedes eliminar al último owner activo.');
          }
        }

        await staffRepo.softDelete(target.id);
        await sessionRepo.revokeAllForAccount(target.id);

        recordAudit({
          req,
          action: 'staff.deleted',
          targetType: 'staff_member',
          targetId: target.id,
          targetLabel: target.email,
          metadata: { role: target.role },
        }).catch(() => {});

        res.status(204).end();
      } catch (e) { next(e); }
    }
  );

  // ============================================================
  // Invitations
  // ============================================================

  router.get('/invitations',
    requireStaffSession,
    requireRole(['owner', 'admin']),
    async (req, res, next) => {
      try {
        ensurePostgres();
        const inst = await initRepositories();
        const invRepo = new StaffInvitationRepository(inst.pool);
        const status = req.query.status ? String(req.query.status) : undefined;
        const invitations = await invRepo.listByOrganization(req.organization.id, { status });
        res.json({ invitations: invitations.map(publicInvitation) });
      } catch (e) { next(e); }
    }
  );

  router.post('/invitations',
    requireStaffSession,
    requireRole(['owner', 'admin']),
    inviteRateLimit,
    async (req, res, next) => {
      try {
        ensurePostgres();
        const parsed = inviteSchema.safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'Datos inválidos');
        const { email, fullName, role } = parsed.data;

        if (role === 'owner' && req.currentStaff.role !== 'owner') {
          throw new HttpError(403, 'Solo el propietario puede invitar a otros owners.');
        }

        const inst = await initRepositories();
        const staffRepo = new StaffMemberRepository(inst.pool);
        const invRepo = new StaffInvitationRepository(inst.pool);

        const existingStaff = await staffRepo.findByEmail(req.organization.id, email);
        if (existingStaff && existingStaff.status !== 'deleted') {
          throw new HttpError(409, 'Ya existe un staff con este correo en la organización.');
        }

        // Si hay una pendiente, la revocamos y creamos una nueva
        const existingInvite = await invRepo.findPendingByEmail(req.organization.id, email);
        if (existingInvite) {
          await invRepo.markRevoked(existingInvite.id);
          recordAudit({
            req,
            action: 'staff.invitation_revoked',
            targetType: 'staff_invitation',
            targetId: existingInvite.id,
            targetLabel: existingInvite.email,
            metadata: { reason: 'replaced_by_new_invite' },
          }).catch(() => {});
        }

        const { plain, hash } = generateOpaqueToken();
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
        const inv = await invRepo.create({
          organizationId: req.organization.id,
          email,
          role,
          fullName: fullName || null,
          tokenHash: hash,
          invitedByStaffId: req.currentStaff.id,
          expiresAt,
        });

        const inviteUrl = buildInviteUrl(req.organization, plain);

        // Best-effort email
        try {
          await sendStaffInvitationEmail({
            email,
            fullName: fullName || null,
            role,
            organization: req.organization,
            inviteUrl,
            invitedByName: req.currentStaff.fullName,
            expiresAt,
          });
        } catch (e) {
          console.warn('[staff-invite] email falló:', e.message);
        }

        recordAudit({
          req,
          action: 'staff.invited',
          targetType: 'staff_invitation',
          targetId: inv.id,
          targetLabel: email,
          metadata: { role },
        }).catch(() => {});

        console.log(`[staff-invite] org=${req.organization.slug} email=${maskEmail(email)} role=${role}`);
        res.json({ ok: true, invitation: publicInvitation(inv) });
      } catch (e) { next(e); }
    }
  );

  router.post('/invitations/:id/resend',
    requireStaffSession,
    requireRole(['owner', 'admin']),
    inviteRateLimit,
    async (req, res, next) => {
      try {
        ensurePostgres();
        const inst = await initRepositories();
        const invRepo = new StaffInvitationRepository(inst.pool);

        const inv = await invRepo.findById(req.params.id);
        if (!inv || inv.organizationId !== req.organization.id) {
          throw new HttpError(404, 'Invitación no encontrada');
        }
        if (inv.status !== 'pending') {
          throw new HttpError(400, `La invitación está ${inv.status}; no se puede reenviar.`);
        }

        const { plain, hash } = generateOpaqueToken();
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
        const updated = await invRepo.regenerateToken(inv.id, hash, expiresAt);

        const inviteUrl = buildInviteUrl(req.organization, plain);
        try {
          await sendStaffInvitationEmail({
            email: inv.email,
            fullName: inv.fullName,
            role: inv.role,
            organization: req.organization,
            inviteUrl,
            invitedByName: req.currentStaff.fullName,
            expiresAt,
          });
        } catch (e) {
          console.warn('[staff-invite-resend] email falló:', e.message);
        }

        recordAudit({
          req,
          action: 'staff.invitation_resent',
          targetType: 'staff_invitation',
          targetId: inv.id,
          targetLabel: inv.email,
        }).catch(() => {});

        res.json({ ok: true, invitation: publicInvitation(updated) });
      } catch (e) { next(e); }
    }
  );

  router.post('/invitations/:id/revoke',
    requireStaffSession,
    requireRole(['owner', 'admin']),
    async (req, res, next) => {
      try {
        ensurePostgres();
        const inst = await initRepositories();
        const invRepo = new StaffInvitationRepository(inst.pool);

        const inv = await invRepo.findById(req.params.id);
        if (!inv || inv.organizationId !== req.organization.id) {
          throw new HttpError(404, 'Invitación no encontrada');
        }
        if (inv.status !== 'pending') {
          throw new HttpError(400, `La invitación está ${inv.status}; no se puede revocar.`);
        }

        const updated = await invRepo.markRevoked(inv.id);

        recordAudit({
          req,
          action: 'staff.invitation_revoked',
          targetType: 'staff_invitation',
          targetId: inv.id,
          targetLabel: inv.email,
        }).catch(() => {});

        res.json({ ok: true, invitation: publicInvitation(updated) });
      } catch (e) { next(e); }
    }
  );

  return router;
}
