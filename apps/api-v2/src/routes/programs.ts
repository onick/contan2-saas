// apps/api-v2/src/routes/programs.ts · vocabulario de PROGRAMAS/CICLOS por tenant.
//   GET  /programs?year=YYYY  · lista activos + edición derivada para ese año
//   POST /programs            · alta rápida (owner/admin): name + cíclico + ancla
// La edición NO se guarda por actividad: se deriva del año + el ancla del
// programa (ver services/programs/edition.ts). Tenant-scoped, auditado.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, withTenant, type DbClient } from '@contan2/db';
import {
  ProgramCreateRequestSchema,
  type Program,
  type ProgramsResponse,
} from '@contan2/contracts';
import { requireTenantStaff, requireRole } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { programSlug, editionFor, editionLabel } from '../services/programs/edition.js';

const MANAGER_ROLES = new Set(['owner', 'admin']);
const programsLimiter = createRateLimiter({ max: 60, windowMs: 60_000, prefix: endpointPrefix('programs') });

type ProgramRow = {
  id: string; name: string; slug: string; is_cyclical: boolean;
  edition_anchor_year: number | null; edition_anchor_number: number | null;
  edition_noun: string; active: boolean; sort_order: number;
};

function toProgram(r: ProgramRow, year: number): Program {
  const cfg = {
    is_cyclical: r.is_cyclical,
    edition_anchor_year: r.edition_anchor_year,
    edition_anchor_number: r.edition_anchor_number,
    edition_noun: r.edition_noun,
  };
  return {
    id: r.id, name: r.name, slug: r.slug, isCyclical: r.is_cyclical,
    editionAnchorYear: r.edition_anchor_year, editionAnchorNumber: r.edition_anchor_number,
    editionNoun: r.edition_noun, active: r.active, sortOrder: r.sort_order,
    edition: editionFor(cfg, year),
    editionLabel: editionLabel(cfg, year),
  };
}

async function listActive(db: DbClient, orgId: string): Promise<ProgramRow[]> {
  return db.selectFrom('programs')
    .select(['id', 'name', 'slug', 'is_cyclical', 'edition_anchor_year', 'edition_anchor_number', 'edition_noun', 'active', 'sort_order'])
    .where('organization_id', '=', orgId).where('active', '=', true)
    .orderBy('sort_order', 'asc').orderBy('name', 'asc')
    .execute() as Promise<ProgramRow[]>;
}

export const programsRoute: FastifyPluginAsync = async (app) => {
  // ── GET /programs ───────────────────────────────────────────────────────────
  app.get('/programs', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const q = req.query as Record<string, unknown>;
    const yearRaw = Number(q.year);
    const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : new Date().getFullYear();
    const rows = await listActive(db, guard.ctx.org.id);
    const body: ProgramsResponse = { programs: rows.map((r) => toProgram(r, year)) };
    return body;
  });

  // ── POST /programs (alta rápida) ────────────────────────────────────────────
  app.post('/programs', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), MANAGER_ROLES, 'No tenés permiso para crear programas.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    if ((await programsLimiter.hit(`${orgId}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas altas seguidas. Esperá un momento.' }; }

    const parsed = ProgramCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos de programa inválidos.' }; }
    const { name, isCyclical, editionAnchorYear, editionAnchorNumber, editionNoun } = parsed.data;
    const slug = programSlug(name);
    if (!slug) { reply.code(400); return { error: 'Nombre de programa inválido.' }; }
    // Un cíclico necesita ancla completa (año + número) para derivar la edición.
    if (isCyclical && (editionAnchorYear == null || editionAnchorNumber == null)) {
      reply.code(400); return { error: 'Un ciclo necesita año y número de edición de referencia.' };
    }

    // Idempotencia amable: si ya existe (mismo slug), devolvemos el existente.
    const existing = await db.selectFrom('programs')
      .select(['id', 'name', 'slug', 'is_cyclical', 'edition_anchor_year', 'edition_anchor_number', 'edition_noun', 'active', 'sort_order'])
      .where('organization_id', '=', orgId).where('slug', '=', slug).executeTakeFirst();
    if (existing) {
      reply.code(200);
      return { program: toProgram(existing as ProgramRow, editionAnchorYear ?? new Date().getFullYear()) };
    }

    const maxSort = await db.selectFrom('programs').select((eb) => eb.fn.max('sort_order').as('m'))
      .where('organization_id', '=', orgId).executeTakeFirst();
    const nextSort = (Number(maxSort?.m ?? 0)) + 10;

    const inserted = await db.insertInto('programs').values({
      organization_id: orgId,
      name: name.trim(),
      slug,
      is_cyclical: isCyclical ?? false,
      edition_anchor_year: isCyclical ? (editionAnchorYear ?? null) : null,
      edition_anchor_number: isCyclical ? (editionAnchorNumber ?? null) : null,
      edition_noun: editionNoun?.trim() || 'ciclo',
      active: true,
      sort_order: nextSort,
    }).returning(['id', 'name', 'slug', 'is_cyclical', 'edition_anchor_year', 'edition_anchor_number', 'edition_noun', 'active', 'sort_order'])
      .executeTakeFirstOrThrow();

    await db.insertInto('tenant_audit_log').values({
      organization_id: orgId,
      actor_staff_id: guard.ctx.staff.id,
      actor_email_masked: null,
      actor_role: guard.ctx.staff.role,
      action: 'program.created',
      target_type: 'program',
      target_id: inserted.id,
      metadata: JSON.stringify({ name: inserted.name, isCyclical: inserted.is_cyclical }),
    }).execute();

    reply.code(201);
    return { program: toProgram(inserted as ProgramRow, editionAnchorYear ?? new Date().getFullYear()) };
    });
  });
};
