// apps/api-v2/src/routes/platform-admin.ts · panel del super-admin (cross-tenant).
// TODO tras requirePlatformAdmin. Queries cross-tenant (sin filtro
// organization_id) INTENCIONALES y aisladas acá — nunca en rutas de tenant.
//   GET /platform/kpis     · KPIs globales + auditoría reciente.
//   GET /platform/tenants  · lista de tenants con resumen operativo + health.
// Set-based (sin N+1): agregados agrupados por organización y merge en memoria.

import { createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, type DbClient } from '@contan2/db';
import {
  PlatformPlanUpdateRequestSchema,
  PlatformTrialUpdateRequestSchema,
  PlatformNotesUpdateRequestSchema,
  type PlatformKpisResponse,
  type PlatformTenantsResponse,
  type PlatformTenantSummary,
  type PlatformTenantDetailResponse,
  type PlatformActionResponse,
  type PlatformAuditEntry,
  type PlatformAuditResponse,
  type TenantHealth,
} from '@contan2/contracts';
import { requirePlatformAdmin, type PlatformContext } from '../platform-guard.js';
import { maskEmail } from '../services/audit-mask.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Rate-limit de acciones mutativas (v1 no lo tenía): 30/min por admin+IP.
const actionLimiter = createRateLimiter({ max: 30, windowMs: 60_000, prefix: endpointPrefix('platform-action') });

function sha256(s: string): string { return createHash('sha256').update(s).digest('hex'); }

// Auditoría DOBLE: platform_audit_log (fuente de verdad del super-admin) +
// espejo en tenant_audit_log del tenant afectado (para su propio Historial).
async function writePlatformAudit(db: DbClient, ctx: PlatformContext, req: FastifyRequest, input: {
  action: string; orgId: string | null; targetLabel: string | null; metadata?: Record<string, unknown>;
}): Promise<void> {
  const emailMasked = maskEmail(ctx.admin.email);
  const meta = JSON.stringify(input.metadata ?? {}); // JSON no-nullable en ambas tablas
  const ipHash = req.ip ? sha256(req.ip) : null;
  const ua = typeof req.headers['user-agent'] === 'string' ? (req.headers['user-agent'] as string).slice(0, 256) : null;
  await db.insertInto('platform_audit_log').values({
    platform_admin_id: ctx.admin.id, actor_email_masked: emailMasked, action: input.action,
    target_type: 'tenant', target_id: input.orgId, target_label: input.targetLabel,
    metadata: meta, ip_hash: ipHash, ua,
  }).execute();
  if (input.orgId) {
    await db.insertInto('tenant_audit_log').values({
      organization_id: input.orgId, actor_staff_id: null, actor_email_masked: emailMasked,
      actor_role: 'platform_admin', action: input.action, target_type: 'tenant',
      target_id: input.orgId, target_label: input.targetLabel, metadata: meta, ip_hash: ipHash, ua,
    }).execute();
  }
}

