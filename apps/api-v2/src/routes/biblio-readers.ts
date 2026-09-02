// apps/api-v2/src/routes/biblio-readers.ts · Módulo Biblioteca — LECTORES.
// Decisión cerrada: el lector ES el padrón (tabla users, mismo carné QR); el
// perfil bibliotecario (biblio_member_profiles, mig 052) agrega tipo de lector
// empleado/no_empleado + código RRHH, cédula, observaciones y suspensión del
// servicio de biblioteca (independiente del archivado del padrón).
//   GET  /biblio/readers          · búsqueda paginada (q, type, estado)
//   GET  /biblio/readers/stats    · KPIs (total/activos/nuevos del mes/suspendidos)
//   GET  /biblio/readers/:id      · detalle
//   POST /biblio/readers          · alta al padrón (code real, sin email de credencial)
//   PATCH /biblio/readers/:id/profile · upsert del perfil bibliotecario
//   POST /biblio/readers/:id/suspend  · suspender / reactivar el servicio
// Roles: owner/admin/biblioteca. Todo dentro de withTenant (RLS); auditado.

import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, withTenant, type DbClient } from '@contan2/db';
import { generateUserCode } from '@contan2/codes';
import {
  BiblioReaderProfileInputSchema, BiblioReaderSuspendInputSchema, BiblioReaderCreateSchema,
  type BiblioReader, type BiblioReadersListResponse, type BiblioReadersStatsResponse,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';

const BIBLIO_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'biblioteca']);
const limiter = createRateLimiter({ max: 240, windowMs: 60_000, prefix: endpointPrefix('biblio-readers') });

const TZ = 'America/Santo_Domingo';
const PAGE_SIZE_MAX = 50;

type Guarded = { orgId: string; staffId: string; staffRole: string; codePrefix: string };

async function audit(db: DbClient, g: Guarded, action: string, targetId: string, label: string, metadata: Record<string, unknown> = {}) {
  await db.insertInto('tenant_audit_log').values({
    organization_id: g.orgId, actor_staff_id: g.staffId, actor_email_masked: null,
    actor_role: g.staffRole, action, target_type: 'biblio', target_id: targetId,
    target_label: label.slice(0, 200), metadata: JSON.stringify(metadata),
  }).execute();
}

// Fila users LEFT JOIN biblio_member_profiles → contrato.
interface ReaderRow {
  id: string; code: string; first_name: string; last_name: string;
  email: string | null; phone: string | null; visit_count: number;
  created_at: Date | string; deleted_at: Date | string | null;
  reader_type: string | null; employee_code: string | null; document: string | null;
  notes: string | null; suspended_at: Date | string | null; suspended_reason: string | null;
}
function toReader(r: ReaderRow): BiblioReader {
  return {
    userId: r.id, code: r.code, firstName: r.first_name, lastName: r.last_name,
    email: r.email, phone: r.phone, visitCount: Number(r.visit_count),
    registeredAt: new Date(r.created_at as string).toISOString(),
    archived: r.deleted_at !== null,
    readerType: r.reader_type === 'empleado' ? 'empleado' : 'no_empleado',
    employeeCode: r.employee_code, document: r.document, notes: r.notes,
    suspendedAt: r.suspended_at ? new Date(r.suspended_at as string).toISOString() : null,
    suspendedReason: r.suspended_reason,
  };
}

const READER_COLS = [
  'u.id', 'u.code', 'u.first_name', 'u.last_name', 'u.email', 'u.phone',
  'u.visit_count', 'u.created_at', 'u.deleted_at',
  'p.reader_type', 'p.employee_code', 'p.document', 'p.notes',
  'p.suspended_at', 'p.suspended_reason',
] as const;

