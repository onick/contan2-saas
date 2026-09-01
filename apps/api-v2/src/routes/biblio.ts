// apps/api-v2/src/routes/biblio.ts · Módulo Biblioteca F1: catálogo.
// Plan docs/plan-modulo-biblioteca.md. D1 (título ≠ ejemplar) y D9 (sitio →
// estante) en la superficie. Roles: owner/admin/biblioteca (allowlist).
//   GET  /biblio/sites                 · sitios físicos (+conteo de ejemplares)
//   POST /biblio/sites                 · crear sitio
//   GET  /biblio/titles                · búsqueda paginada (q, kind)
//   POST /biblio/titles                · crear título
//   GET  /biblio/titles/:id            · ficha + ejemplares
//   PATCH /biblio/titles/:id           · editar ficha
//   POST /biblio/titles/:id/items      · agregar ejemplar
//   PATCH /biblio/items/:id            · editar / dar de baja ejemplar
//   GET  /biblio/isbn/:isbn            · autofill (cache + OpenLibrary/Google)
// Todo dentro de withTenant (RLS activo); auditoría en escrituras.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, withTenant, type DbClient } from '@contan2/db';
import {
  BiblioSiteCreateSchema, BiblioTitleInputSchema, BiblioTitleUpdateSchema,
  BiblioItemInputSchema, BiblioItemUpdateSchema,
  type BiblioSitesResponse, type BiblioTitlesListResponse, type BiblioTitleDetailResponse,
  type BiblioTitle, type BiblioItem, type BiblioIsbnLookupResponse, type BiblioTitleInput,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { lookupIsbn } from '../services/biblio-isbn.js';

// Rol 'biblioteca' (mig 049) + gestores. El resto → 403 (módulo confinado).
const BIBLIO_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'biblioteca']);

const biblioLimiter = createRateLimiter({ max: 240, windowMs: 60_000, prefix: endpointPrefix('biblio') });
const isbnLimiter = createRateLimiter({ max: 30, windowMs: 60_000, prefix: endpointPrefix('biblio-isbn') });

const PAGE_SIZE_MAX = 50;
const ACTIVE_STATUSES = ['bueno', 'deteriorado'];

type Guarded = { orgId: string; staffId: string; staffRole: string };

async function audit(db: DbClient, g: Guarded, action: string, targetId: string, label: string, metadata: Record<string, unknown> = {}) {
  await db.insertInto('tenant_audit_log').values({
    organization_id: g.orgId, actor_staff_id: g.staffId, actor_email_masked: null,
    actor_role: g.staffRole, action, target_type: 'biblio', target_id: targetId,
    target_label: label.slice(0, 200), metadata: JSON.stringify(metadata),
  }).execute();
}

// Fila de biblio_titles (+conteos) → contrato camelCase.
interface TitleRow {
  id: string; kind: string; isbn: string | null; issn: string | null; title: string;
  subtitle: string | null; authors: unknown; publisher: string | null; year: number | null;
  edition: string | null; language: string | null; subjects: string[]; keywords: string[];
  dewey: string | null; call_number: string | null; description: string | null;
  cover_url: string | null; isbn_autofilled: boolean; created_at: Date | string;
  itemsTotal: string | number; itemsActive: string | number;
}
function toTitle(r: TitleRow): BiblioTitle {
  return {
    id: r.id, kind: r.kind as BiblioTitle['kind'], isbn: r.isbn, issn: r.issn,
    title: r.title, subtitle: r.subtitle,
    authors: Array.isArray(r.authors) ? (r.authors as string[]) : [],
    publisher: r.publisher, year: r.year, edition: r.edition, language: r.language,
    subjects: r.subjects ?? [], keywords: r.keywords ?? [],
    dewey: r.dewey, callNumber: r.call_number, description: r.description,
    coverUrl: r.cover_url, isbnAutofilled: r.isbn_autofilled,
    createdAt: new Date(r.created_at as string).toISOString(),
    itemsTotal: Number(r.itemsTotal), itemsActive: Number(r.itemsActive),
  };
}

