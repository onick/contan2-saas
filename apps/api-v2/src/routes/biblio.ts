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
  type BiblioFacetsResponse, type BiblioOverviewResponse,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { lookupIsbn } from '../services/biblio-isbn.js';
import { normCategory, normCategorySql, consolidateCategories } from '../services/category-norm.js';
import { buildBiblioExportWorkbook } from '../services/biblio-export.js';
import { safeFilename } from '../services/csv.js';
import { assertAllowedImage, processCover, persistCover, CoverError } from '../services/cover-upload.js';
import { ensureWritableRoot, StorageError } from '../storage.js';

// Rol 'biblioteca' (mig 049) + gestores. El resto → 403 (módulo confinado).
const BIBLIO_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'biblioteca']);

const biblioLimiter = createRateLimiter({ max: 240, windowMs: 60_000, prefix: endpointPrefix('biblio') });
const isbnLimiter = createRateLimiter({ max: 30, windowMs: 60_000, prefix: endpointPrefix('biblio-isbn') });

const PAGE_SIZE_MAX = 50;
const ACTIVE_STATUSES = ['bueno', 'deteriorado'];
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_MAX_ROWS = 10_000;
const KIND_LABELS: Record<string, string> = {
  libro: 'Libros', revista: 'Revistas', periodico: 'Periódicos',
  tesis: 'Tesis', audiovisual: 'Audiovisuales', documento: 'Documentos',
};

type Guarded = { orgId: string; staffId: string; staffRole: string; orgName: string; primaryColor: string | null };

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
  pages: number | null; country: string | null; physical_format: string | null;
  binding: string | null; dimensions: string | null; audience: string | null;
  acquisition_source: string | null; acquired_on: Date | string | null;
  itemsTotal: string | number; itemsActive: string | number; siteNames: string[] | null;
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
    siteNames: r.siteNames ?? [],
    pages: r.pages, country: r.country, physicalFormat: r.physical_format,
    binding: r.binding, dimensions: r.dimensions, audience: r.audience,
    acquisitionSource: r.acquisition_source,
    acquiredOn: r.acquired_on ? new Date(r.acquired_on as string).toISOString().slice(0, 10) : null,
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
  if (p.pages !== undefined) out.pages = p.pages ?? null;
  if (p.country !== undefined) out.country = p.country?.trim() || null;
  if (p.physicalFormat !== undefined) out.physical_format = p.physicalFormat?.trim() || null;
  if (p.binding !== undefined) out.binding = p.binding?.trim() || null;
  if (p.dimensions !== undefined) out.dimensions = p.dimensions?.trim() || null;
  if (p.audience !== undefined) out.audience = p.audience?.trim() || null;
  if (p.acquisitionSource !== undefined) out.acquisition_source = p.acquisitionSource?.trim() || null;
  if (p.acquiredOn !== undefined) out.acquired_on = p.acquiredOn ?? null;
  return out;
}

const itemsCountSql = (statuses?: string[]) => sql<string>`(
  select count(*) from biblio_items i
  where i.title_id = t.id and i.retired_at is null
  ${statuses ? sql`and i.physical_status in (${sql.join(statuses)})` : sql``}
)`;

// Sitios (distintos) donde el título tiene ejemplares vivos — la "Ubicación"
// de la fila del catálogo. Sin sitio asignado no aporta nombre.
const siteNamesSql = () => sql<string[]>`(
  select coalesce(array_agg(distinct s.name), '{}')
  from biblio_items i join biblio_sites s on s.id = i.site_id
  where i.title_id = t.id and i.retired_at is null
)`;

