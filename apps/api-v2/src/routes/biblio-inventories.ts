// apps/api-v2/src/routes/biblio-inventories.ts · Módulo Biblioteca — F6
// INVENTARIO físico. Sesión de conteo (mig 055): se escanean ejemplares y el
// resultado se DERIVA (encontrado / fuera_ubicacion / prestado / pendiente /
// faltante al finalizar). Un inventario en progreso por organización.
//   GET  /biblio/inventories             · activa + anteriores (con conteos)
//   POST /biblio/inventories             · abrir sesión (409 si hay una abierta)
//   POST /biblio/inventories/:id/scan    · escanear ejemplar (idempotente-informativo)
//   POST /biblio/inventories/:id/finish  · finalizar (congela el resumen)
//   GET  /biblio/inventories/:id/items   · filas (tab: todos|escaneados|faltantes|fuera|prestados)
//   GET  /biblio/inventories/:id/export.xlsx · resultados en Excel
//   GET  /biblio/retired-items           · tab Bajas (ejemplares dados de baja)
// Roles owner/admin/biblioteca · withTenant (RLS) · auditado.

import ExcelJS from 'exceljs';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, withTenant, type DbClient } from '@contan2/db';
import {
  BiblioInventoryCreateSchema,
  type BiblioInventory, type BiblioInventoriesListResponse,
  type BiblioInventoryItem, type BiblioInventoryItemsResponse, type BiblioInventoryScanResponse,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { safeFilename } from '../services/csv.js';

const BIBLIO_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'biblioteca']);
const limiter = createRateLimiter({ max: 600, windowMs: 60_000, prefix: endpointPrefix('biblio-inventories') });

const PAGE_SIZE_MAX = 50;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Guarded = { orgId: string; staffId: string; staffRole: string; orgName: string; primaryColor: string | null };

async function audit(db: DbClient, g: Guarded, action: string, targetId: string, label: string, metadata: Record<string, unknown> = {}) {
  await db.insertInto('tenant_audit_log').values({
    organization_id: g.orgId, actor_staff_id: g.staffId, actor_email_masked: null,
    actor_role: g.staffRole, action, target_type: 'biblio', target_id: targetId,
    target_label: label.slice(0, 200), metadata: JSON.stringify(metadata),
  }).execute();
}

// Alcance de la sesión (alias `i` = ejemplar, `sc` = su escaneo en esta sesión):
// ejemplares VIVOS registrados en el sitio (o todos si la sesión es global) MÁS
// los de otro sitio que se escanearon en esta sesión (fuera de ubicación).
function scopeItems(db: DbClient, orgId: string, inv: { id: string; site_id: string | null }) {
  let q = db.selectFrom('biblio_items as i')
    .leftJoin('biblio_inventory_scans as sc', (join) => join
      .onRef('sc.item_id', '=', 'i.id').on('sc.inventory_id', '=', inv.id))
    .where('i.organization_id', '=', orgId)
    .where('i.retired_at', 'is', null);
  if (inv.site_id) q = q.where((eb) => eb.or([eb('i.site_id', '=', inv.site_id as string), eb('sc.id', 'is not', null)]));
  return q;
}
// ¿El ejemplar está registrado en el sitio de la sesión? (esperado vs. extra escaneado)
const inSiteSql = (siteId: string | null) => siteId
  ? sql<boolean>`i.site_id = ${siteId}`
  : sql<boolean>`true`;

// Conteos derivados de una sesión (en vivo).
async function liveCounts(db: DbClient, orgId: string, inv: { id: string; site_id: string | null }) {
  const row = await scopeItems(db, orgId, inv)
    .select([
      sql<string>`count(*) filter (where ${inSiteSql(inv.site_id)})`.as('expected'),
      sql<string>`count(sc.id)`.as('scanned'),
      sql<string>`count(sc.id) filter (where not sc.misplaced)`.as('found'),
      sql<string>`count(sc.id) filter (where sc.misplaced)`.as('misplaced'),
      sql<string>`count(*) filter (where sc.id is null and ${inSiteSql(inv.site_id)} and exists (
        select 1 from biblio_loans l where l.item_id = i.id and l.returned_at is null))`.as('onloan'),
    ])
    .executeTakeFirst();
  const expected = Number(row?.expected ?? 0);
  const scanned = Number(row?.scanned ?? 0);
  const onLoan = Number(row?.onloan ?? 0);
  return {
    expected, scanned,
    found: Number(row?.found ?? 0),
    misplaced: Number(row?.misplaced ?? 0),
    onLoan,
    // Los escaneos fuera de ubicación son EXTRAS: no descuentan esperados.
    missing: Math.max(0, expected - (scanned - Number(row?.misplaced ?? 0)) - onLoan),
  };
}

