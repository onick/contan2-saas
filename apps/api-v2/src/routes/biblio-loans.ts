// apps/api-v2/src/routes/biblio-loans.ts · Módulo Biblioteca — F2 CIRCULACIÓN.
// Ledger inmutable (mig 053): "vencido" SE DERIVA (due_at < now, sin devolver),
// nunca es flag. Flujo de 2 escaneos: carné del lector + código del ejemplar.
//   GET  /biblio/loans            · lista (tab: activos|vencidos|renovados|devueltos|todos; q por lector/ejemplar)
//   GET  /biblio/loans/summary    · resumen de hoy + alertas + política
//   GET  /biblio/loans/precheck   · valida carné/ejemplar ANTES de confirmar
//   POST /biblio/loans            · prestar (domicilio 14 días · sala mismo día)
//   POST /biblio/returns          · devolver por código de ejemplar (escaneo)
//   POST /biblio/loans/:id/renew  · renovar (+14 días, máx 2)
//   GET  /biblio/readers/:id/loans · préstamos del lector (panel de Lectores)
// Política F2 (constantes; configurable por tenant en fase posterior):
// 14 días · máx 2 renovaciones · máx 3 préstamos abiertos por lector.
// Roles owner/admin/biblioteca · withTenant (RLS) · auditado.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, withTenant, type DbClient } from '@contan2/db';
import {
  BiblioLoanCreateSchema, BiblioReturnSchema,
  type BiblioLoan, type BiblioLoansListResponse, type BiblioCirculationSummary,
  type BiblioLoanPrecheckResponse, type BiblioPhysicalStatus,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';

const BIBLIO_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'biblioteca']);
const limiter = createRateLimiter({ max: 240, windowMs: 60_000, prefix: endpointPrefix('biblio-loans') });

const TZ = 'America/Santo_Domingo';
const PAGE_SIZE_MAX = 50;
// Política F2 (plan aprobado: por material×lector en fase de configuración).
const LOAN_DAYS = 14;
const RENEW_DAYS = 14;
const MAX_RENEWALS = 2;
const MAX_OPEN_LOANS = 3;
const DUE_SOON_DAYS = 3;
// Estados físicos prestables (baja/extraviado/reparación no circulan).
const LOANABLE_STATUSES = new Set(['bueno', 'deteriorado']);

type Guarded = { orgId: string; staffId: string; staffRole: string };

async function audit(db: DbClient, g: Guarded, action: string, targetId: string, label: string, metadata: Record<string, unknown> = {}) {
  await db.insertInto('tenant_audit_log').values({
    organization_id: g.orgId, actor_staff_id: g.staffId, actor_email_masked: null,
    actor_role: g.staffRole, action, target_type: 'biblio', target_id: targetId,
    target_label: label.slice(0, 200), metadata: JSON.stringify(metadata),
  }).execute();
}

interface LoanRow {
  id: string; kind: string; loaned_at: Date | string; due_at: Date | string;
  returned_at: Date | string | null; renewals: number; notes: string | null;
  user_id: string; user_code: string; first_name: string; last_name: string;
  item_id: string; inventory_code: string; title_id: string; title: string;
  authors: unknown; cover_url: string | null;
}
function statusOf(r: { kind: string; due_at: Date | string; returned_at: Date | string | null }): BiblioLoan['status'] {
  if (r.returned_at) return 'devuelto';
  const due = new Date(r.due_at as string).getTime();
  const now = Date.now();
  if (now > due) return 'vencido';
  if (r.kind === 'sala') return 'en_sala';
  if (due - now <= DUE_SOON_DAYS * 86_400_000) return 'vence_pronto';
  return 'a_tiempo';
}
function toLoan(r: LoanRow): BiblioLoan {
  return {
    id: r.id, kind: r.kind as BiblioLoan['kind'], status: statusOf(r),
    loanedAt: new Date(r.loaned_at as string).toISOString(),
    dueAt: new Date(r.due_at as string).toISOString(),
    returnedAt: r.returned_at ? new Date(r.returned_at as string).toISOString() : null,
    renewals: Number(r.renewals), notes: r.notes,
    userId: r.user_id, userCode: r.user_code, userFirstName: r.first_name, userLastName: r.last_name,
    itemId: r.item_id, inventoryCode: r.inventory_code,
    titleId: r.title_id, title: r.title,
    authors: Array.isArray(r.authors) ? (r.authors as string[]) : [],
    coverUrl: r.cover_url,
  };
}