// Resumen operativo de UN tenant (para el detalle y las respuestas de acción).
async function loadTenantSummary(db: DbClient, orgId: string): Promise<PlatformTenantSummary | null> {
  const o = await db.selectFrom('organizations')
    .select(['id', 'slug', 'name', 'custom_domain', 'custom_domain_verified_at', 'status', 'plan', 'created_at', 'trial_ends_at'])
    .where('id', '=', orgId).where('deleted_at', 'is', null).limit(1).executeTakeFirst();
  if (!o) return null;
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY_MS);
  const since30 = new Date(now - 30 * DAY_MS);
  const [users, staff, a7, a30, act, last] = await Promise.all([
    db.selectFrom('users').select(db.fn.countAll<number>().as('n')).where('deleted_at', 'is', null).where('organization_id', '=', orgId).executeTakeFirst(),
    db.selectFrom('staff_members').select(db.fn.countAll<number>().as('n')).where('status', '=', 'active').where('organization_id', '=', orgId).executeTakeFirst(),
    db.selectFrom('attendance').select(db.fn.countAll<number>().as('n')).where('registered_at', '>=', since7).where('organization_id', '=', orgId).executeTakeFirst(),
    db.selectFrom('attendance').select(db.fn.countAll<number>().as('n')).where('registered_at', '>=', since30).where('organization_id', '=', orgId).executeTakeFirst(),
    db.selectFrom('activities').select(db.fn.countAll<number>().as('n')).where('status', '=', 'activa').where('organization_id', '=', orgId).executeTakeFirst(),
    db.selectFrom('attendance').select(db.fn.max('registered_at').as('last')).where('organization_id', '=', orgId).executeTakeFirst(),
  ]);
  const lastActivityAt = last?.last ? new Date(last.last as unknown as string).toISOString() : null;
  const attendances30d = Number(a30?.n ?? 0);
  return {
    id: o.id, slug: o.slug, name: o.name,
    customDomain: o.custom_domain ?? null,
    customDomainVerified: !!o.custom_domain_verified_at,
    status: o.status as PlatformTenantSummary['status'],
    plan: o.plan as PlatformTenantSummary['plan'],
    createdAt: new Date(o.created_at as unknown as string).toISOString(),
    trialEndsAt: o.trial_ends_at ? new Date(o.trial_ends_at as unknown as string).toISOString() : null,
    usersCount: Number(users?.n ?? 0),
    staffCount: Number(staff?.n ?? 0),
    attendances7d: Number(a7?.n ?? 0),
    attendances30d,
    activitiesActive: Number(act?.n ?? 0),
    lastActivityAt,
    health: deriveHealth({
      status: o.status, plan: o.plan, customDomain: o.custom_domain ?? null,
      customDomainVerified: !!o.custom_domain_verified_at, attendances30d, lastActivityAt,
    }),
  };
}

// Deriva el health operativo de un tenant (un solo indicador, con prioridad:
// estado bloqueante → config → uso).
export function deriveHealth(t: {
  status: string; plan: string; customDomain: string | null; customDomainVerified: boolean;
  attendances30d: number; lastActivityAt: string | null;
}): TenantHealth {
  if (t.status === 'suspended') return 'suspendido';
  if (t.status === 'trial_ended') return 'trial_vencido';
  if (t.customDomain && !t.customDomainVerified) return 'dns_pendiente';
  if (t.attendances30d > 0) return 'operando';
  if (!t.lastActivityAt) return 'inactivo';
  return 'sin_uso';
}

// Auditoría reciente cross-tenant (join a organizations para nombre/slug).
async function recentAudit(db: DbClient, limit: number): Promise<PlatformAuditEntry[]> {
  const rows = await db.selectFrom('tenant_audit_log as al')
    .leftJoin('organizations as o', 'o.id', 'al.organization_id')
    .select([
      'al.id as id', 'al.created_at as createdAt', 'o.slug as tenantSlug', 'o.name as tenantName',
      'al.actor_email_masked as actorEmailMasked', 'al.actor_role as actorRole',
      'al.action as action', 'al.target_type as targetType', 'al.target_label as targetLabel',
    ])
    .orderBy('al.id', 'desc')
    .limit(limit)
    .execute();
  return rows.map((r) => ({
    id: String(r.id),
    createdAt: new Date(r.createdAt as unknown as string).toISOString(),
    tenantSlug: r.tenantSlug ?? null,
    tenantName: r.tenantName ?? null,
    actorEmailMasked: r.actorEmailMasked ?? null,
    actorRole: r.actorRole ?? null,
    action: r.action,
    targetType: r.targetType ?? null,
    targetLabel: r.targetLabel ?? null,
  }));
}