interface InvRow {
  id: string; name: string; status: string; site_id: string | null; site_name: string | null;
  started_by: string | null; started_at: Date | string; finished_at: Date | string | null;
  expected_count: number | null; scanned_count: number | null; found_count: number | null;
  misplaced_count: number | null; missing_count: number | null;
}
async function toInventory(db: DbClient, orgId: string, r: InvRow): Promise<BiblioInventory> {
  const frozen = r.status !== 'en_progreso' && r.expected_count !== null;
  const counts = frozen
    ? {
        expected: Number(r.expected_count), scanned: Number(r.scanned_count ?? 0),
        found: Number(r.found_count ?? 0), misplaced: Number(r.misplaced_count ?? 0),
        onLoan: Math.max(0, Number(r.expected_count) - (Number(r.scanned_count ?? 0) - Number(r.misplaced_count ?? 0)) - Number(r.missing_count ?? 0)),
        missing: Number(r.missing_count ?? 0),
      }
    : await liveCounts(db, orgId, { id: r.id, site_id: r.site_id });
  return {
    id: r.id, name: r.name, status: r.status as BiblioInventory['status'],
    siteId: r.site_id, siteName: r.site_name,
    startedByName: r.started_by,
    startedAt: new Date(r.started_at as string).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at as string).toISOString() : null,
    ...counts,
  };
}

function invBase(db: DbClient, orgId: string) {
  return db.selectFrom('biblio_inventories as v')
    .leftJoin('biblio_sites as s', 's.id', 'v.site_id')
    .leftJoin('staff_members as st', 'st.id', 'v.started_by_staff_id')
    .select(['v.id', 'v.name', 'v.status', 'v.site_id', 's.name as site_name',
      'st.full_name as started_by', 'v.started_at', 'v.finished_at',
      'v.expected_count', 'v.scanned_count', 'v.found_count', 'v.misplaced_count', 'v.missing_count'])
    .where('v.organization_id', '=', orgId);
}

// Estado operativo del ejemplar (para la columna Estado).
const estadoSql = sql<string>`case
  when i.retired_at is not null then 'baja'
  when exists (select 1 from biblio_loans l where l.item_id = i.id and l.returned_at is null) then 'prestado'
  when exists (select 1 from biblio_reservations r where r.ready_item_id = i.id and r.status = 'lista') then 'reservado'
  when i.physical_status in ('reparacion', 'deteriorado', 'extraviado') then i.physical_status
  else 'disponible' end`;