async function loadTitle(db: DbClient, orgId: string, id: string): Promise<BiblioTitle | null> {
  const r = await db.selectFrom('biblio_titles as t')
    .selectAll('t')
    .select([itemsCountSql().as('itemsTotal'), itemsCountSql(ACTIVE_STATUSES).as('itemsActive'), siteNamesSql().as('siteNames')])
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
    return { ok: true, g: { orgId: guard.ctx.org.id, staffId: guard.ctx.staff.id, staffRole: guard.ctx.staff.role, orgName: guard.ctx.org.name, primaryColor: guard.ctx.org.primaryColor ?? null } };
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

  // ── Facetas: tipos y materias EXISTENTES en el catálogo (menú lateral) ─────
  app.get('/biblio/facets', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const kinds = await db.selectFrom('biblio_titles')
        .select(['kind'])
        .select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', r.g.orgId).where('deleted_at', 'is', null)
        .groupBy('kind').execute();
      const total = kinds.reduce((a, k) => a + Number(k.n), 0);
      // Materias: unnest del array + consolidación de variantes (acentos/mayúsculas).
      const subjectRows = await sql<{ subject: string; n: string }>`
        select s.subject as subject, count(*)::text as n
        from biblio_titles t
        cross join lateral unnest(t.subjects) as s(subject)
        where t.organization_id = ${r.g.orgId} and t.deleted_at is null
        group by 1 order by count(*) desc limit 60
      `.execute(db);
      const subjects = consolidateCategories(subjectRows.rows.map((s) => ({ category: s.subject, activities: Number(s.n) })))
        .map((c) => ({ subject: c.category, count: c.activities }))
        .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject, 'es'));
      const itemsRow = await db.selectFrom('biblio_items')
        .select([
          sql<string>`count(*) filter (where retired_at is null)`.as('total'),
          sql<string>`count(*) filter (where retired_at is null and physical_status in (${sql.join(ACTIVE_STATUSES)}))`.as('active'),
        ])
        .where('organization_id', '=', r.g.orgId)
        .executeTakeFirst();
      const body: BiblioFacetsResponse = {
        items: { total: Number(itemsRow?.total ?? 0), active: Number(itemsRow?.active ?? 0) },
        total,
        kinds: kinds.map((k) => ({ kind: k.kind as BiblioFacetsResponse['kinds'][number]['kind'], count: Number(k.n) }))
          .sort((a, b) => b.count - a.count),
        subjects,
      };
      return body;
    });
  });

  // ── Overview del Inicio: alertas REALES del acervo + actividad reciente ────
  app.get('/biblio/overview', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const twi = await db.selectFrom('biblio_titles as t')
        .select(db.fn.countAll<string>().as('n'))
        .where('t.organization_id', '=', r.g.orgId).where('t.deleted_at', 'is', null)
        .where(sql<boolean>`not exists (select 1 from biblio_items i where i.title_id = t.id and i.retired_at is null)`)
        .executeTakeFirst();
      const care = await db.selectFrom('biblio_items')
        .select([
          sql<string>`count(*) filter (where physical_status in ('reparacion', 'deteriorado'))`.as('care'),
          sql<string>`count(*) filter (where site_id is null)`.as('nosite'),
        ])
        .where('organization_id', '=', r.g.orgId).where('retired_at', 'is', null)
        .executeTakeFirst();
      const acts = await db.selectFrom('tenant_audit_log')
        .select(['action', 'target_label', 'created_at'])
        .where('organization_id', '=', r.g.orgId)
        .where('action', 'like', 'biblio.%')
        .orderBy('id', 'desc').limit(12).execute();
      const body: BiblioOverviewResponse = {
        alerts: {
          titlesWithoutItems: Number(twi?.n ?? 0),
          itemsNeedingCare: Number(care?.care ?? 0),
          itemsWithoutLocation: Number(care?.nosite ?? 0),
        },
        activity: acts.map((a) => ({
          action: a.action,
          label: a.target_label ?? '',
          at: new Date(a.created_at as unknown as string).toISOString(),
        })),
      };
      return body;
    });
  });

  // Filtros compartidos entre la lista paginada y el export del catálogo.
  function parseTitleFilters(q: Record<string, unknown>) {
    return {
      term: typeof q.q === 'string' ? q.q.trim().slice(0, 120) : '',
      kind: typeof q.kind === 'string' && q.kind.trim() ? q.kind.trim() : null,
      subject: typeof q.subject === 'string' && q.subject.trim() ? q.subject.trim().slice(0, 80) : null,
      siteId: typeof q.siteId === 'string' && /^[0-9a-f-]{36}$/i.test(q.siteId) ? q.siteId : null,
      disponible: q.disponible === '1' || q.disponible === 'true',
    };
  }
  type TitleFilters = ReturnType<typeof parseTitleFilters>;
  function filteredTitles(db: DbClient, orgId: string, f: TitleFilters) {
    const searchable = sql`lower(t.title || ' ' || coalesce(t.subtitle, ''))`; // matchea el índice trgm
    let base = db.selectFrom('biblio_titles as t')
      .where('t.organization_id', '=', orgId)
      .where('t.deleted_at', 'is', null);
    if (f.kind) base = base.where('t.kind', '=', f.kind);
    if (f.siteId) {
      base = base.where(sql<boolean>`exists (
        select 1 from biblio_items i
        where i.title_id = t.id and i.retired_at is null and i.site_id = ${f.siteId}
      )`);
    }
    if (f.disponible) {
      base = base.where(sql<boolean>`exists (
        select 1 from biblio_items i
        where i.title_id = t.id and i.retired_at is null and i.physical_status in (${sql.join(ACTIVE_STATUSES)})
      )`);
    }
    if (f.subject) {
      // Materia NORMALIZADA: "arte dominicano" matchea "Arte Dominicano".
      base = base.where(sql<boolean>`exists (
        select 1 from unnest(t.subjects) as s(x)
        where ${normCategorySql(sql`s.x`)} = ${normCategory(f.subject)}
      )`);
    }
    if (f.term) {
      const like = `%${f.term.toLowerCase()}%`;
      const digits = f.term.replace(/[^0-9Xx]/g, '');
      base = base.where((eb) => eb.or([
        sql<boolean>`${searchable} like ${like}`,
        sql<boolean>`t.authors::text ilike ${like}`,
        ...(digits.length >= 8 ? [sql<boolean>`replace(coalesce(t.isbn,''), '-', '') = ${digits}`] : []),
      ]));
    }
    return base;
  }

  // ── Títulos: búsqueda paginada ─────────────────────────────────────────────
  app.get('/biblio/titles', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const q = req.query as Record<string, unknown>;
    const f = parseTitleFilters(q);
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(q.pageSize) || 20));

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const base = filteredTitles(db, r.g.orgId, f);
      const totalRow = await base.select(db.fn.countAll<string>().as('n')).executeTakeFirst();
      const rows = await base
        .selectAll('t')
        .select([itemsCountSql().as('itemsTotal'), itemsCountSql(ACTIVE_STATUSES).as('itemsActive'), siteNamesSql().as('siteNames')])
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

  // ── Export del catálogo (.xlsx, respeta los filtros activos) ───────────────
  app.get('/biblio/export.xlsx', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const f = parseTitleFilters(req.query as Record<string, unknown>);

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const rows = await filteredTitles(db, r.g.orgId, f)
        .selectAll('t')
        .select([itemsCountSql().as('itemsTotal'), itemsCountSql(ACTIVE_STATUSES).as('itemsActive'), siteNamesSql().as('siteNames')])
        .orderBy('t.title', 'asc')
        .limit(EXPORT_MAX_ROWS)
        .execute();
      const titles = rows.map((x) => toTitle(x as unknown as TitleRow));

      let siteName: string | null = null;
      if (f.siteId) {
        const site = await db.selectFrom('biblio_sites').select(['name'])
          .where('organization_id', '=', r.g.orgId).where('id', '=', f.siteId).executeTakeFirst();
        siteName = site?.name ?? null;
      }
      const parts = [
        f.kind ? (KIND_LABELS[f.kind] ?? f.kind) : null, f.subject, siteName,
        f.disponible ? 'solo disponibles' : null, f.term ? `"${f.term}"` : null,
      ].filter(Boolean);
      const filterLabel = parts.length ? parts.join(' · ') : 'Todo el catálogo';

      await audit(db, r.g, 'biblio.exported', f.siteId ?? 'all', filterLabel, { rows: titles.length, ...f });

      const buf = await buildBiblioExportWorkbook(
        titles.map((t) => ({
          kind: t.kind, title: t.title, subtitle: t.subtitle, authors: t.authors,
          isbn: t.isbn, publisher: t.publisher, year: t.year, language: t.language,
          dewey: t.dewey, callNumber: t.callNumber, subjects: t.subjects,
          itemsTotal: t.itemsTotal, itemsActive: t.itemsActive, siteNames: t.siteNames,
        })),
        { orgName: r.g.orgName, primaryColor: r.g.primaryColor, filterLabel },
      );
      reply.header('content-type', XLSX_MIME);
      reply.header('content-disposition', `attachment; filename="${safeFilename('catalogo_biblioteca.xlsx')}"`);
      reply.header('cache-control', 'no-store');
      return reply.send(buf);
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
  // ── Portada del título (multipart, magic bytes + sharp → WebP) ────────────
  // Mismo pipeline que las portadas de actividades: validación real, escritura
  // atómica con rollback, borra la portada v2 anterior solo tras el éxito.
  app.post('/biblio/titles/:id/cover', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const id = (req.params as { id: string }).id;
      const existing = await db.selectFrom('biblio_titles')
        .select(['id', 'title', 'cover_url'])
        .where('organization_id', '=', r.g.orgId).where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!existing) { reply.code(404); return { error: 'Título no encontrado.' }; }

      // Multipart: EXACTAMENTE un archivo (tope global 5MB del plugin → 413).
      let buf: Buffer | undefined; let fileCount = 0; let oversize = false; let parseErr = false;
      try {
        for await (const part of req.parts()) {
          if (part.type !== 'file') continue;
          fileCount += 1;
          if (fileCount > 1) break;
          buf = await part.toBuffer();
          if (part.file.truncated) oversize = true;
        }
      } catch (e) {
        if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') oversize = true;
        else parseErr = true;
      }
      if (parseErr) { reply.code(400); return { error: 'Carga de archivo inválida.' }; }
      if (fileCount > 1) { reply.code(400); return { error: 'Subí exactamente un archivo.' }; }
      if (oversize) { reply.code(413); return { error: 'La imagen supera el máximo de 5 MB.' }; }
      if (fileCount === 0 || !buf) { reply.code(400); return { error: 'Se requiere un archivo de portada.' }; }

      let processed: { data: Buffer };
      try {
        assertAllowedImage(buf);
        processed = await processCover(buf);
      } catch (e) {
        reply.code(e instanceof CoverError && e.code === 'unsupported_type' ? 415 : 400);
        return { error: e instanceof Error ? e.message : 'Imagen inválida.' };
      }

      let root: string;
      try { root = await ensureWritableRoot(); }
      catch (e) { req.log.error({ err: e }, 'uploads dir no escribible (biblio cover)'); reply.code(500); return { error: 'Almacenamiento de portadas no disponible.' }; }

      try {
        await persistCover({
          root,
          data: processed.data,
          oldImageUrl: existing.cover_url,
          update: (url) => db.updateTable('biblio_titles')
            .set({ cover_url: url, updated_at: sql`now()` })
            .where('organization_id', '=', r.g.orgId).where('id', '=', id)
            .returning(['id'])
            .executeTakeFirst(),
        });
        await audit(db, r.g, 'biblio.title.cover_updated', id, existing.title);
        const title = await loadTitle(db, r.g.orgId, id);
        reply.code(200);
        return { title };
      } catch (e) {
        if (e instanceof StorageError) req.log.error({ err: e }, 'fallo de storage al guardar portada de título');
        reply.code(500);
        return { error: 'No se pudo guardar la portada.' };
      }
    });
  });

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