export const platformAdminRoute: FastifyPluginAsync = async (app) => {
  // ── GET /platform/kpis ─────────────────────────────────────────────────────
  app.get('/platform/kpis', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requirePlatformAdmin(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }

    const now = Date.now();
    const since30 = new Date(now - 30 * DAY_MS);

    const [statusRows, usersRow, staffRow, actRow, att30Row, attByOrg, audit] = await Promise.all([
      db.selectFrom('organizations').select(['status', db.fn.countAll<number>().as('n')])
        .where('deleted_at', 'is', null).groupBy('status').execute(),
      db.selectFrom('users').select(db.fn.countAll<number>().as('n')).where('deleted_at', 'is', null).executeTakeFirst(),
      db.selectFrom('staff_members').select(db.fn.countAll<number>().as('n')).where('status', '=', 'active').executeTakeFirst(),
      db.selectFrom('activities').select(db.fn.countAll<number>().as('n')).where('status', '=', 'activa').executeTakeFirst(),
      db.selectFrom('attendance').select(db.fn.countAll<number>().as('n')).where('registered_at', '>=', since30).executeTakeFirst(),
      // tenants con actividad en 30d → para el conteo de "en riesgo".
      db.selectFrom('attendance').select('organization_id').where('registered_at', '>=', since30).groupBy('organization_id').execute(),
      recentAudit(db, 8),
    ]);

    const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.n)]));
    const active = byStatus['active'] ?? 0;
    const suspended = byStatus['suspended'] ?? 0;
    const trialEnded = byStatus['trial_ended'] ?? 0;
    const total = active + suspended + trialEnded;

    // En riesgo: suspendidos + trial vencidos + activos SIN asistencias en 30d.
    const orgsWithActivity = new Set(attByOrg.map((r) => r.organization_id));
    const activeOrgs = await db.selectFrom('organizations').select('id')
      .where('deleted_at', 'is', null).where('status', '=', 'active').execute();
    const activeSinUso = activeOrgs.filter((o) => !orgsWithActivity.has(o.id)).length;

    const body: PlatformKpisResponse = {
      tenants: { total, active, suspended, trialEnded, atRisk: suspended + trialEnded + activeSinUso },
      usersTotal: Number(usersRow?.n ?? 0),
      staffTotal: Number(staffRow?.n ?? 0),
      activitiesActive: Number(actRow?.n ?? 0),
      attendances30d: Number(att30Row?.n ?? 0),
      recentAudit: audit,
    };
    return body;
  });

  // ── GET /platform/tenants ──────────────────────────────────────────────────
  app.get('/platform/tenants', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requirePlatformAdmin(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }

    const q = String((req.query as { q?: string }).q ?? '').trim().toLowerCase();
    const statusFilter = String((req.query as { status?: string }).status ?? '').trim();
    const planFilter = String((req.query as { plan?: string }).plan ?? '').trim();

    let orgQuery = db.selectFrom('organizations')
      .select([
        'id', 'slug', 'name', 'custom_domain', 'custom_domain_verified_at',
        'status', 'plan', 'created_at', 'trial_ends_at',
      ])
      .where('deleted_at', 'is', null);
    if (statusFilter) orgQuery = orgQuery.where('status', '=', statusFilter as never);
    if (planFilter) orgQuery = orgQuery.where('plan', '=', planFilter as never);
    if (q) {
      orgQuery = orgQuery.where((eb) => eb.or([
        eb(sql`lower(name)`, 'like', `%${q}%`),
        eb(sql`lower(slug)`, 'like', `%${q}%`),
        eb(sql`lower(coalesce(custom_domain,''))`, 'like', `%${q}%`),
      ]));
    }
    const orgs = await orgQuery.orderBy('created_at', 'desc').limit(200).execute();
    const ids = orgs.map((o) => o.id);

    const now = Date.now();
    const since7 = new Date(now - 7 * DAY_MS);
    const since30 = new Date(now - 30 * DAY_MS);

    // Agregados agrupados (una query cada uno, filtradas al set de tenants).
    const [users, staff, att7, att30, actAct, lastAtt] = ids.length ? await Promise.all([
      db.selectFrom('users').select(['organization_id', db.fn.countAll<number>().as('n')])
        .where('deleted_at', 'is', null).where('organization_id', 'in', ids).groupBy('organization_id').execute(),
      db.selectFrom('staff_members').select(['organization_id', db.fn.countAll<number>().as('n')])
        .where('status', '=', 'active').where('organization_id', 'in', ids).groupBy('organization_id').execute(),
      db.selectFrom('attendance').select(['organization_id', db.fn.countAll<number>().as('n')])
        .where('registered_at', '>=', since7).where('organization_id', 'in', ids).groupBy('organization_id').execute(),
      db.selectFrom('attendance').select(['organization_id', db.fn.countAll<number>().as('n')])
        .where('registered_at', '>=', since30).where('organization_id', 'in', ids).groupBy('organization_id').execute(),
      db.selectFrom('activities').select(['organization_id', db.fn.countAll<number>().as('n')])
        .where('status', '=', 'activa').where('organization_id', 'in', ids).groupBy('organization_id').execute(),
      db.selectFrom('attendance').select(['organization_id', db.fn.max('registered_at').as('last')])
        .where('organization_id', 'in', ids).groupBy('organization_id').execute(),
    ]) : [[], [], [], [], [], []];

    const m = (rows: Array<{ organization_id: string; n?: number }>) =>
      new Map(rows.map((r) => [r.organization_id, Number(r.n ?? 0)]));
    const uM = m(users), sM = m(staff), a7 = m(att7), a30 = m(att30), acM = m(actAct);
    const lastM = new Map((lastAtt as Array<{ organization_id: string; last: unknown }>).map((r) => [r.organization_id, r.last]));

    const tenants: PlatformTenantSummary[] = orgs.map((o) => {
      const lastRaw = lastM.get(o.id);
      const lastActivityAt = lastRaw ? new Date(lastRaw as string).toISOString() : null;
      const base = {
        status: o.status, plan: o.plan,
        customDomain: o.custom_domain ?? null,
        customDomainVerified: !!o.custom_domain_verified_at,
        attendances30d: a30.get(o.id) ?? 0,
        lastActivityAt,
      };
      return {
        id: o.id, slug: o.slug, name: o.name,
        customDomain: base.customDomain,
        customDomainVerified: base.customDomainVerified,
        status: o.status as PlatformTenantSummary['status'],
        plan: o.plan as PlatformTenantSummary['plan'],
        createdAt: new Date(o.created_at as unknown as string).toISOString(),
        trialEndsAt: o.trial_ends_at ? new Date(o.trial_ends_at as unknown as string).toISOString() : null,
        usersCount: uM.get(o.id) ?? 0,
        staffCount: sM.get(o.id) ?? 0,
        attendances7d: a7.get(o.id) ?? 0,
        attendances30d: base.attendances30d,
        activitiesActive: acM.get(o.id) ?? 0,
        lastActivityAt,
        health: deriveHealth(base),
      };
    });

    const body: PlatformTenantsResponse = { tenants, total: tenants.length };
    return body;
  });

  // ── GET /platform/audit-log · bitácora global (keyset) ─────────────────────
  app.get('/platform/audit-log', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requirePlatformAdmin(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }

    const query = req.query as { tenant?: string; action?: string; since?: string; until?: string; cursor?: string; limit?: string };
    const limit = Math.min(Math.max(parseInt(query.limit ?? '50', 10) || 50, 1), 200);

    let q = db.selectFrom('platform_audit_log as al')
      .leftJoin('organizations as o', 'o.id', 'al.target_id')
      .select(['al.id as id', 'al.created_at as createdAt', 'o.slug as tenantSlug', 'o.name as tenantName',
        'al.actor_email_masked as actorEmailMasked', 'al.action as action',
        'al.target_type as targetType', 'al.target_label as targetLabel']);
    if (query.tenant) q = q.where('o.slug', '=', query.tenant);
    if (query.action) q = q.where('al.action', 'like', `${query.action}%`);
    if (query.since) q = q.where('al.created_at', '>=', new Date(query.since));
    if (query.until) q = q.where('al.created_at', '<', new Date(query.until));
    if (query.cursor) q = q.where('al.id', '<', query.cursor); // keyset: id descendente

    const rows = await q.orderBy('al.id', 'desc').limit(limit + 1).execute();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const entries: PlatformAuditEntry[] = page.map((r) => ({
      id: String(r.id), createdAt: new Date(r.createdAt as unknown as string).toISOString(),
      tenantSlug: r.tenantSlug ?? null, tenantName: r.tenantName ?? null,
      actorEmailMasked: r.actorEmailMasked ?? null, actorRole: 'platform_admin',
      action: r.action, targetType: r.targetType ?? null, targetLabel: r.targetLabel ?? null,
    }));
    const body: PlatformAuditResponse = { entries, nextCursor: hasMore ? String(page[page.length - 1]!.id) : null };
    return body;
  });

  // ── GET /platform/tenants/:id · detalle ────────────────────────────────────
  app.get('/platform/tenants/:id', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requirePlatformAdmin(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const id = (req.params as { id: string }).id;

    const org = await db.selectFrom('organizations')
      .select(['id', 'primary_color', 'secondary_color', 'logo_url', 'internal_notes'])
      .where('id', '=', id).where('deleted_at', 'is', null).limit(1).executeTakeFirst();
    if (!org) { reply.code(404); return { error: 'Tenant no encontrado.' }; }

    const summary = await loadTenantSummary(db, id);
    if (!summary) { reply.code(404); return { error: 'Tenant no encontrado.' }; }

    const staffRows = await db.selectFrom('staff_members')
      .select(['id', 'email', 'full_name', 'role', 'status'])
      .where('organization_id', '=', id)
      .orderBy('created_at', 'asc').limit(100).execute();
    const staff = staffRows.map((s) => ({
      id: s.id, email: s.email, fullName: s.full_name, role: s.role, status: s.status, lastLoginAt: null,
    }));

    const recentAudit = await recentAudit_forOrg(db, id, 12);
    const risks = deriveRisks(summary, staff.filter((s) => s.status === 'active').length);

    const body: PlatformTenantDetailResponse = {
      tenant: {
        ...summary,
        primaryColor: org.primary_color,
        secondaryColor: org.secondary_color,
        logoUrl: org.logo_url ?? null,
        internalNotes: org.internal_notes ?? null,
      },
      staff, recentAudit, risks,
    };
    return body;
  });

  // ── Acciones (owner de plataforma) · validadas + auditadas + rate-limited ───
  const guardAction = async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
    const db = getDb();
    const guard = await requirePlatformAdmin(db, req);
    if (!guard.ok) { reply.code(guard.status); return { db, guard: null as PlatformContext | null }; }
    if ((await actionLimiter.hit(`${guard.ctx.admin.id}:${req.ip}`)).limited) {
      reply.code(429); return { db, guard: null };
    }
    return { db, guard: guard.ctx };
  };
  const loadOrg = (db: DbClient, id: string) => db.selectFrom('organizations')
    .select(['id', 'slug', 'name', 'status', 'plan', 'trial_ends_at'])
    .where('id', '=', id).where('deleted_at', 'is', null).limit(1).executeTakeFirst();

  const finish = async (db: DbClient, ctx: PlatformContext, req: FastifyRequest, orgId: string, action: string, label: string, metadata: Record<string, unknown>): Promise<PlatformActionResponse | { error: string }> => {
    await writePlatformAudit(db, ctx, req, { action, orgId, targetLabel: label, metadata });
    const tenant = await loadTenantSummary(db, orgId);
    if (!tenant) return { error: 'Tenant no encontrado.' };
    return { ok: true, tenant };
  };

  app.post('/platform/tenants/:id/suspend', async (req: FastifyRequest, reply) => {
    const { db, guard } = await guardAction(req, reply);
    if (!guard) return { error: 'No autorizado.' };
    const id = (req.params as { id: string }).id;
    const org = await loadOrg(db, id);
    if (!org) { reply.code(404); return { error: 'Tenant no encontrado.' }; }
    await db.updateTable('organizations').set({ status: 'suspended', updated_at: new Date().toISOString() }).where('id', '=', id).execute();
    return finish(db, guard, req, id, 'platform.tenant.suspended', org.name, { from: org.status });
  });

  app.post('/platform/tenants/:id/reactivate', async (req: FastifyRequest, reply) => {
    const { db, guard } = await guardAction(req, reply);
    if (!guard) return { error: 'No autorizado.' };
    const id = (req.params as { id: string }).id;
    const org = await loadOrg(db, id);
    if (!org) { reply.code(404); return { error: 'Tenant no encontrado.' }; }
    await db.updateTable('organizations').set({ status: 'active', updated_at: new Date().toISOString() }).where('id', '=', id).execute();
    return finish(db, guard, req, id, 'platform.tenant.reactivated', org.name, { from: org.status });
  });

  app.patch('/platform/tenants/:id/plan', async (req: FastifyRequest, reply) => {
    const { db, guard } = await guardAction(req, reply);
    if (!guard) return { error: 'No autorizado.' };
    const parsed = PlatformPlanUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Plan inválido.' }; }
    const id = (req.params as { id: string }).id;
    const org = await loadOrg(db, id);
    if (!org) { reply.code(404); return { error: 'Tenant no encontrado.' }; }
    await db.updateTable('organizations').set({ plan: parsed.data.plan, updated_at: new Date().toISOString() }).where('id', '=', id).execute();
    return finish(db, guard, req, id, 'platform.tenant.plan_changed', org.name, { from: org.plan, to: parsed.data.plan });
  });

  app.patch('/platform/tenants/:id/trial', async (req: FastifyRequest, reply) => {
    const { db, guard } = await guardAction(req, reply);
    if (!guard) return { error: 'No autorizado.' };
    const parsed = PlatformTrialUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Fecha de trial inválida.' }; }
    const id = (req.params as { id: string }).id;
    const org = await loadOrg(db, id);
    if (!org) { reply.code(404); return { error: 'Tenant no encontrado.' }; }
    const trialEndsAt = parsed.data.trialEndsAt;
    // Extender el trial a futuro reactiva un tenant en 'trial_ended'.
    const reactivates = !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now() && org.status === 'trial_ended';
    await db.updateTable('organizations').set({
      trial_ends_at: trialEndsAt, updated_at: new Date().toISOString(),
      ...(reactivates ? { status: 'active' } : {}),
    }).where('id', '=', id).execute();
    return finish(db, guard, req, id, 'platform.tenant.trial_updated', org.name, { trialEndsAt, reactivated: reactivates });
  });

  app.patch('/platform/tenants/:id/notes', async (req: FastifyRequest, reply) => {
    const { db, guard } = await guardAction(req, reply);
    if (!guard) return { error: 'No autorizado.' };
    const parsed = PlatformNotesUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Notas inválidas.' }; }
    const id = (req.params as { id: string }).id;
    const org = await loadOrg(db, id);
    if (!org) { reply.code(404); return { error: 'Tenant no encontrado.' }; }
    await db.updateTable('organizations').set({ internal_notes: parsed.data.internalNotes, updated_at: new Date().toISOString() }).where('id', '=', id).execute();
    return finish(db, guard, req, id, 'platform.tenant.notes_updated', org.name, {});
  });
};