const LOAN_COLS = [
  'l.id', 'l.kind', 'l.loaned_at', 'l.due_at', 'l.returned_at', 'l.renewals', 'l.notes',
  'l.user_id', 'u.code as user_code', 'u.first_name', 'u.last_name',
  'l.item_id', 'i.inventory_code', 't.id as title_id', 't.title', 't.authors', 't.cover_url as cover_url',
] as const;

// Vencimiento: fin del día en TZ del centro. Domicilio: +LOAN_DAYS; sala: hoy.
const dueAtSql = (days: number) =>
  sql<string>`((date_trunc('day', now() at time zone ${TZ}) + ${`${days + 1} days`}::interval - interval '1 second') at time zone ${TZ})`;

export const biblioLoansRoute: FastifyPluginAsync = async (app) => {
  async function gate(req: FastifyRequest, reply: { code: (n: number) => void }): Promise<{ ok: true; g: Guarded } | { ok: false; body: { error: string } }> {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { ok: false, body: { error: guard.error } }; }
    if (!BIBLIO_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { ok: false, body: { error: 'No tenés permiso para el módulo Biblioteca.' } }; }
    if ((await limiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) { reply.code(429); return { ok: false, body: { error: 'Demasiadas operaciones seguidas. Esperá un momento.' } }; }
    return { ok: true, g: { orgId: guard.ctx.org.id, staffId: guard.ctx.staff.id, staffRole: guard.ctx.staff.role } };
  }

  function loansBase(db: DbClient, orgId: string) {
    return db.selectFrom('biblio_loans as l')
      .innerJoin('users as u', 'u.id', 'l.user_id')
      .innerJoin('biblio_items as i', 'i.id', 'l.item_id')
      .innerJoin('biblio_titles as t', 't.id', 'i.title_id')
      .where('l.organization_id', '=', orgId);
  }

  async function findItemByCode(db: DbClient, orgId: string, code: string) {
    return db.selectFrom('biblio_items as i')
      .innerJoin('biblio_titles as t', 't.id', 'i.title_id')
      .select(['i.id', 'i.inventory_code', 'i.physical_status', 'i.loanable', 'i.retired_at',
        't.id as title_id', 't.title', 't.authors', 't.cover_url'])
      .where('i.organization_id', '=', orgId)
      .where(sql<boolean>`upper(i.inventory_code) = ${code.trim().toUpperCase()}`)
      .executeTakeFirst();
  }

  // Solo DOMICILIO consume el cupo (la consulta en sala se devuelve el mismo día).
  async function openLoansOf(db: DbClient, orgId: string, userId: string): Promise<number> {
    const r = await db.selectFrom('biblio_loans')
      .select(db.fn.countAll<string>().as('n'))
      .where('organization_id', '=', orgId).where('user_id', '=', userId)
      .where('returned_at', 'is', null).where('kind', '=', 'domicilio')
      .executeTakeFirst();
    return Number(r?.n ?? 0);
  }

  // ── Lista (tabs de Circulación) ────────────────────────────────────────────
  app.get('/biblio/loans', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const q = req.query as Record<string, unknown>;
    const tab = typeof q.tab === 'string' ? q.tab : 'activos'; // activos|vencidos|renovados|devueltos|todos
    const term = typeof q.q === 'string' ? q.q.trim().slice(0, 120) : '';
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(q.pageSize) || 20));

    return withTenant(getDb(), r.g.orgId, async (db) => {
      let base = loansBase(db, r.g.orgId);
      if (tab === 'activos') base = base.where('l.returned_at', 'is', null);
      if (tab === 'vencidos') base = base.where('l.returned_at', 'is', null).where(sql<boolean>`l.due_at < now()`);
      if (tab === 'renovados') base = base.where('l.returned_at', 'is', null).where('l.renewals', '>', 0);
      if (tab === 'devueltos') base = base.where('l.returned_at', 'is not', null);
      if (term) {
        const like = `%${term.toLowerCase()}%`;
        base = base.where((eb) => eb.or([
          sql<boolean>`lower(u.first_name || ' ' || u.last_name) like ${like}`,
          sql<boolean>`lower(u.code) like ${like}`,
          sql<boolean>`lower(coalesce(u.email, '')) like ${like}`,
          sql<boolean>`lower(i.inventory_code) like ${like}`,
          sql<boolean>`lower(t.title) like ${like}`,
          sql<boolean>`exists (select 1 from biblio_member_profiles p
            where p.organization_id = ${r.g.orgId} and p.user_id = u.id
              and lower(coalesce(p.document, '')) like ${like})`,
        ]));
      }
      const totalRow = await base.select(db.fn.countAll<string>().as('n')).executeTakeFirst();
      const rows = await base.select([...LOAN_COLS])
        .orderBy(tab === 'devueltos' ? 'l.returned_at' : 'l.due_at', tab === 'devueltos' ? 'desc' : 'asc')
        .limit(pageSize).offset((page - 1) * pageSize)
        .execute();
      const body: BiblioLoansListResponse = {
        loans: rows.map((x) => toLoan(x as unknown as LoanRow)),
        total: Number(totalRow?.n ?? 0), page, pageSize,
      };
      return body;
    });
  });

  // ── Resumen de circulación (carril derecho) ────────────────────────────────
  app.get('/biblio/loans/summary', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const todayStart = sql`date_trunc('day', now() at time zone ${TZ})`;
      const row = await db.selectFrom('biblio_loans')
        .where('organization_id', '=', r.g.orgId)
        .select([
          sql<string>`count(*) filter (where (loaned_at at time zone ${TZ}) >= ${todayStart})`.as('loans_today'),
          sql<string>`count(*) filter (where returned_at is not null and (returned_at at time zone ${TZ}) >= ${todayStart})`.as('returns_today'),
          sql<string>`count(*) filter (where returned_at is null)`.as('active'),
          sql<string>`count(*) filter (where returned_at is null and due_at < now())`.as('overdue'),
          sql<string>`count(*) filter (where returned_at is null and due_at >= now() and due_at < now() + ${`${DUE_SOON_DAYS} days`}::interval)`.as('due_soon'),
        ])
        .executeTakeFirst();
      // Renovaciones de hoy: del audit log (el ledger guarda solo el contador).
      const ren = await db.selectFrom('tenant_audit_log')
        .select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', r.g.orgId)
        .where('action', '=', 'biblio.loan.renewed')
        .where(sql<boolean>`(created_at at time zone ${TZ}) >= date_trunc('day', now() at time zone ${TZ})`)
        .executeTakeFirst();
      const body: BiblioCirculationSummary = {
        today: {
          loans: Number(row?.loans_today ?? 0),
          returns: Number(row?.returns_today ?? 0),
          renewals: Number(ren?.n ?? 0),
        },
        alerts: {
          overdue: Number(row?.overdue ?? 0),
          dueSoon: Number(row?.due_soon ?? 0),
          activeTotal: Number(row?.active ?? 0),
        },
        policy: { loanDays: LOAN_DAYS, maxRenewals: MAX_RENEWALS, maxOpenLoans: MAX_OPEN_LOANS },
      };
      return body;
    });
  });

  // ── Precheck del flujo de 2 escaneos ───────────────────────────────────────
  app.get('/biblio/loans/precheck', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const q = req.query as Record<string, unknown>;
    const readerCode = typeof q.readerCode === 'string' ? q.readerCode.trim() : '';
    const inventoryCode = typeof q.inventoryCode === 'string' ? q.inventoryCode.trim() : '';

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const body: BiblioLoanPrecheckResponse = { reader: null, item: null };

      if (readerCode) {
        const u = await db.selectFrom('users as u')
          .leftJoin('biblio_member_profiles as p', (join) => join
            .onRef('p.user_id', '=', 'u.id').on('p.organization_id', '=', r.g.orgId))
          .select(['u.id', 'u.code', 'u.first_name', 'u.last_name', 'u.deleted_at', 'p.reader_type', 'p.suspended_at'])
          .where('u.organization_id', '=', r.g.orgId)
          .where(sql<boolean>`upper(u.code) = ${readerCode.toUpperCase()}`)
          .executeTakeFirst();
        if (u) {
          body.reader = {
            userId: u.id, code: u.code, firstName: u.first_name, lastName: u.last_name,
            readerType: u.reader_type === 'empleado' ? 'empleado' : 'no_empleado',
            suspended: u.suspended_at !== null, archived: u.deleted_at !== null,
            openLoans: await openLoansOf(db, r.g.orgId, u.id), maxOpenLoans: MAX_OPEN_LOANS,
          };
        }
      }

      if (inventoryCode) {
        const i = await findItemByCode(db, r.g.orgId, inventoryCode);
        if (i) {
          const open = await db.selectFrom('biblio_loans').select('id')
            .where('organization_id', '=', r.g.orgId).where('item_id', '=', i.id)
            .where('returned_at', 'is', null).executeTakeFirst();
          body.item = {
            itemId: i.id, inventoryCode: i.inventory_code, titleId: i.title_id, title: i.title,
            authors: Array.isArray(i.authors) ? (i.authors as string[]) : [],
            coverUrl: i.cover_url,
            physicalStatus: i.physical_status as BiblioPhysicalStatus,
            loanable: i.loanable, retired: i.retired_at !== null, onLoan: !!open,
          };
        }
      }
      return body;
    });
  });

  // ── Prestar ────────────────────────────────────────────────────────────────
  app.post('/biblio/loans', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const parsed = BiblioLoanCreateSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.', details: parsed.error.flatten().fieldErrors }; }
    const p = parsed.data;
    if (!p.readerCode && !p.userId) { reply.code(400); return { error: 'Falta el carné del lector.' }; }

    return withTenant(getDb(), r.g.orgId, async (db) => {
      // Lector: por carné (escaneo) o por id (desde Lectores).
      let userQ = db.selectFrom('users as u')
        .leftJoin('biblio_member_profiles as p', (join) => join
          .onRef('p.user_id', '=', 'u.id').on('p.organization_id', '=', r.g.orgId))
        .select(['u.id', 'u.code', 'u.first_name', 'u.last_name', 'u.deleted_at', 'p.suspended_at'])
        .where('u.organization_id', '=', r.g.orgId);
      userQ = p.userId
        ? userQ.where('u.id', '=', p.userId)
        : userQ.where(sql<boolean>`upper(u.code) = ${p.readerCode!.toUpperCase()}`);
      const user = await userQ.executeTakeFirst();
      if (!user) { reply.code(404); return { error: 'No encontramos ese carné en el padrón.' }; }
      if (user.deleted_at) { reply.code(409); return { error: 'Esa persona está archivada en el padrón.' }; }
      if (user.suspended_at) { reply.code(409); return { error: 'El servicio de biblioteca de esta persona está suspendido.' }; }

      const item = await findItemByCode(db, r.g.orgId, p.inventoryCode);
      if (!item) { reply.code(404); return { error: 'No encontramos ese código de ejemplar.' }; }
      if (item.retired_at) { reply.code(409); return { error: 'Ese ejemplar está dado de baja.' }; }
      if (!item.loanable && p.kind === 'domicilio') { reply.code(409); return { error: 'Ese ejemplar es solo para consulta en sala.' }; }
      if (!LOANABLE_STATUSES.has(item.physical_status)) { reply.code(409); return { error: 'Ese ejemplar no está en condiciones de circular.' }; }

      const open = await openLoansOf(db, r.g.orgId, user.id);
      if (p.kind === 'domicilio' && open >= MAX_OPEN_LOANS) {
        reply.code(409); return { error: `Límite alcanzado: ${MAX_OPEN_LOANS} préstamos abiertos por lector.` };
      }

      try {
        const ins = await db.insertInto('biblio_loans').values({
          organization_id: r.g.orgId, item_id: item.id, user_id: user.id,
          kind: p.kind, due_at: dueAtSql(p.kind === 'sala' ? 0 : LOAN_DAYS),
          notes: p.notes?.trim() || null, created_by_staff_id: r.g.staffId,
        }).returning('id').executeTakeFirstOrThrow();

        await audit(db, r.g, 'biblio.loan.created', ins.id,
          `${item.inventory_code} · ${item.title} → ${user.first_name} ${user.last_name}`,
          { kind: p.kind, itemId: item.id, userId: user.id });

        const row = await loansBase(db, r.g.orgId).where('l.id', '=', ins.id).select([...LOAN_COLS]).executeTakeFirstOrThrow();
        reply.code(201);
        return { loan: toLoan(row as unknown as LoanRow) };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') {
          reply.code(409);
          return { error: 'Ese ejemplar ya está prestado — devolvelo primero.' };
        }
        throw e;
      }
    });
  });

  // ── Devolver por escaneo del ejemplar ──────────────────────────────────────
  app.post('/biblio/returns', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const parsed = BiblioReturnSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.' }; }
    const p = parsed.data;

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const item = await findItemByCode(db, r.g.orgId, p.inventoryCode);
      if (!item) { reply.code(404); return { error: 'No encontramos ese código de ejemplar.' }; }
      const openLoan = await db.selectFrom('biblio_loans').select(['id'])
        .where('organization_id', '=', r.g.orgId).where('item_id', '=', item.id)
        .where('returned_at', 'is', null).executeTakeFirst();
      if (!openLoan) { reply.code(409); return { error: 'Ese ejemplar no tiene un préstamo abierto.' }; }

      await db.updateTable('biblio_loans')
        .set({
          returned_at: sql`now()`, returned_by_staff_id: r.g.staffId,
          notes: p.notes?.trim() ? sql`concat_ws(e'\\n', notes, ${'Devolución: ' + p.notes.trim()})` : sql`notes`,
          updated_at: sql`now()`,
        })
        .where('organization_id', '=', r.g.orgId).where('id', '=', openLoan.id)
        .execute();

      await audit(db, r.g, 'biblio.loan.returned', openLoan.id, `${item.inventory_code} · ${item.title}`);
      const row = await loansBase(db, r.g.orgId).where('l.id', '=', openLoan.id).select([...LOAN_COLS]).executeTakeFirstOrThrow();
      return { loan: toLoan(row as unknown as LoanRow) };
    });
  });

  // ── Renovar ────────────────────────────────────────────────────────────────
  app.post('/biblio/loans/:id/renew', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const id = (req.params as { id: string }).id;

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const loan = await db.selectFrom('biblio_loans')
        .select(['id', 'kind', 'renewals', 'returned_at'])
        .where('organization_id', '=', r.g.orgId).where('id', '=', id).executeTakeFirst();
      if (!loan) { reply.code(404); return { error: 'Préstamo no encontrado.' }; }
      if (loan.returned_at) { reply.code(409); return { error: 'Ese préstamo ya fue devuelto.' }; }
      if (loan.kind === 'sala') { reply.code(409); return { error: 'La consulta en sala no se renueva — se devuelve el mismo día.' }; }
      if (Number(loan.renewals) >= MAX_RENEWALS) { reply.code(409); return { error: `Límite alcanzado: máximo ${MAX_RENEWALS} renovaciones.` }; }

      await db.updateTable('biblio_loans')
        .set({
          renewals: sql`renewals + 1`,
          due_at: dueAtSql(RENEW_DAYS),
          updated_at: sql`now()`,
        })
        .where('organization_id', '=', r.g.orgId).where('id', '=', id)
        .execute();

      const row = await loansBase(db, r.g.orgId).where('l.id', '=', id).select([...LOAN_COLS]).executeTakeFirstOrThrow();
      const mapped = toLoan(row as unknown as LoanRow);
      await audit(db, r.g, 'biblio.loan.renewed', id, `${mapped.inventoryCode} · ${mapped.title}`, { renewals: mapped.renewals });
      return { loan: mapped };
    });
  });

  // ── Préstamos de un lector (panel de Lectores · tab Préstamos) ─────────────
  app.get('/biblio/readers/:id/loans', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const rows = await loansBase(db, r.g.orgId)
        .where('l.user_id', '=', (req.params as { id: string }).id)
        .select([...LOAN_COLS])
        .orderBy(sql`l.returned_at is null`, 'desc')
        .orderBy('l.loaned_at', 'desc')
        .limit(30)
        .execute();
      return { loans: rows.map((x) => toLoan(x as unknown as LoanRow)) };
    });
  });
};