// Input camelCase → columnas (para INSERT/UPDATE de títulos).
function titleCols(p: Partial<BiblioTitleInput>) {
  const out: Record<string, unknown> = {};
  if (p.kind !== undefined) out.kind = p.kind;
  if (p.isbn !== undefined) out.isbn = p.isbn?.trim() || null;
  if (p.issn !== undefined) out.issn = p.issn?.trim() || null;
  if (p.title !== undefined) out.title = p.title;
  if (p.subtitle !== undefined) out.subtitle = p.subtitle?.trim() || null;
  if (p.authors !== undefined) out.authors = JSON.stringify(p.authors);
  if (p.publisher !== undefined) out.publisher = p.publisher?.trim() || null;
  if (p.year !== undefined) out.year = p.year ?? null;
  if (p.edition !== undefined) out.edition = p.edition?.trim() || null;
  if (p.language !== undefined) out.language = p.language?.trim() || null;
  if (p.subjects !== undefined) out.subjects = p.subjects;
  if (p.keywords !== undefined) out.keywords = p.keywords;
  if (p.dewey !== undefined) out.dewey = p.dewey?.trim() || null;
  if (p.callNumber !== undefined) out.call_number = p.callNumber?.trim() || null;
  if (p.description !== undefined) out.description = p.description?.trim() || null;
  if (p.coverUrl !== undefined) out.cover_url = p.coverUrl?.trim() || null;
  if (p.isbnAutofilled !== undefined) out.isbn_autofilled = p.isbnAutofilled;
  return out;
}

const itemsCountSql = (statuses?: string[]) => sql<string>`(
  select count(*) from biblio_items i
  where i.title_id = t.id and i.retired_at is null
  ${statuses ? sql`and i.physical_status in (${sql.join(statuses)})` : sql``}
)`;

async function loadTitle(db: DbClient, orgId: string, id: string): Promise<BiblioTitle | null> {
  const r = await db.selectFrom('biblio_titles as t')
    .selectAll('t')
    .select([itemsCountSql().as('itemsTotal'), itemsCountSql(ACTIVE_STATUSES).as('itemsActive')])
    .where('t.organization_id', '=', orgId).where('t.id', '=', id)
    .where('t.deleted_at', 'is', null)
    .executeTakeFirst();
  return r ? toTitle(r as unknown as TitleRow) : null;
}