// Auditoría reciente de UN tenant (para el detalle).
async function recentAudit_forOrg(db: DbClient, orgId: string, limit: number): Promise<PlatformAuditEntry[]> {
  const rows = await db.selectFrom('tenant_audit_log as al')
    .leftJoin('organizations as o', 'o.id', 'al.organization_id')
    .select(['al.id as id', 'al.created_at as createdAt', 'o.slug as tenantSlug', 'o.name as tenantName',
      'al.actor_email_masked as actorEmailMasked', 'al.actor_role as actorRole',
      'al.action as action', 'al.target_type as targetType', 'al.target_label as targetLabel'])
    .where('al.organization_id', '=', orgId)
    .orderBy('al.id', 'desc').limit(limit).execute();
  return rows.map((r) => ({
    id: String(r.id), createdAt: new Date(r.createdAt as unknown as string).toISOString(),
    tenantSlug: r.tenantSlug ?? null, tenantName: r.tenantName ?? null,
    actorEmailMasked: r.actorEmailMasked ?? null, actorRole: r.actorRole ?? null,
    action: r.action, targetType: r.targetType ?? null, targetLabel: r.targetLabel ?? null,
  }));
}

function deriveRisks(s: PlatformTenantSummary, activeStaff: number): string[] {
  const r: string[] = [];
  if (s.status === 'suspended') r.push('Tenant suspendido.');
  if (s.status === 'trial_ended') r.push('Período de prueba terminado.');
  if (s.trialEndsAt && s.status === 'active') {
    const days = (new Date(s.trialEndsAt).getTime() - Date.now()) / DAY_MS;
    if (days < 0) r.push('Trial vencido pero el tenant sigue activo.');
    else if (days <= 3) r.push(`El trial vence en ${Math.ceil(days)} día(s).`);
  }
  if (s.customDomain && !s.customDomainVerified) r.push('Dominio personalizado sin verificar (DNS pendiente).');
  if (s.status === 'active' && s.attendances30d === 0) r.push('Sin asistencias en los últimos 30 días.');
  if (activeStaff === 0) r.push('Sin staff activo.');
  return r;
}
