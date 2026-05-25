// =============================================================================
// platformAdmin.js · endpoints administrativos del super admin (cross-tenant).
// Todo bajo /api/platform/* y protegido por requirePlatformAdmin.
// =============================================================================

import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { requirePlatformAdmin } from '../middleware/requirePlatformAdmin.js';
import { config } from '../config.js';
import { initRepositories } from '../db/repositories.js';
import { OrganizationRepository } from '../db/postgres/platform/OrganizationRepository.js';
import { StaffMemberRepository } from '../db/postgres/platform/StaffMemberRepository.js';
import { AuditLogRepository } from '../db/postgres/platform/AuditLogRepository.js';
import { invalidateTenantCache } from '../middleware/resolveTenant.js';
import { maskEmail } from '../utils/log.js';

const KPI_CACHE_TTL_MS = 60_000;
let _kpiCache = { at: 0, data: null };

function ensurePostgres() {
  if (config.DB_DRIVER !== 'postgres') {
    throw new HttpError(503, 'Platform admin requiere DB_DRIVER=postgres');
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

function publicOrgSummary(o, kpis = {}) {
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    legalName: o.legalName,
    plan: o.plan,
    status: o.status,
    primaryColor: o.primaryColor,
    secondaryColor: o.secondaryColor,
    sidebarStyle: o.sidebarStyle,
    logoUrl: o.logoUrl,
    customDomain: o.customDomain,
    customDomainVerifiedAt: o.customDomainVerifiedAt,
    trialEndsAt: o.trialEndsAt,
    createdAt: o.createdAt,
    usersCount: kpis.usersCount ?? null,
    attendancesCount30d: kpis.attendancesCount30d ?? null,
    activitiesActive: kpis.activitiesActive ?? null,
    staffCount: kpis.staffCount ?? null,
    lastActivityAt: kpis.lastActivityAt ?? null,
  };
}

async function fetchKpis(pool) {
  // Tenants count + status
  const tenants = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status='active')::int AS active,
       COUNT(*) FILTER (WHERE status='suspended')::int AS suspended
     FROM organizations
     WHERE deleted_at IS NULL`,
  );
  const users = await pool.query(`SELECT COUNT(*)::int AS n FROM users`);
  const attendances = await pool.query(`SELECT COUNT(*)::int AS n FROM attendance`);
  const activitiesActive = await pool.query(
    `SELECT COUNT(*)::int AS n FROM activities
      WHERE status IN ('open','draft') AND date >= NOW() - INTERVAL '1 day'`,
  );
  const staff = await pool.query(
    `SELECT COUNT(*)::int AS n FROM staff_members WHERE deleted_at IS NULL`,
  );

  return {
    tenants: tenants.rows[0].total,
    activeTenants: tenants.rows[0].active,
    suspendedTenants: tenants.rows[0].suspended,
    users: users.rows[0].n,
    attendances: attendances.rows[0].n,
    activeActivities: activitiesActive.rows[0].n,
    staff: staff.rows[0].n,
  };
}

async function fetchRecentAudit(pool, limit = 8) {
  const { rows } = await pool.query(
    `SELECT a.*, o.slug AS org_slug, o.name AS org_name
       FROM tenant_audit_log a
  LEFT JOIN organizations o ON o.id = a.organization_id
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(r => ({
    id: String(r.id),
    action: r.action,
    actorEmailMasked: r.actor_email_masked,
    actorRole: r.actor_role,
    targetType: r.target_type,
    targetLabel: r.target_label,
    metadata: r.metadata || {},
    organizationId: r.organization_id,
    organizationSlug: r.org_slug,
    organizationName: r.org_name,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));
}

async function fetchTenantSummary(pool, orgId) {
  const usersR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE organization_id = $1`, [orgId],
  );
  const attR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM attendance
      WHERE organization_id = $1 AND registered_at >= NOW() - INTERVAL '30 days'`,
    [orgId],
  );
  const actR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM activities
      WHERE organization_id = $1 AND status IN ('open','draft') AND date >= NOW() - INTERVAL '1 day'`,
    [orgId],
  );
  const staffR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM staff_members
      WHERE organization_id = $1 AND deleted_at IS NULL`,
    [orgId],
  );
  const lastR = await pool.query(
    `SELECT GREATEST(
       COALESCE((SELECT MAX(registered_at) FROM attendance WHERE organization_id = $1), 'epoch'::timestamptz),
       COALESCE((SELECT MAX(created_at) FROM activities WHERE organization_id = $1), 'epoch'::timestamptz),
       COALESCE((SELECT MAX(created_at) FROM users WHERE organization_id = $1), 'epoch'::timestamptz)
     ) AS last_at`,
    [orgId],
  );
  return {
    usersCount: usersR.rows[0].n,
    attendancesCount30d: attR.rows[0].n,
    activitiesActive: actR.rows[0].n,
    staffCount: staffR.rows[0].n,
    lastActivityAt: lastR.rows[0].last_at
      ? (lastR.rows[0].last_at instanceof Date
          ? lastR.rows[0].last_at.toISOString()
          : lastR.rows[0].last_at)
      : null,
  };
}