export const biblioReadersRoute: FastifyPluginAsync = async (app) => {
  async function gate(req: FastifyRequest, reply: { code: (n: number) => void }): Promise<{ ok: true; g: Guarded } | { ok: false; body: { error: string } }> {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { ok: false, body: { error: guard.error } }; }
    if (!BIBLIO_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { ok: false, body: { error: 'No tenés permiso para el módulo Biblioteca.' } }; }
    if ((await limiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) { reply.code(429); return { ok: false, body: { error: 'Demasiadas operaciones seguidas. Esperá un momento.' } }; }
    return { ok: true, g: { orgId: guard.ctx.org.id, staffId: guard.ctx.staff.id, staffRole: guard.ctx.staff.role, codePrefix: guard.ctx.org.codePrefix } };
  }

  function baseQuery(db: DbClient, orgId: string) {
    return db.selectFrom('users as u')
      .leftJoin('biblio_member_profiles as p', (join) => join
        .onRef('p.user_id', '=', 'u.id')
        .on('p.organization_id', '=', orgId))
      .where('u.organization_id', '=', orgId);
  }

  // ── Lista paginada ─────────────────────────────────────────────────────────
  app.get('/biblio/readers', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const q = req.query as Record<string, unknown>;
    const term = typeof q.q === 'string' ? q.q.trim().slice(0, 120) : '';
    const type = q.type === 'empleado' || q.type === 'no_empleado' ? q.type : null;
    const estado = typeof q.estado === 'string' ? q.estado : ''; // '' | activo | suspendido | archivado
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(q.pageSize) || 20));

    return withTenant(getDb(), r.g.orgId, async (db) => {
      let base = baseQuery(db, r.g.orgId);
      // Por defecto los archivados del padrón quedan fuera (solo con estado=archivado).
      if (estado === 'archivado') base = base.where('u.deleted_at', 'is not', null);
      else base = base.where('u.deleted_at', 'is', null);
      if (estado === 'suspendido') base = base.where('p.suspended_at', 'is not', null);
      if (estado === 'activo') base = base.where('p.suspended_at', 'is', null);
      if (type === 'empleado') base = base.where('p.reader_type', '=', 'empleado');
      if (type === 'no_empleado') base = base.where(sql<boolean>`coalesce(p.reader_type, 'no_empleado') = 'no_empleado'`);
      if (term) {
        const like = `%${term.toLowerCase()}%`;
        const digits = term.replace(/\D/g, '');
        base = base.where((eb) => eb.or([
          sql<boolean>`lower(u.first_name || ' ' || u.last_name) like ${like}`,
          sql<boolean>`lower(coalesce(u.email, '')) like ${like}`,
          sql<boolean>`lower(u.code) like ${like}`,
          sql<boolean>`lower(coalesce(p.document, '')) like ${like}`,
          sql<boolean>`lower(coalesce(p.employee_code, '')) like ${like}`,
          ...(digits.length >= 4 ? [sql<boolean>`regexp_replace(coalesce(u.phone,''), '[^0-9]', '', 'g') like ${'%' + digits + '%'}`] : []),
        ]));
      }
      const totalRow = await base.select(db.fn.countAll<string>().as('n')).executeTakeFirst();
      const rows = await base.select([...READER_COLS])
        .orderBy('u.created_at', 'desc')
        .limit(pageSize).offset((page - 1) * pageSize)
        .execute();
      const body: BiblioReadersListResponse = {
        readers: rows.map((x) => toReader(x as unknown as ReaderRow)),
        total: Number(totalRow?.n ?? 0), page, pageSize,
      };
      return body;
    });
  });

  // ── KPIs ───────────────────────────────────────────────────────────────────
  app.get('/biblio/readers/stats', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const row = await db.selectFrom('users as u')
        .leftJoin('biblio_member_profiles as p', (join) => join
          .onRef('p.user_id', '=', 'u.id')
          .on('p.organization_id', '=', r.g.orgId))
        .where('u.organization_id', '=', r.g.orgId)
        .where('u.deleted_at', 'is', null)
        .select([
          db.fn.countAll<string>().as('total'),
          sql<string>`count(*) filter (where p.suspended_at is null)`.as('active'),
          sql<string>`count(*) filter (where p.suspended_at is not null)`.as('suspended'),
          sql<string>`count(*) filter (where (u.created_at at time zone ${TZ}) >= date_trunc('month', now() at time zone ${TZ}))`.as('newmonth'),
        ])
        .executeTakeFirst();
      const body: BiblioReadersStatsResponse = {
        total: Number(row?.total ?? 0), active: Number(row?.active ?? 0),
        newThisMonth: Number(row?.newmonth ?? 0), suspended: Number(row?.suspended ?? 0),
      };
      return body;
    });
  });

  // ── Detalle ────────────────────────────────────────────────────────────────
  app.get('/biblio/readers/:id', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const row = await baseQuery(db, r.g.orgId)
        .where('u.id', '=', (req.params as { id: string }).id)
        .select([...READER_COLS]).executeTakeFirst();
      if (!row) { reply.code(404); return { error: 'Lector no encontrado.' }; }
      return { reader: toReader(row as unknown as ReaderRow) };
    });
  });

  // ── Alta al padrón (carné real, silencioso — sin email de credencial) ──────
  app.post('/biblio/readers', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const parsed = BiblioReaderCreateSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.', details: parsed.error.flatten().fieldErrors }; }
    const p = parsed.data;

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const email = p.email?.trim().toLowerCase() || null;
      try {
        // Loop por colisión de code (mismo patrón que Puerta/check-in).
        let user: { id: string; code: string } | undefined;
        for (let attempt = 0; attempt < 5 && !user; attempt += 1) {
          user = await db.insertInto('users').values({
            id: randomUUID(), organization_id: r.g.orgId,
            code: generateUserCode(r.g.codePrefix),
            first_name: p.firstName.trim(), last_name: p.lastName.trim(),
            email, phone: p.phone?.trim() || null,
          }).onConflict((oc) => oc.columns(['organization_id', 'code']).doNothing())
            .returning(['id', 'code']).executeTakeFirst();
        }
        if (!user) { reply.code(500); return { error: 'No se pudo generar el carné. Reintentá.' }; }

        await db.insertInto('biblio_member_profiles').values({
          organization_id: r.g.orgId, user_id: user.id,
          reader_type: p.readerType,
          employee_code: p.readerType === 'empleado' ? (p.employeeCode?.trim() || null) : null,
          document: p.document?.trim() || null,
        }).execute();

        await audit(db, r.g, 'biblio.reader.created', user.id, `${p.firstName} ${p.lastName}`, { readerType: p.readerType });
        const row = await baseQuery(db, r.g.orgId).where('u.id', '=', user.id).select([...READER_COLS]).executeTakeFirstOrThrow();
        reply.code(201);
        return { reader: toReader(row as unknown as ReaderRow) };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') {
          reply.code(409);
          return { error: 'Ya existe una persona del padrón con ese correo.' };
        }
        throw e;
      }
    });
  });

  // ── Perfil bibliotecario (upsert) ──────────────────────────────────────────
  app.patch('/biblio/readers/:id/profile', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const parsed = BiblioReaderProfileInputSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.', details: parsed.error.flatten().fieldErrors }; }
    const p = parsed.data;
    const id = (req.params as { id: string }).id;

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const user = await db.selectFrom('users').select(['id', 'first_name', 'last_name'])
        .where('organization_id', '=', r.g.orgId).where('id', '=', id).executeTakeFirst();
      if (!user) { reply.code(404); return { error: 'Lector no encontrado.' }; }

      await db.insertInto('biblio_member_profiles').values({
        organization_id: r.g.orgId, user_id: id,
        reader_type: p.readerType,
        employee_code: p.readerType === 'empleado' ? (p.employeeCode?.trim() || null) : null,
        document: p.document?.trim() || null,
        notes: p.notes?.trim() || null,
      }).onConflict((oc) => oc.columns(['organization_id', 'user_id']).doUpdateSet({
        reader_type: p.readerType,
        employee_code: p.readerType === 'empleado' ? (p.employeeCode?.trim() || null) : null,
        document: p.document?.trim() || null,
        notes: p.notes?.trim() || null,
        updated_at: sql`now()`,
      })).execute();

      await audit(db, r.g, 'biblio.reader.profile_updated', id, `${user.first_name} ${user.last_name}`, { readerType: p.readerType });
      const row = await baseQuery(db, r.g.orgId).where('u.id', '=', id).select([...READER_COLS]).executeTakeFirstOrThrow();
      return { reader: toReader(row as unknown as ReaderRow) };
    });
  });

  // ── Suspender / reactivar el servicio de biblioteca ────────────────────────
  app.post('/biblio/readers/:id/suspend', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const parsed = BiblioReaderSuspendInputSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.' }; }
    const p = parsed.data;
    const id = (req.params as { id: string }).id;

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const user = await db.selectFrom('users').select(['id', 'first_name', 'last_name'])
        .where('organization_id', '=', r.g.orgId).where('id', '=', id).executeTakeFirst();
      if (!user) { reply.code(404); return { error: 'Lector no encontrado.' }; }

      await db.insertInto('biblio_member_profiles').values({
        organization_id: r.g.orgId, user_id: id,
        suspended_at: p.suspended ? sql`now()` : null,
        suspended_reason: p.suspended ? (p.reason?.trim() || null) : null,
      }).onConflict((oc) => oc.columns(['organization_id', 'user_id']).doUpdateSet({
        suspended_at: p.suspended ? sql`now()` : null,
        suspended_reason: p.suspended ? (p.reason?.trim() || null) : null,
        updated_at: sql`now()`,
      })).execute();

      await audit(db, r.g, p.suspended ? 'biblio.reader.suspended' : 'biblio.reader.reactivated',
        id, `${user.first_name} ${user.last_name}`, { reason: p.reason ?? null });
      const row = await baseQuery(db, r.g.orgId).where('u.id', '=', id).select([...READER_COLS]).executeTakeFirstOrThrow();
      return { reader: toReader(row as unknown as ReaderRow) };
    });
  });
};