export const biblioInventoriesRoute: FastifyPluginAsync = async (app) => {
  async function gate(req: FastifyRequest, reply: { code: (n: number) => void }): Promise<{ ok: true; g: Guarded } | { ok: false; body: { error: string } }> {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { ok: false, body: { error: guard.error } }; }
    if (!BIBLIO_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { ok: false, body: { error: 'No tenés permiso para el módulo Biblioteca.' } }; }
    if ((await limiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) { reply.code(429); return { ok: false, body: { error: 'Demasiadas operaciones seguidas. Esperá un momento.' } }; }
    return { ok: true, g: { orgId: guard.ctx.org.id, staffId: guard.ctx.staff.id, staffRole: guard.ctx.staff.role, orgName: guard.ctx.org.name, primaryColor: guard.ctx.org.primaryColor ?? null } };
  }

  // ── Sesiones: activa + anteriores ──────────────────────────────────────────
  app.get('/biblio/inventories', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const rows = await invBase(db, r.g.orgId).orderBy('v.started_at', 'desc').limit(25).execute();
      let active: BiblioInventory | null = null;
      const previous: BiblioInventory[] = [];
      for (const row of rows) {
        const inv = await toInventory(db, r.g.orgId, row as unknown as InvRow);
        if (inv.status === 'en_progreso') active = inv;
        else previous.push(inv);
      }
      const body: BiblioInventoriesListResponse = { active, previous };
      return body;
    });
  });

  // ── Abrir sesión ───────────────────────────────────────────────────────────
  app.post('/biblio/inventories', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const parsed = BiblioInventoryCreateSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'Datos inválidos.' }; }
    const p = parsed.data;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      if (p.siteId) {
        const site = await db.selectFrom('biblio_sites').select('id')
          .where('organization_id', '=', r.g.orgId).where('id', '=', p.siteId).executeTakeFirst();
        if (!site) { reply.code(400); return { error: 'Sitio inexistente.' }; }
      }
      try {
        const ins = await db.insertInto('biblio_inventories').values({
          organization_id: r.g.orgId, name: p.name, site_id: p.siteId ?? null,
          started_by_staff_id: r.g.staffId,
        }).returning('id').executeTakeFirstOrThrow();
        await audit(db, r.g, 'biblio.inventory.started', ins.id, p.name, { siteId: p.siteId ?? null });
        const row = await invBase(db, r.g.orgId).where('v.id', '=', ins.id).executeTakeFirstOrThrow();
        reply.code(201);
        return { inventory: await toInventory(db, r.g.orgId, row as unknown as InvRow) };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') {
          reply.code(409);
          return { error: 'Ya hay un inventario en progreso — finalizalo primero.' };
        }
        throw e;
      }
    });
  });

  // ── Escanear ejemplar ──────────────────────────────────────────────────────
  app.post('/biblio/inventories/:id/scan', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const invId = (req.params as { id: string }).id;
    const code = typeof (req.body as Record<string, unknown>)?.inventoryCode === 'string'
      ? ((req.body as Record<string, unknown>).inventoryCode as string).trim() : '';
    if (!code) { reply.code(400); return { error: 'Falta el código del ejemplar.' }; }

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const inv = await db.selectFrom('biblio_inventories').select(['id', 'site_id', 'status'])
        .where('organization_id', '=', r.g.orgId).where('id', '=', invId).executeTakeFirst();
      if (!inv) { reply.code(404); return { error: 'Inventario no encontrado.' }; }
      if (inv.status !== 'en_progreso') { reply.code(409); return { error: 'Ese inventario ya está finalizado.' }; }

      const item = await db.selectFrom('biblio_items as i')
        .innerJoin('biblio_titles as t', 't.id', 'i.title_id')
        .leftJoin('biblio_sites as s', 's.id', 'i.site_id')
        .select(['i.id', 'i.inventory_code', 'i.site_id', 'i.retired_at', 's.name as site_name', 'i.shelf', 't.title'])
        .where('i.organization_id', '=', r.g.orgId)
        .where(sql<boolean>`upper(i.inventory_code) = ${code.toUpperCase()}`)
        .executeTakeFirst();
      if (!item) { reply.code(404); return { error: 'Ese código de ejemplar no existe.' }; }
      if (item.retired_at) { reply.code(409); return { error: 'Ese ejemplar está dado de baja — no entra al inventario.' }; }

      // Fuera de ubicación: la sesión es de UN sitio y el ejemplar está
      // registrado en otro (apareció físicamente acá).
      const misplaced = inv.site_id !== null && item.site_id !== inv.site_id;
      const onLoan = await db.selectFrom('biblio_loans').select('id')
        .where('organization_id', '=', r.g.orgId).where('item_id', '=', item.id)
        .where('returned_at', 'is', null).executeTakeFirst();

      const ins = await db.insertInto('biblio_inventory_scans').values({
        organization_id: r.g.orgId, inventory_id: invId, item_id: item.id,
        found_site_id: inv.site_id, misplaced, scanned_by_staff_id: r.g.staffId,
      }).onConflict((oc) => oc.columns(['inventory_id', 'item_id']).doNothing())
        .returning('id').executeTakeFirst();

      const counts = await liveCounts(db, r.g.orgId, { id: invId, site_id: inv.site_id });
      const body: BiblioInventoryScanResponse = {
        result: !ins ? 'ya_escaneado' : onLoan ? 'prestado' : misplaced ? 'fuera_ubicacion' : 'encontrado',
        item: { inventoryCode: item.inventory_code, title: item.title, siteName: item.site_name ?? null, shelf: item.shelf },
        scanned: counts.scanned, expected: counts.expected,
      };
      return body;
    });
  });

  // ── Finalizar (congela el resumen) ─────────────────────────────────────────
  app.post('/biblio/inventories/:id/finish', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const invId = (req.params as { id: string }).id;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const inv = await db.selectFrom('biblio_inventories').select(['id', 'name', 'site_id', 'status'])
        .where('organization_id', '=', r.g.orgId).where('id', '=', invId).executeTakeFirst();
      if (!inv) { reply.code(404); return { error: 'Inventario no encontrado.' }; }
      if (inv.status !== 'en_progreso') { reply.code(409); return { error: 'Ese inventario ya está finalizado.' }; }

      const c = await liveCounts(db, r.g.orgId, { id: invId, site_id: inv.site_id });
      await db.updateTable('biblio_inventories')
        .set({
          status: 'finalizado', finished_at: sql`now()`,
          expected_count: c.expected, scanned_count: c.scanned, found_count: c.found,
          misplaced_count: c.misplaced, missing_count: c.missing,
          updated_at: sql`now()`,
        })
        .where('organization_id', '=', r.g.orgId).where('id', '=', invId)
        .execute();
      await audit(db, r.g, 'biblio.inventory.finished', invId, inv.name, c);
      const row = await invBase(db, r.g.orgId).where('v.id', '=', invId).executeTakeFirstOrThrow();
      return { inventory: await toInventory(db, r.g.orgId, row as unknown as InvRow) };
    });
  });

  // ── Filas de la sesión (tabla + tabs) ──────────────────────────────────────
  app.get('/biblio/inventories/:id/items', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const invId = (req.params as { id: string }).id;
    const q = req.query as Record<string, unknown>;
    const tab = typeof q.tab === 'string' ? q.tab : 'todos'; // todos|escaneados|faltantes|fuera|prestados
    const term = typeof q.q === 'string' ? q.q.trim().slice(0, 120) : '';
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(q.pageSize) || 20));

    return withTenant(getDb(), r.g.orgId, async (db) => {
      const inv = await db.selectFrom('biblio_inventories').select(['id', 'site_id', 'status'])
        .where('organization_id', '=', r.g.orgId).where('id', '=', invId).executeTakeFirst();
      if (!inv) { reply.code(404); return { error: 'Inventario no encontrado.' }; }
      const finished = inv.status !== 'en_progreso';

      let base = scopeItems(db, r.g.orgId, { id: invId, site_id: inv.site_id })
        .innerJoin('biblio_titles as t', 't.id', 'i.title_id')
        .leftJoin('biblio_sites as s', 's.id', 'i.site_id')
        .leftJoin('biblio_sites as fs', 'fs.id', 'sc.found_site_id');
      const onLoanSql = sql<boolean>`exists (select 1 from biblio_loans l where l.item_id = i.id and l.returned_at is null)`;
      if (tab === 'escaneados') base = base.where(sql<boolean>`sc.id is not null`);
      if (tab === 'fuera') base = base.where(sql<boolean>`sc.id is not null and sc.misplaced`);
      if (tab === 'faltantes') base = base.where(sql<boolean>`sc.id is null`).where(sql<boolean>`not ${onLoanSql}`);
      if (tab === 'prestados') base = base.where(sql<boolean>`sc.id is null`).where(onLoanSql);
      if (term) {
        const like = `%${term.toLowerCase()}%`;
        base = base.where((eb) => eb.or([
          sql<boolean>`lower(t.title) like ${like}`,
          sql<boolean>`lower(t.authors::text) like ${like}`,
          sql<boolean>`lower(i.inventory_code) like ${like}`,
          sql<boolean>`lower(coalesce(i.call_number, t.call_number, '')) like ${like}`,
          sql<boolean>`lower(coalesce(t.isbn, '')) like ${like}`,
        ]));
      }
      const totalRow = await base.select(db.fn.countAll<string>().as('n')).executeTakeFirst();
      const rows = await base
        .select(['i.id', 'i.inventory_code', 't.id as title_id', 't.title', 't.authors', 't.cover_url',
          sql<string | null>`coalesce(i.call_number, t.call_number)`.as('call_number'),
          's.name as site_name', 'i.shelf', 'i.retired_reason',
          'sc.id as scan_id', 'sc.misplaced', 'sc.scanned_at', 'fs.name as found_site_name'])
        .select(estadoSql.as('estado'))
        .select(onLoanSql.as('on_loan'))
        .orderBy(sql`sc.id is null`, 'desc')
        .orderBy('i.inventory_code', 'asc')
        .limit(pageSize).offset((page - 1) * pageSize)
        .execute();

      const body: BiblioInventoryItemsResponse = {
        items: rows.map((x): BiblioInventoryItem => ({
          itemId: x.id, inventoryCode: x.inventory_code,
          titleId: x.title_id, title: x.title,
          authors: Array.isArray(x.authors) ? (x.authors as string[]) : [],
          coverUrl: x.cover_url, callNumber: x.call_number,
          siteName: x.site_name ?? null, shelf: x.shelf,
          estado: x.estado as BiblioInventoryItem['estado'],
          resultado: x.scan_id
            ? (x.misplaced ? 'fuera_ubicacion' : 'encontrado')
            : x.on_loan ? 'prestado' : finished ? 'faltante' : 'pendiente',
          scannedAt: x.scanned_at ? new Date(x.scanned_at as unknown as string).toISOString() : null,
          foundSiteName: x.misplaced ? (x.found_site_name ?? null) : null,
          retiredReason: x.retired_reason,
        })),
        total: Number(totalRow?.n ?? 0), page, pageSize,
      };
      return body;
    });
  });

  // ── Export .xlsx de los resultados ─────────────────────────────────────────
  app.get('/biblio/inventories/:id/export.xlsx', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const invId = (req.params as { id: string }).id;
    return withTenant(getDb(), r.g.orgId, async (db) => {
      const invRow = await invBase(db, r.g.orgId).where('v.id', '=', invId).executeTakeFirst();
      if (!invRow) { reply.code(404); return { error: 'Inventario no encontrado.' }; }
      const inv = await toInventory(db, r.g.orgId, invRow as unknown as InvRow);
      const finished = inv.status !== 'en_progreso';

      const rows = await scopeItems(db, r.g.orgId, { id: invId, site_id: inv.siteId })
        .innerJoin('biblio_titles as t', 't.id', 'i.title_id')
        .leftJoin('biblio_sites as s', 's.id', 'i.site_id')
        .select(['i.inventory_code', 't.title', 't.authors',
          sql<string | null>`coalesce(i.call_number, t.call_number)`.as('call_number'),
          's.name as site_name', 'i.shelf', 'sc.id as scan_id', 'sc.misplaced', 'sc.scanned_at'])
        .select(sql<boolean>`exists (select 1 from biblio_loans l where l.item_id = i.id and l.returned_at is null)`.as('on_loan'))
        .orderBy('i.inventory_code', 'asc')
        .limit(20_000)
        .execute();

      const brandHex = (r.g.primaryColor ?? '').replace('#', '').trim();
      const brand = /^[0-9a-fA-F]{6}$/.test(brandHex) ? `FF${brandHex.toUpperCase()}` : 'FFF39228';
      const wb = new ExcelJS.Workbook();
      wb.creator = r.g.orgName;
      const ws = wb.addWorksheet('Inventario');
      const HEADERS = ['Código', 'Título', 'Autores', 'Signatura', 'Ubicación', 'Estante', 'Resultado', 'Escaneado'];
      ws.mergeCells(1, 1, 1, HEADERS.length);
      const title = ws.getCell(1, 1);
      title.value = `${r.g.orgName} · ${inv.name} — ${inv.siteName ?? 'Todo el acervo'} (${inv.status === 'en_progreso' ? 'en progreso' : 'finalizado'})`;
      title.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
      title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
      ws.getRow(1).height = 24;
      ws.mergeCells(2, 1, 2, HEADERS.length);
      ws.getCell(2, 1).value = `Esperados ${inv.expected} · escaneados ${inv.scanned} · encontrados ${inv.found} · fuera de ubicación ${inv.misplaced} · prestados ${inv.onLoan} · ${finished ? 'faltantes' : 'pendientes'} ${inv.missing}`;
      ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF636769' } };
      const head = ws.getRow(4);
      HEADERS.forEach((h, i) => {
        const c = head.getCell(i + 1);
        c.value = h;
        c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand } };
      });
      rows.forEach((x, idx) => {
        const resultado = x.scan_id
          ? (x.misplaced ? 'Fuera de ubicación' : 'Encontrado')
          : x.on_loan ? 'Prestado' : finished ? 'FALTANTE' : 'Pendiente';
        const row = ws.getRow(5 + idx);
        const vals = [
          x.inventory_code, x.title,
          Array.isArray(x.authors) ? (x.authors as string[]).join('; ') : '',
          x.call_number ?? '', x.site_name ?? '', x.shelf ?? '', resultado,
          x.scanned_at ? new Date(x.scanned_at as unknown as string).toISOString().slice(0, 16).replace('T', ' ') : '',
        ];
        vals.forEach((v, i) => { row.getCell(i + 1).value = v; });
      });
      [16, 40, 28, 14, 18, 14, 16, 17].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: 4 }];

      await audit(db, r.g, 'biblio.inventory.exported', invId, inv.name, { rows: rows.length });
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      reply.header('content-type', XLSX_MIME);
      reply.header('content-disposition', `attachment; filename="${safeFilename('inventario_biblioteca.xlsx')}"`);
      reply.header('cache-control', 'no-store');
      return reply.send(buf);
    });
  });

  // ── Bajas (tab): ejemplares dados de baja ──────────────────────────────────
  app.get('/biblio/retired-items', async (req: FastifyRequest, reply) => {
    const r = await gate(req, reply); if (!r.ok) return r.body;
    const q = req.query as Record<string, unknown>;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(q.pageSize) || 20));
    return withTenant(getDb(), r.g.orgId, async (db) => {
      let base = db.selectFrom('biblio_items as i')
        .innerJoin('biblio_titles as t', 't.id', 'i.title_id')
        .leftJoin('biblio_sites as s', 's.id', 'i.site_id')
        .where('i.organization_id', '=', r.g.orgId)
        .where('i.retired_at', 'is not', null);
      const term = typeof q.q === 'string' ? q.q.trim().slice(0, 120) : '';
      if (term) {
        const like = `%${term.toLowerCase()}%`;
        base = base.where((eb) => eb.or([
          sql<boolean>`lower(t.title) like ${like}`,
          sql<boolean>`lower(i.inventory_code) like ${like}`,
          sql<boolean>`lower(coalesce(i.retired_reason, '')) like ${like}`,
        ]));
      }
      const totalRow = await base.select(db.fn.countAll<string>().as('n')).executeTakeFirst();
      const rows = await base
        .select(['i.id', 'i.inventory_code', 't.id as title_id', 't.title', 't.authors', 't.cover_url',
          sql<string | null>`coalesce(i.call_number, t.call_number)`.as('call_number'),
          's.name as site_name', 'i.shelf', 'i.retired_at', 'i.retired_reason'])
        .orderBy('i.retired_at', 'desc')
        .limit(pageSize).offset((page - 1) * pageSize)
        .execute();
      const body: BiblioInventoryItemsResponse = {
        items: rows.map((x): BiblioInventoryItem => ({
          itemId: x.id, inventoryCode: x.inventory_code,
          titleId: x.title_id, title: x.title,
          authors: Array.isArray(x.authors) ? (x.authors as string[]) : [],
          coverUrl: x.cover_url, callNumber: x.call_number,
          siteName: x.site_name ?? null, shelf: x.shelf,
          estado: 'baja',
          resultado: 'faltante', // no aplica; la UI de Bajas usa retiredReason
          scannedAt: x.retired_at ? new Date(x.retired_at as unknown as string).toISOString() : null,
          foundSiteName: null,
          retiredReason: x.retired_reason,
        })),
        total: Number(totalRow?.n ?? 0), page, pageSize,
      };
      return body;
    });
  });
};