async function writePlatformAudit(pool, { organizationId, action, admin, target, metadata, ip, ua }) {
  try {
    const auditRepo = new AuditLogRepository(pool);
    await auditRepo.record({
      organizationId,
      actorStaffId: null,
      actorEmailMasked: admin ? maskEmail(admin.email) : null,
      actorRole: 'platform_admin',
      action,
      targetType: target?.type || null,
      targetId: target?.id || null,
      targetLabel: target?.label || null,
      metadata: metadata || {},
      ipHash: null,
      ua: ua || null,
    });
  } catch (e) {
    console.warn('[platform-admin] audit write falló:', e.message);
  }
}

export function createPlatformAdminRouter() {
  const router = Router();
  router.use(requirePlatformAdmin);

  // ----- KPIs cross-tenant -----
  router.get('/kpis', async (_req, res, next) => {
    try {
      ensurePostgres();
      if (_kpiCache.data && Date.now() - _kpiCache.at < KPI_CACHE_TTL_MS) {
        return res.json({ kpis: _kpiCache.data.kpis, recentAudit: _kpiCache.data.recentAudit, cachedAt: _kpiCache.at });
      }
      const inst = await initRepositories();
      const [kpis, recentAudit] = await Promise.all([
        fetchKpis(inst.pool),
        fetchRecentAudit(inst.pool, 8),
      ]);
      _kpiCache = { at: Date.now(), data: { kpis, recentAudit } };
      res.json({ kpis, recentAudit, cachedAt: _kpiCache.at });
    } catch (e) { next(e); }
  });

  // ----- Tenants list -----
  router.get('/tenants', async (req, res, next) => {
    try {
      ensurePostgres();
      const inst = await initRepositories();
      const q = (req.query.q || '').toString().trim().toLowerCase();
      const params = [];
      let where = `WHERE deleted_at IS NULL`;
      if (q) {
        params.push(`%${q}%`);
        where += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(slug) LIKE $${params.length})`;
      }
      const { rows } = await inst.pool.query(
        `SELECT * FROM organizations ${where} ORDER BY created_at DESC LIMIT 200`,
        params,
      );
      const tenants = [];
      for (const r of rows) {
        const org = {
          id: r.id, slug: r.slug, name: r.name, legalName: r.legal_name,
          plan: r.plan, status: r.status,
          primaryColor: r.primary_color, secondaryColor: r.secondary_color,
          sidebarStyle: r.sidebar_style, logoUrl: r.logo_url,
          customDomain: r.custom_domain,
          customDomainVerifiedAt: r.custom_domain_verified_at,
          trialEndsAt: r.trial_ends_at,
          createdAt: r.created_at,
        };
        const kpis = await fetchTenantSummary(inst.pool, r.id);
        tenants.push(publicOrgSummary(org, kpis));
      }
      res.json({ tenants });
    } catch (e) { next(e); }
  });

  // ----- Tenant detail -----
  router.get('/tenants/:id', async (req, res, next) => {
    try {
      ensurePostgres();
      const inst = await initRepositories();
      const orgRepo = new OrganizationRepository(inst.pool);
      const org = await orgRepo.findById(req.params.id);
      if (!org) throw new HttpError(404, 'Tenant no encontrado');

      const staffRepo = new StaffMemberRepository(inst.pool);
      const [kpis, staff, recent] = await Promise.all([
        fetchTenantSummary(inst.pool, org.id),
        staffRepo.listByOrganization(org.id),
        inst.pool.query(
          `SELECT * FROM tenant_audit_log
            WHERE organization_id = $1
            ORDER BY created_at DESC, id DESC LIMIT 12`,
          [org.id],
        ),
      ]);

      res.json({
        tenant: publicOrgSummary(org, kpis),
        staff: staff.map(publicMember),
        recentAudit: recent.rows.map(r => ({
          id: String(r.id),
          action: r.action,
          actorEmailMasked: r.actor_email_masked,
          actorRole: r.actor_role,
          targetType: r.target_type,
          targetLabel: r.target_label,
          metadata: r.metadata || {},
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        })),
      });
    } catch (e) { next(e); }
  });

  // ----- Suspend / Reactivate -----
  router.post('/tenants/:id/suspend', async (req, res, next) => {
    try {
      ensurePostgres();
      const inst = await initRepositories();
      const orgRepo = new OrganizationRepository(inst.pool);
      const org = await orgRepo.findById(req.params.id);
      if (!org) throw new HttpError(404, 'Tenant no encontrado');
      if (org.status === 'suspended') return res.json({ ok: true, tenant: publicOrgSummary(org) });
      const updated = await orgRepo.update(org.id, { status: 'suspended' });
      invalidateTenantCache(org.slug);
      if (org.customDomain) invalidateTenantCache(org.customDomain);
      _kpiCache = { at: 0, data: null };
      await writePlatformAudit(inst.pool, {
        organizationId: org.id,
        action: 'tenant.suspended',
        admin: req.platformAdmin,
        target: { type: 'organization', id: org.id, label: org.slug },
        ip: req.ip, ua: req.headers['user-agent'],
      });
      res.json({ ok: true, tenant: publicOrgSummary(updated) });
    } catch (e) { next(e); }
  });

  router.post('/tenants/:id/reactivate', async (req, res, next) => {
    try {
      ensurePostgres();
      const inst = await initRepositories();
      const orgRepo = new OrganizationRepository(inst.pool);
      const org = await orgRepo.findById(req.params.id);
      if (!org) throw new HttpError(404, 'Tenant no encontrado');
      if (org.status === 'active') return res.json({ ok: true, tenant: publicOrgSummary(org) });
      const updated = await orgRepo.update(org.id, { status: 'active' });
      invalidateTenantCache(org.slug);
      if (org.customDomain) invalidateTenantCache(org.customDomain);
      _kpiCache = { at: 0, data: null };
      await writePlatformAudit(inst.pool, {
        organizationId: org.id,
        action: 'tenant.reactivated',
        admin: req.platformAdmin,
        target: { type: 'organization', id: org.id, label: org.slug },
        ip: req.ip, ua: req.headers['user-agent'],
      });
      res.json({ ok: true, tenant: publicOrgSummary(updated) });
    } catch (e) { next(e); }
  });

  // ----- Audit cross-tenant -----
  router.get('/audit-log', async (req, res, next) => {
    try {
      ensurePostgres();
      const inst = await initRepositories();
      const limit = Math.min(200, Number(req.query.limit) || 50);
      const params = [];
      let where = `1 = 1`;
      if (req.query.before) {
        const [ts, id] = String(req.query.before).split('|');
        if (ts && id) {
          params.push(ts); params.push(id);
          where += ` AND (a.created_at, a.id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`;
        }
      }
      if (req.query.tenant) {
        params.push(req.query.tenant);
        where += ` AND a.organization_id = $${params.length}`;
      }
      if (req.query.action) {
        const v = String(req.query.action);
        params.push(v.endsWith('.') ? `${v}%` : v);
        where += ` AND a.action ${v.endsWith('.') ? 'LIKE' : '='} $${params.length}`;
      }
      if (req.query.since) {
        params.push(req.query.since);
        where += ` AND a.created_at >= $${params.length}::timestamptz`;
      }
      if (req.query.until) {
        params.push(req.query.until);
        where += ` AND a.created_at <= $${params.length}::timestamptz`;
      }
      params.push(limit + 1);
      const { rows } = await inst.pool.query(
        `SELECT a.*, o.slug AS org_slug, o.name AS org_name
           FROM tenant_audit_log a
      LEFT JOIN organizations o ON o.id = a.organization_id
          WHERE ${where}
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT $${params.length}`,
        params,
      );
      let entries = rows.map(r => ({
        id: String(r.id),
        organizationId: r.organization_id,
        organizationSlug: r.org_slug,
        organizationName: r.org_name,
        actorStaffId: r.actor_staff_id,
        actorEmailMasked: r.actor_email_masked,
        actorRole: r.actor_role,
        action: r.action,
        targetType: r.target_type,
        targetLabel: r.target_label,
        metadata: r.metadata || {},
        ipHash: r.ip_hash,
        ua: r.ua,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      }));
      let nextCursor = null;
      if (entries.length > limit) {
        const last = entries[limit - 1];
        entries = entries.slice(0, limit);
        nextCursor = `${last.createdAt}|${last.id}`;
      }
      res.json({ entries, nextCursor });
    } catch (e) { next(e); }
  });

  return router;
}
