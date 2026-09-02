// apps/api-v2/src/routes/biblio-reservations.ts · Módulo Biblioteca — F5 RESERVAS.
// Cola FIFO por título con expiración (mig 054); promoción perezosa en el
// service biblio-reservations. Estados: espera (posición derivada) → lista
// (copia apartada + ventana de retiro) → cumplida/cancelada/vencida.
//   GET  /biblio/reservations          · lista (tab: activas|espera|listas|historial)
//   GET  /biblio/reservations/summary  · resumen + próximas para retirar
//   POST /biblio/reservations          · reservar (carné + título)
//   POST /biblio/reservations/:id/cancel · cancelar (libera y promueve)
//   GET  /biblio/readers/:id/reservations · reservas del lector (panel Lectores)
// La ENTREGA de una 'lista' se hace prestando el ejemplar apartado en
// Circulación (biblio-loans marca la reserva cumplida).
// Roles owner/admin/biblioteca · withTenant (RLS) · auditado.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, withTenant, type DbClient } from '@contan2/db';
import {
  BiblioReservationCreateSchema,
  type BiblioReservation, type BiblioReservationsListResponse, type BiblioReservationsSummary,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { maintainReservations, promoteTitleQueue, PICKUP_DAYS, MAX_ACTIVE_RESERVATIONS } from '../services/biblio-reservations.js';

const BIBLIO_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'biblioteca']);
const limiter = createRateLimiter({ max: 240, windowMs: 60_000, prefix: endpointPrefix('biblio-reservations') });

const TZ = 'America/Santo_Domingo';
const PAGE_SIZE_MAX = 50;

type Guarded = { orgId: string; staffId: string; staffRole: string };

async function audit(db: DbClient, g: Guarded, action: string, targetId: string, label: string, metadata: Record<string, unknown> = {}) {
  await db.insertInto('tenant_audit_log').values({
    organization_id: g.orgId, actor_staff_id: g.staffId, actor_email_masked: null,
    actor_role: g.staffRole, action, target_type: 'biblio', target_id: targetId,
    target_label: label.slice(0, 200), metadata: JSON.stringify(metadata),
  }).execute();
}

interface ResRow {
  id: string; seq: string | number; status: string; created_at: Date | string;
  ready_at: Date | string | null; expires_at: Date | string | null;
  position: string | number | null;
  user_id: string; user_code: string; first_name: string; last_name: string;
  title_id: string; title: string; authors: unknown; cover_url: string | null;
  inventory_code: string | null; site_name: string | null; shelf: string | null;
}
function toReservation(r: ResRow): BiblioReservation {
  return {
    id: r.id,
    code: `R-${String(r.seq).padStart(6, '0')}`,
    status: r.status as BiblioReservation['status'],
    position: r.position !== null ? Number(r.position) : null,
    createdAt: new Date(r.created_at as string).toISOString(),
    readyAt: r.ready_at ? new Date(r.ready_at as string).toISOString() : null,
    expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null,
    userId: r.user_id, userCode: r.user_code, userFirstName: r.first_name, userLastName: r.last_name,
    titleId: r.title_id, title: r.title,
    authors: Array.isArray(r.authors) ? (r.authors as string[]) : [],
    coverUrl: r.cover_url,
    inventoryCode: r.inventory_code, siteName: r.site_name, shelf: r.shelf,
  };
}

// Posición FIFO derivada (solo tiene sentido en 'espera').
const positionSql = sql<string | null>`case when r.status = 'espera' then (
  select count(*) + 1 from biblio_reservations r2
  where r2.organization_id = r.organization_id and r2.title_id = r.title_id
    and r2.status = 'espera'
    and (r2.created_at, r2.seq) < (r.created_at, r.seq)
) else null end`;

const RES_COLS = [
  'r.id', 'r.seq', 'r.status', 'r.created_at', 'r.ready_at', 'r.expires_at',
  'r.user_id', 'u.code as user_code', 'u.first_name', 'u.last_name',
  'r.title_id', 't.title', 't.authors', 't.cover_url as cover_url',
  'i.inventory_code as inventory_code', 's.name as site_name', 'i.shelf as shelf',
] as const;