export const biblioRoute: FastifyPluginAsync = async (app) => {
  // Guard compartido: staff del tenant + rol permitido + rate limit.
  async function gate(req: FastifyRequest, reply: { code: (n: number) => void }): Promise<{ ok: true; g: Guarded } | { ok: false; body: { error: string } }> {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { ok: false, body: { error: guard.error } }; }
    if (!BIBLIO_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { ok: false, body: { error: 'No tenés permiso para el módulo Biblioteca.' } }; }
    if ((await biblioLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) { reply.code(429); return { ok: false, body: { error: 'Demasiadas operaciones seguidas. Esperá un momento.' } }; }
    return { ok: true, g: { orgId: guard.ctx.org.id, staffId: guard.ctx.staff.id, staffRole: guard.ctx.staff.role } };
  }

  // ── Sitios ─────────────────────────────────────────────────────────────────
  app.get('/biblio/sites', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const rows = await db.selectFrom('biblio_sites as s')
        .select(['s.id', 's.name', 's.active'])
        .select(sql<string>`(select count(*) from biblio_items i where i.site_id = s.id and i.retired_at is null)`.as('items'))
        .where('s.organization_id', '=', r.g.orgId)
        .orderBy('s.name', 'asc').execute();
      const body: BiblioSitesResponse = { sites: rows.map((s) => ({ id: s.id, name: s.name, active: s.active, items: Number(s.items) })) };
      return body;
    });
  });

  app.post('/biblio/sites', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const parsed = BiblioSiteCreateSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Nombre de sitio inválido.' }; }
    return withTenant(getDb(), r.g.orgId, async (db) => {
      try {
        const s = await db.insertInto('biblio_sites')
          .values({ organization_id: r.g.orgId, name: parsed.data.name })
          .returning(['id', 'name', 'active']).executeTakeFirstOrThrow();
        await audit(db, r.g, 'biblio.site.created', s.id, s.name);
        reply.code(201);
        return { site: { id: s.id, name: s.name, active: s.active, items: 0 } };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') { reply.code(409); return { error: 'Ya existe un sitio con ese nombre.' }; }
        throw e;
      }
    });
  });

  // ── Títulos: búsqueda paginada ─────────────────────────────────────────────
  app.get('/biblio/titles', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const q = req.query as Record<string, unknown>;
    const term = typeof q.q === 'string' ? q.q.trim().slice(0, 120) : '';
    const kind = typeof q.kind === 'string' && q.kind.trim() ? q.kind.trim() : null;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(q.pageSize) || 20));

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const searchable = sql`lower(t.title || ' ' || coalesce(t.subtitle, ''))`; // matchea el índice trgm
      let base = db.selectFrom('biblio_titles as t')
        .where('t.organization_id', '=', r.g.orgId)
        .where('t.deleted_at', 'is', null);
      if (kind) base = base.where('t.kind', '=', kind);
      if (term) {
        const like = `%${term.toLowerCase()}%`;
        const digits = term.replace(/[^0-9Xx]/g, '');
        base = base.where((eb) => eb.or([
          sql<boolean>`${searchable} like ${like}`,
          sql<boolean>`t.authors::text ilike ${like}`,
          ...(digits.length >= 8 ? [sql<boolean>`replace(coalesce(t.isbn,''), '-', '') = ${digits}`] : []),
        ]));
      }
      const totalRow = await base.select(db.fn.countAll<string>().as('n')).executeTakeFirst();
      const rows = await base
        .selectAll('t')
        .select([itemsCountSql().as('itemsTotal'), itemsCountSql(ACTIVE_STATUSES).as('itemsActive')])
        .orderBy('t.created_at', 'desc')
        .limit(pageSize).offset((page - 1) * pageSize)
        .execute();
      const body: BiblioTitlesListResponse = {
        titles: rows.map((x) => toTitle(x as unknown as TitleRow)),
        total: Number(totalRow?.n ?? 0), page, pageSize,
      };
      return body;
    });
  });

  app.post('/biblio/titles', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const parsed = BiblioTitleInputSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos de la ficha inválidos.' }; }
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const ins = await db.insertInto('biblio_titles')
        .values({ organization_id: r.g.orgId, ...titleCols(parsed.data) } as never)
        .returning('id').executeTakeFirstOrThrow();
      await audit(db, r.g, 'biblio.title.created', ins.id, parsed.data.title, { isbn: parsed.data.isbn ?? null });
      const title = await loadTitle(db, r.g.orgId, ins.id);
      reply.code(201);
      return { title };
    });
  });

  app.get('/biblio/titles/:id', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const id = (req.params as { id: string }).id;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const title = await loadTitle(db, r.g.orgId, id);
      if (!title) { reply.code(404); return { error: 'Título no encontrado.' }; }
      const items = await db.selectFrom('biblio_items as i')
        .leftJoin('biblio_sites as s', 's.id', 'i.site_id')
        .select(['i.id', 'i.inventory_code', 'i.site_id', 's.name as site_name', 'i.shelf', 'i.collection',
          'i.call_number', 'i.physical_status', 'i.loanable', 'i.notes', 'i.retired_at', 'i.retired_reason'])
        .where('i.organization_id', '=', r.g.orgId).where('i.title_id', '=', id)
        .orderBy('i.inventory_code', 'asc').execute();
      const body: BiblioTitleDetailResponse = {
        title,
        items: items.map((i): BiblioItem => ({
          id: i.id, inventoryCode: i.inventory_code, siteId: i.site_id, siteName: i.site_name ?? null,
          shelf: i.shelf, collection: i.collection, callNumber: i.call_number,
          physicalStatus: i.physical_status as BiblioItem['physicalStatus'], loanable: i.loanable,
          notes: i.notes, retiredAt: i.retired_at ? new Date(i.retired_at as unknown as string).toISOString() : null,
          retiredReason: i.retired_reason,
        })),
      };
      return body;
    });
  });

  app.patch('/biblio/titles/:id', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const id = (req.params as { id: string }).id;
    const parsed = BiblioTitleUpdateSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos de la ficha inválidos.' }; }
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const cols = titleCols(parsed.data);
      if (Object.keys(cols).length === 0) { reply.code(400); return { error: 'Nada que actualizar.' }; }
      const upd = await db.updateTable('biblio_titles')
        .set({ ...cols, updated_at: new Date().toISOString() } as never)
        .where('organization_id', '=', r.g.orgId).where('id', '=', id).where('deleted_at', 'is', null)
        .returning(['id', 'title']).executeTakeFirst();
      if (!upd) { reply.code(404); return { error: 'Título no encontrado.' }; }
      await audit(db, r.g, 'biblio.title.updated', upd.id, upd.title, { fields: Object.keys(cols) });
      return { title: await loadTitle(db, r.g.orgId, id) };
    });
  });

  // ── Ejemplares ─────────────────────────────────────────────────────────────
  app.post('/biblio/titles/:id/items', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const titleId = (req.params as { id: string }).id;
    const parsed = BiblioItemInputSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos del ejemplar inválidos.' }; }
    const p = parsed.data;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const title = await db.selectFrom('biblio_titles').select(['id', 'title'])
        .where('organization_id', '=', r.g.orgId).where('id', '=', titleId).where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!title) { reply.code(404); return { error: 'Título no encontrado.' }; }
      if (p.siteId) {
        const site = await db.selectFrom('biblio_sites').select('id')
          .where('organization_id', '=', r.g.orgId).where('id', '=', p.siteId).executeTakeFirst();
        if (!site) { reply.code(400); return { error: 'Sitio inexistente.' }; }
      }
      try {
        const ins = await db.insertInto('biblio_items').values({
          organization_id: r.g.orgId, title_id: titleId,
          inventory_code: p.inventoryCode.toUpperCase(),
          site_id: p.siteId ?? null, shelf: p.shelf?.trim() || null,
          collection: p.collection?.trim() || null, call_number: p.callNumber?.trim() || null,
          physical_status: p.physicalStatus, loanable: p.loanable, notes: p.notes?.trim() || null,
        }).returning('id').executeTakeFirstOrThrow();
        await audit(db, r.g, 'biblio.item.created', ins.id, `${p.inventoryCode.toUpperCase()} · ${title.title}`);
        reply.code(201);
        return { ok: true, id: ins.id };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') { reply.code(409); return { error: 'Ese código de inventario ya existe.' }; }
        throw e;
      }
    });
  });

  app.patch('/biblio/items/:id', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const id = (req.params as { id: string }).id;
    const parsed = BiblioItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos del ejemplar inválidos.' }; }
    const p = parsed.data;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const cols: Record<string, unknown> = {};
      if (p.inventoryCode !== undefined) cols.inventory_code = p.inventoryCode.toUpperCase();
      if (p.siteId !== undefined) cols.site_id = p.siteId ?? null;
      if (p.shelf !== undefined) cols.shelf = p.shelf?.trim() || null;
      if (p.collection !== undefined) cols.collection = p.collection?.trim() || null;
      if (p.callNumber !== undefined) cols.call_number = p.callNumber?.trim() || null;
      if (p.physicalStatus !== undefined) cols.physical_status = p.physicalStatus;
      if (p.loanable !== undefined) cols.loanable = p.loanable;
      if (p.notes !== undefined) cols.notes = p.notes?.trim() || null;
      // Baja lógica: conserva el historial; el estado físico queda 'baja'.
      if (p.retiredReason !== undefined) {
        cols.retired_at = new Date().toISOString();
        cols.retired_reason = p.retiredReason;
        cols.physical_status = 'baja';
      }
      if (Object.keys(cols).length === 0) { reply.code(400); return { error: 'Nada que actualizar.' }; }
      try {
        const upd = await db.updateTable('biblio_items')
          .set({ ...cols, updated_at: new Date().toISOString() } as never)
          .where('organization_id', '=', r.g.orgId).where('id', '=', id)
          .returning(['id', 'inventory_code']).executeTakeFirst();
        if (!upd) { reply.code(404); return { error: 'Ejemplar no encontrado.' }; }
        await audit(db, r.g, p.retiredReason ? 'biblio.item.retired' : 'biblio.item.updated', upd.id, upd.inventory_code, { fields: Object.keys(cols) });
        return { ok: true };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') { reply.code(409); return { error: 'Ese código de inventario ya existe.' }; }
        throw e;
      }
    });
  });

  // ── Autofill por ISBN ──────────────────────────────────────────────────────
  app.get('/biblio/isbn/:isbn', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    if ((await isbnLimiter.hit(`${r.g.orgId}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiadas consultas de ISBN. Esperá un momento.' }; }
    const isbn = (req.params as { isbn: string }).isbn;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const res = await lookupIsbn(db, isbn);
      const body: BiblioIsbnLookupResponse = res as BiblioIsbnLookupResponse;
      return body;
    });
  });
};
