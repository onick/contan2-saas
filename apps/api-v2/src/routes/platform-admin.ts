// apps/api-v2/src/routes/platform-admin.ts · panel del super-admin (cross-tenant).
// TODO tras requirePlatformAdmin. Queries cross-tenant (sin filtro
// organization_id) INTENCIONALES y aisladas acá — nunca en rutas de tenant.
//   GET /platform/kpis     · KPIs globales + auditoría reciente.
//   GET /platform/tenants  · lista de tenants con resumen operativo + health.
// Set-based (sin N+1): agregados agrupados por organización y merge en memoria.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, type DbClient } from '@contan2/db';
import type {
  PlatformKpisResponse,
  PlatformTenantsResponse,
  PlatformTenantSummary,
  PlatformAuditEntry,
  TenantHealth,
} from '@contan2/contracts';
import { requirePlatformAdmin } from '../platform-guard.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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
};