export const biblioReservationsRoute: FastifyPluginAsync = async (app) => {
  async function gate(req: FastifyRequest, reply: { code: (n: number) => void }): Promise<{ ok: true; g: Guarded } | { ok: false; body: { error: string } }> {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { ok: false, body: { error: guard.error } }; }
    if (!BIBLIO_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { ok: false, body: { error: 'No tenés permiso para el módulo Biblioteca.' } }; }
    if ((await limiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) { reply.code(429); return { ok: false, body: { error: 'Demasiadas operaciones seguidas. Esperá un momento.' } }; }
    return { ok: true, g: { orgId: guard.ctx.org.id, staffId: guard.ctx.staff.id, staffRole: guard.ctx.staff.role } };
  }

  function resBase(db: DbClient, orgId: string) {
    return db.selectFrom('biblio_reservations as r')
      .innerJoin('users as u', 'u.id', 'r.user_id')
      .innerJoin('biblio_titles as t', 't.id', 'r.title_id')
      .leftJoin('biblio_items as i', 'i.id', 'r.ready_item_id')
      .leftJoin('biblio_sites as s', 's.id', 'i.site_id')
      .where('r.organization_id', '=', orgId);
  }

  // ── Lista (tabs) ───────────────────────────────────────────────────────────
  app.get('/biblio/reservations', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const q = req.query as Record<string, unknown>;
    const tab = typeof q.tab === 'string' ? q.tab : 'activas'; // activas|espera|listas|historial
    const term = typeof q.q === 'string' ? q.q.trim().slice(0, 120) : '';
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(q.pageSize) || 20));

    return withTenant(getDb(), r.g.orgId, async (db) => {
      await maintainReservations(db, r.g.orgId);
      let base = resBase(db, r.g.orgId);
      if (tab === 'activas') base = base.where('r.status', 'in', ['espera', 'lista']);
      if (tab === 'espera') base = base.where('r.status', '=', 'espera');
      if (tab === 'listas') base = base.where('r.status', '=', 'lista');
      if (tab === 'historial') base = base.where('r.status', 'in', ['cumplida', 'cancelada', 'vencida']);
      if (term) {
        const like = `%${term.toLowerCase()}%`;
        base = base.where((eb) => eb.or([
          sql<boolean>`lower(u.first_name || ' ' || u.last_name) like ${like}`,
          sql<boolean>`lower(u.code) like ${like}`,
          sql<boolean>`lower(t.title) like ${like}`,
          sql<boolean>`lower(coalesce(i.inventory_code, '')) like ${like}`,
          sql<boolean>`('r-' || lpad(r.seq::text, 6, '0')) like ${like}`,
        ]));
      }
      const totalRow = await base.select(db.fn.countAll<string>().as('n')).executeTakeFirst();
      const rows = await base.select([...RES_COLS]).select(positionSql.as('position'))
        .orderBy(sql`case r.status when 'lista' then 0 when 'espera' then 1 else 2 end`)
        .orderBy('r.created_at', tab === 'historial' ? 'desc' : 'asc')
        .limit(pageSize).offset((page - 1) * pageSize)
        .execute();
      const body: BiblioReservationsListResponse = {
        reservations: rows.map((x) => toReservation(x as unknown as ResRow)),
        total: Number(totalRow?.n ?? 0), page, pageSize,
      };
      return body;
    });
  });

  // ── Resumen (carril derecho) ───────────────────────────────────────────────
  app.get('/biblio/reservations/summary', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      await maintainReservations(db, r.g.orgId);
      const row = await db.selectFrom('biblio_reservations')
        .where('organization_id', '=', r.g.orgId)
        .select([
          sql<string>`count(*) filter (where status in ('espera', 'lista'))`.as('activas'),
          sql<string>`count(*) filter (where status = 'espera')`.as('espera'),
          sql<string>`count(*) filter (where status = 'lista')`.as('listas'),
          sql<string>`count(*) filter (where status = 'lista' and (expires_at at time zone ${TZ})::date = (now() at time zone ${TZ})::date)`.as('hoy'),
        ]).executeTakeFirst();
      const proximas = await resBase(db, r.g.orgId)
        .where('r.status', '=', 'lista')
        .select(['r.id', 't.title', 't.cover_url as cover_url', 'u.first_name', 'u.last_name', 'r.expires_at'])
        .orderBy('r.expires_at', 'asc').limit(6).execute();
      const body: BiblioReservationsSummary = {
        activas: Number(row?.activas ?? 0), enEspera: Number(row?.espera ?? 0),
        paraRetirar: Number(row?.listas ?? 0), vencenHoy: Number(row?.hoy ?? 0),
        proximas: proximas.map((p) => ({
          id: p.id, title: p.title, coverUrl: p.cover_url,
          userFirstName: p.first_name, userLastName: p.last_name,
          expiresAt: new Date(p.expires_at as unknown as string).toISOString(),
        })),
        policy: { pickupDays: PICKUP_DAYS, maxActivePerReader: MAX_ACTIVE_RESERVATIONS },
      };
      return body;
    });
  });

  // ── Reservar ───────────────────────────────────────────────────────────────
  app.post('/biblio/reservations', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const parsed = BiblioReservationCreateSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.', details: parsed.error.flatten().fieldErrors }; }
    const p = parsed.data;
    if (!p.readerCode && !p.userId) { reply.code(400); return { error: 'Falta el carné del lector.' }; }

    return withTenant(getDb(), r.g.orgId, async (db) => {
      let userQ = db.selectFrom('users as u')
        .leftJoin('biblio_member_profiles as pr', (join) => join
          .onRef('pr.user_id', '=', 'u.id').on('pr.organization_id', '=', r.g.orgId))
        .select(['u.id', 'u.code', 'u.first_name', 'u.last_name', 'u.deleted_at', 'pr.suspended_at'])
        .where('u.organization_id', '=', r.g.orgId);
      userQ = p.userId
        ? userQ.where('u.id', '=', p.userId)
        : userQ.where(sql<boolean>`upper(u.code) = ${p.readerCode!.toUpperCase()}`);
      const user = await userQ.executeTakeFirst();
      if (!user) { reply.code(404); return { error: 'No encontramos ese carné en el padrón.' }; }
      if (user.deleted_at) { reply.code(409); return { error: 'Esa persona está archivada en el padrón.' }; }
      if (user.suspended_at) { reply.code(409); return { error: 'El servicio de biblioteca de esta persona está suspendido.' }; }

      const title = await db.selectFrom('biblio_titles').select(['id', 'title'])
        .where('organization_id', '=', r.g.orgId).where('id', '=', p.titleId)
        .where('deleted_at', 'is', null).executeTakeFirst();
      if (!title) { reply.code(404); return { error: 'Título no encontrado.' }; }

      // Ya lo tiene prestado → no tiene sentido reservar.
      const yaPrestado = await db.selectFrom('biblio_loans as l')
        .innerJoin('biblio_items as i', 'i.id', 'l.item_id')
        .select('l.id')
        .where('l.organization_id', '=', r.g.orgId).where('l.user_id', '=', user.id)
        .where('i.title_id', '=', p.titleId).where('l.returned_at', 'is', null)
        .executeTakeFirst();
      if (yaPrestado) { reply.code(409); return { error: 'Esa persona ya tiene esta obra en préstamo.' }; }

      const activas = await db.selectFrom('biblio_reservations')
        .select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', r.g.orgId).where('user_id', '=', user.id)
        .where('status', 'in', ['espera', 'lista'])
        .executeTakeFirst();
      if (Number(activas?.n ?? 0) >= MAX_ACTIVE_RESERVATIONS) {
        reply.code(409); return { error: `Límite alcanzado: ${MAX_ACTIVE_RESERVATIONS} reservas activas por lector.` };
      }

      try {
        const ins = await db.insertInto('biblio_reservations').values({
          organization_id: r.g.orgId, title_id: p.titleId, user_id: user.id,
          notes: p.notes?.trim() || null, created_by_staff_id: r.g.staffId,
        }).returning('id').executeTakeFirstOrThrow();

        // Si hay copia libre, la reserva queda 'lista' al instante.
        await promoteTitleQueue(db, r.g.orgId, p.titleId);

        await audit(db, r.g, 'biblio.reservation.created', ins.id,
          `${title.title} → ${user.first_name} ${user.last_name}`, { titleId: p.titleId, userId: user.id });

        const row = await resBase(db, r.g.orgId).where('r.id', '=', ins.id)
          .select([...RES_COLS]).select(positionSql.as('position')).executeTakeFirstOrThrow();
        reply.code(201);
        return { reservation: toReservation(row as unknown as ResRow) };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') {
          reply.code(409);
          return { error: 'Esa persona ya tiene una reserva activa de esta obra.' };
        }
        throw e;
      }
    });
  });

  // ── Cancelar (libera la copia y promueve al siguiente) ─────────────────────
  app.post('/biblio/reservations/:id/cancel', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const id = (req.params as { id: string }).id;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const res = await db.selectFrom('biblio_reservations as r')
        .innerJoin('biblio_titles as t', 't.id', 'r.title_id')
        .select(['r.id', 'r.status', 'r.title_id', 't.title'])
        .where('r.organization_id', '=', r.g.orgId).where('r.id', '=', id).executeTakeFirst();
      if (!res) { reply.code(404); return { error: 'Reserva no encontrada.' }; }
      if (res.status !== 'espera' && res.status !== 'lista') {
        reply.code(409); return { error: 'Esa reserva ya no está activa.' };
      }
      await db.updateTable('biblio_reservations')
        .set({ status: 'cancelada', cancelled_at: sql`now()`, updated_at: sql`now()` })
        .where('organization_id', '=', r.g.orgId).where('id', '=', id)
        .execute();
      await promoteTitleQueue(db, r.g.orgId, res.title_id);
      await audit(db, r.g, 'biblio.reservation.cancelled', id, res.title);
      const row = await resBase(db, r.g.orgId).where('r.id', '=', id)
        .select([...RES_COLS]).select(positionSql.as('position')).executeTakeFirstOrThrow();
      return { reservation: toReservation(row as unknown as ResRow) };
    });
  });

  // ── Reservas de un lector (panel de Lectores · tab Reservas) ───────────────
  app.get('/biblio/readers/:id/reservations', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      await maintainReservations(db, r.g.orgId);
      const rows = await resBase(db, r.g.orgId)
        .where('r.user_id', '=', (req.params as { id: string }).id)
        .select([...RES_COLS]).select(positionSql.as('position'))
        .orderBy(sql`r.status in ('espera', 'lista')`, 'desc')
        .orderBy('r.created_at', 'desc')
        .limit(30).execute();
      return { reservations: rows.map((x) => toReservation(x as unknown as ResRow)) };
    });
  });
};
