// apps/api-v2/src/routes/reports.ts · reportes operativos (F4 PR-1).
//
// GET /api/v2/reports/attendance-by-activity?from=&to=&format=json|csv
//   REPORT_EXPORT_ROLES (owner/admin/puerta; operator/consulta → 403). Lectura del
//   dashboard (period-summary, categories): REPORT_READ_ROLES. RBAC en rbac-roles.ts
//   (fuente única API+web). Tenant-scoped por la sesión. Rate-limit + auditoría por generación
//   (sin PII). CSV con BOM UTF-8, Content-Disposition y celdas sanitizadas
//   (anti-injection). Cota dura de filas en report-data (sin truncado silencioso).

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getDb, withTenant } from '@contan2/db';
import type { ReportAttendanceByActivityResponse } from '@contan2/contracts';
import { requireTenantStaff, requireRole } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { REPORT_READ_ROLES, REPORT_EXPORT_ROLES, PROTOCOL_REPORT_ROLES, REPORT_CONTACT_ROLES } from '../rbac-roles.js';
import { attendanceByActivity, parseRange, ReportError, type ReportRange } from '../services/report-data.js';
import { consolidateCategories } from '../services/category-norm.js';
import { periodSummary } from '../services/reports/period-summary.js';
import { ACTIVITY_TYPES, type PeriodSummaryResponse } from '@contan2/contracts';
import { CSV_BOM, csvRow, safeFilename } from '../services/csv.js';
import { buildAttendanceWorkbook } from '../services/report-excel.js';
import { buildAttendancePdfHtml, attendancePdfHeaderFooter } from '../services/reports/attendance-pdf-template.js';
import { loadRegisterBook } from '../services/reports/monthly-register.js';
import { buildRegisterWorkbook, registerFilename } from '../services/reports/monthly-register-excel.js';
import { writeReportAudit } from '../services/report-audit.js';
import { loadActivityReportData } from '../services/reports/report-data.js';
import { periodEngine } from '../services/reports/period-engine.js';
import { buildActivityExcelReport, reportFilename } from '../services/reports/activity-excel-report.js';
import { buildActivityPdfHtml, pdfHeaderFooter, pdfFilename } from '../services/reports/activity-pdf-template.js';
import { buildPeriodExcelReport, periodFilename } from '../services/reports/period-excel-report.js';
import { buildPeriodPdfHtml, periodPdfHeaderFooter, periodPdfFilename } from '../services/reports/period-pdf-template.js';
import type { ReportOrg } from '../services/reports/pdf-shell.js';
import { renderHtmlToPdf } from '../services/reports/pdf-renderer.js';
import { zonedMidnight, ymdInTz } from '../services/reports/fmt.js';
import { loadProtocolReportData, buildProtocolExcelReport, protocolReportFilename } from '../services/reports/protocol-report.js';

const VALID_TYPES = new Set<string>(ACTIVITY_TYPES); // deriva del enum, no duplicar
const ACT_FILE_RE = /^([0-9a-f-]{36})\.(xlsx|pdf)$/i;

// Branding del tenant para las plantillas (shape camelCase de v1).
async function loadReportOrg(db: ReturnType<typeof getDb>, orgId: string): Promise<ReportOrg> {
  const o = await db.selectFrom('organizations')
    .select(['name', 'slug', 'primary_color', 'secondary_color', 'logo_url', 'credential_logo_url'])
    .where('id', '=', orgId).executeTakeFirstOrThrow();
  return { name: o.name, slug: o.slug, primaryColor: o.primary_color, secondaryColor: o.secondary_color, logoUrl: o.logo_url, credentialLogoUrl: o.credential_logo_url };
}

// from/to ISO: from inclusivo, to EXCLUSIVO (ya sumado 1 día); lo usa el protocolo.
interface PeriodQuery { from: string; to: string; types: string[] | null; categories: string[] | null }

// Query de informe (paridad v1 parsePeriodQuery): from/to YYYY-MM-DD (to se
// vuelve EXCLUSIVO sumando 1 día), types CSV del enum, categories texto libre.
function parsePeriodQuery(query: Record<string, unknown>, opts: { maxDays?: number } = {}):
  | { ok: true; q: PeriodQuery; range: ReportRange; types: string[] | null; categories: string[] | null }
  | { ok: false; error: string } {
  // Validación única (A07/A26): formato, fecha real de calendario, from <= to y tope de días
  // (parseRange). El protocolo con "todo el histórico" pasa un tope explícito mayor.
  let from: string, to: string, range: ReportRange;
  try {
    range = parseRange(String(query.from ?? '').trim(), String(query.to ?? '').trim(), opts);
    from = zonedMidnight(range.from).toISOString();
    to = range.toExclusive.toISOString();
  } catch (e) {
    if (e instanceof ReportError) return { ok: false, error: e.message };
    throw e;
  }

  let types: string[] | null = null;
  if (query.types) {
    types = String(query.types).split(',').map((t) => t.trim()).filter(Boolean);
    const bad = types.find((t) => !VALID_TYPES.has(t));
    if (bad) return { ok: false, error: `Tipo inválido: ${bad}` };
    if (types.length === 0) types = null;
  }
  let categories: string[] | null = null;
  if (query.categories) {
    categories = String(query.categories).split(',').map((c) => c.trim()).filter((c) => c.length > 0 && c.length <= 60);
    if (categories.length === 0) categories = null;
  }
  return { ok: true, q: { from, to, types, categories }, range, types, categories };
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORMATS = new Set(['json', 'csv', 'xlsx', 'pdf']);

// owner/admin/puerta generan y DESCARGAN informes (puerta: su operación); el
// export scoped a sus salas vive aparte en /puerta/export.xlsx.
const CAN_GENERATE_REPORTS = REPORT_EXPORT_ROLES;
// Límites por staff (no por IP: una oficina tras una sola IP no comparte cupo),
// separados: PDF (Chromium, caro) vs XLSX/CSV/JSON (barato) vs lectura del dashboard.
const reportLimiter = createRateLimiter({ max: 30, windowMs: 60_000, prefix: endpointPrefix('reports') });
const pdfLimiter = createRateLimiter({ max: 8, windowMs: 60_000, prefix: endpointPrefix('reports-pdf') });
const summaryLimiter = createRateLimiter({ max: 120, windowMs: 60_000, prefix: endpointPrefix('reports-summary') });
const READ_FORBIDDEN = 'No tienes permiso para ver los reportes.';

const CSV_HEADER = [
  'Actividad', 'Fecha', 'Lugar', 'Categoría', 'Estado',
  'Capacidad', 'Inscritos', 'Check-ins', 'Personas', 'Anónimos', 'Ocupación %', 'Reservados',
];

export const reportsRoute: FastifyPluginAsync = async (app) => {
  // Dashboard ejecutivo (read-only · REPORT_READ_ROLES). Agregados del
  // período + comparación con el anterior, todo desde datos reales.
  app.get('/reports/period-summary', async (req, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), REPORT_READ_ROLES, READ_FORBIDDEN);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if ((await summaryLimiter.hit(`${guard.ctx.org.id}:${guard.ctx.staff.id}`)).limited) { reply.code(429); return { error: 'Demasiadas consultas seguidas. Espera un momento.' }; }
    return withTenant(db, guard.ctx.org.id, async (db) => {
    const q = req.query as Record<string, unknown>;
    // types: CSV de tipos válidos (enum). Vacío/ausente = todos.
    const allowed = new Set<string>(ACTIVITY_TYPES);
    const types = String(q.types ?? '').split(',').map((t) => t.trim()).filter((t) => allowed.has(t));
    // categories: CSV texto libre (ciclos); el servicio compara normalizado.
    const categories = String(q.categories ?? '').split(',').map((c) => c.trim()).filter((c) => c.length > 0 && c.length <= 60).slice(0, 10);
    try {
      const range = parseRange(q.from, q.to);
      const body: PeriodSummaryResponse = await periodSummary(db, guard.ctx.org.id, range, types.length ? types : undefined, categories.length ? categories : undefined);
      return body;
    } catch (e) {
      if (e instanceof ReportError) { reply.code(e.status); return { error: e.message }; }
      throw e;
    }
    });
  });

  // Categorías/ciclos existentes del tenant (para el filtro de "reporte por ciclo").
  // REPORT_READ_ROLES; solo el texto de categoría (sin PII).
  app.get('/reports/categories', async (req, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), REPORT_READ_ROLES, READ_FORBIDDEN);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    return withTenant(db, guard.ctx.org.id, async (db) => {
    const rows = await db.selectFrom('activities')
      .select(['category'])
      .select(db.fn.countAll<string>().as('n'))
      .where('organization_id', '=', guard.ctx.org.id)
      .where('category', 'is not', null)
      .where('is_permanent', '=', false)
      .groupBy('category')
      .orderBy('category', 'asc')
      .execute();
    // Variantes de mayúsculas/acentos/espacios = la MISMA categoría: se
    // consolidan y se muestra la variante más usada (el filtro por categoría
    // también compara normalizado, así que el label elegido matchea todas).
    return { categories: consolidateCategories(rows.map((r) => ({ category: r.category as string, activities: Number(r.n) }))) };
    });
  });

  app.get('/reports/attendance-by-activity', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    return withTenant(db, guard.ctx.org.id, async (db) => {
    const { org, staff } = guard.ctx;
    if (!CAN_GENERATE_REPORTS.has(staff.role)) {
      reply.code(403);
      return { error: 'No tienes permiso para generar reportes.' };
    }
    if ((await reportLimiter.hit(`${org.id}:${staff.id}`)).limited) {
      reply.code(429);
      return { error: 'Demasiados reportes en poco tiempo. Espera un momento.' };
    }

    const q = req.query as Record<string, unknown>;
    const format = String(q.format ?? 'json').toLowerCase();
    if (!FORMATS.has(format)) {
      reply.code(400);
      return { error: 'Formato inválido: usa json, csv, xlsx o pdf.' };
    }
    if (format === 'pdf' && (await pdfLimiter.hit(`${org.id}:${staff.id}`)).limited) { reply.code(429); return { error: 'Demasiados PDF en poco tiempo. Espera un momento.' }; }

    const category = typeof q.category === 'string' && q.category.trim() ? q.category.trim() : undefined;
    // Mismos filtros que el dashboard (period-summary): types del enum y categories (lista).
    const allowedTypes = new Set<string>(ACTIVITY_TYPES);
    const types = String(q.types ?? '').split(',').map((t) => t.trim()).filter((t) => allowedTypes.has(t));
    const categories = String(q.categories ?? '').split(',').map((c) => c.trim()).filter((c) => c.length > 0 && c.length <= 60).slice(0, 10);
    let report;
    try {
      const range = parseRange(q.from, q.to);
      report = await attendanceByActivity(db, org.id, range, category, { types, categories });
    } catch (e) {
      if (e instanceof ReportError) { reply.code(e.status); return { error: e.message }; }
      throw e;
    }

    // Auditoría por generación (sin PII; metadata sólo rango + nº de filas).
    await writeReportAudit(db, {
      orgId: org.id,
      staff: { id: staff.id, email: staff.email, role: staff.role },
      report: 'attendance-by-activity',
      format,
      meta: { from: report.period.from, to: report.period.to, rows: report.rows.length },
      ip: req.ip,
      ua: req.headers['user-agent'] ?? null,
    });

    // Nombre de archivo: si hay filtro de ciclo, lo refleja (safeFilename limpia).
    const base = category || categories.length === 1
      ? `ciclo_${category ?? categories[0]}_${report.period.from}_${report.period.to}`
      : categories.length > 1 || types.length > 0
      ? `asistencia-filtrada_${report.period.from}_${report.period.to}`
      : `asistencia-por-actividad_${report.period.from}_${report.period.to}`;

    if (format === 'csv') {
      const lines = [csvRow(CSV_HEADER)];
      for (const r of report.rows) {
        lines.push(csvRow([
          r.name, ymdInTz(r.date), r.location, r.category ?? '', r.status,
          r.capacity, r.enrolledCount, r.attendances, r.people, r.anonymous, r.occupancyPct, r.reserved,
        ]));
      }
      lines.push(csvRow([
        'TOTAL', '', '', '', '',
        report.totals.capacity, '', report.totals.attendances, report.totals.people, report.totals.anonymous, report.totals.occupancyPct, report.totals.reserved,
      ]));
      const filename = safeFilename(`${base}.csv`);
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${filename}"`);
      return CSV_BOM + lines.join('\r\n') + '\r\n';
    }

    if (format === 'xlsx') {
      const buf = await buildAttendanceWorkbook(report, { name: org.name, primaryColor: org.primaryColor });
      const filename = safeFilename(`${base}.xlsx`);
      reply.header('content-type', XLSX_MIME);
      reply.header('content-disposition', `attachment; filename="${filename}"`);
      return buf;
    }

    if (format === 'pdf') {
      // PDF branded con KPIs + gráficos (misma tubería HTML→Chromium que los
      // informes de actividad y período), no una tabla plana.
      const organization = await loadReportOrg(db, org.id);
      const html = await buildAttendancePdfHtml({ organization, report, category: category ?? null });
      const buf = await renderHtmlToPdf(html, attendancePdfHeaderFooter({ organization, category: category ?? null }));
      const filename = safeFilename(`${base}.pdf`);
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `attachment; filename="${filename}"`);
      return buf;
    }

    const body: ReportAttendanceByActivityResponse = report;
    return body;
    });
  });

  // Registro mensual en el FORMATO DEL DEPARTAMENTO (Cine/Teatro): un mes
  // tabulado (8 columnas) + Total + Resumen. owner/admin, branded, auditado.
  // `month.xlsx` = una hoja del libro (+ Resumen + Listas); `year.xlsx` = libro anual
  // (12 hojas Ene–Dic + Resumen Mensual + Listas). Mismo constructor y mismas reglas.
  const registerRoute = (kind: 'month' | 'year') => async (req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    return withTenant(db, guard.ctx.org.id, async (db) => {
    const { org, staff } = guard.ctx;
    if (!CAN_GENERATE_REPORTS.has(staff.role)) { reply.code(403); return { error: 'No tienes permiso para generar reportes.' }; }
    if ((await reportLimiter.hit(`${org.id}:${staff.id}`)).limited) { reply.code(429); return { error: 'Demasiados reportes en poco tiempo. Espera un momento.' }; }

    const q = req.query as Record<string, unknown>;
    const year = Number(q.year);
    const month = kind === 'month' ? Number(q.month) : undefined;
    let book;
    try {
      book = await loadRegisterBook(db, org.id, year, month);
    } catch (e) {
      if (e instanceof ReportError) { reply.code(e.status); return { error: e.message }; }
      throw e;
    }

    await writeReportAudit(db, {
      orgId: org.id,
      staff: { id: staff.id, email: staff.email, role: staff.role },
      report: kind === 'month' ? 'monthly-register' : 'yearly-register',
      format: 'xlsx',
      meta: { year, ...(month !== undefined ? { month } : {}), rows: book.months.reduce((n, m) => n + m.rows.length, 0) },
      ip: req.ip,
      ua: req.headers['user-agent'] ?? null,
    });

    const buf = await buildRegisterWorkbook(book, { name: org.name, primaryColor: org.primaryColor });
    const filename = safeFilename(registerFilename(year, month));
    reply.header('content-type', XLSX_MIME);
    reply.header('content-disposition', `attachment; filename="${filename}"`);
    return buf;
    });
  };
  app.get('/reports/month.xlsx', registerRoute('month'));
  app.get('/reports/year.xlsx', registerRoute('year'));

  // ── Reportería BRANDED (S2 · paridad v1 /reports/*) ───────────────────────
  // Todos owner/admin + reportLimiter. PII masiva → superficie admin.

  // GET /api/v2/reports/activity/:file · file = <uuid>.(xlsx|pdf)
  app.get('/reports/activity/:file', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    return withTenant(db, guard.ctx.org.id, async (db) => {
    if (!CAN_GENERATE_REPORTS.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tienes permiso para generar reportes.' }; }
    if ((await reportLimiter.hit(`${guard.ctx.org.id}:${guard.ctx.staff.id}`)).limited) { reply.code(429); return { error: 'Demasiados reportes seguidos. Espera un momento.' }; }

    const m = ACT_FILE_RE.exec((req.params as { file: string }).file);
    if (!m) { reply.code(400); return { error: 'Ruta inválida: <id>.xlsx o <id>.pdf.' }; }
    const [, id, ext] = m;
    if (ext!.toLowerCase() === 'pdf' && (await pdfLimiter.hit(`${guard.ctx.org.id}:${guard.ctx.staff.id}`)).limited) { reply.code(429); return { error: 'Demasiados PDF en poco tiempo. Espera un momento.' }; }

    const data = await loadActivityReportData(db, guard.ctx.org.id, id!);
    if (!data) { reply.code(404); return { error: 'Actividad no encontrada.' }; }
    const organization = await loadReportOrg(db, guard.ctx.org.id);
    await writeReportAudit(db, {
      orgId: guard.ctx.org.id,
      staff: guard.ctx.staff,
      report: 'activity',
      format: ext!.toLowerCase(),
      meta: { activityId: id, contact: REPORT_CONTACT_ROLES.has(guard.ctx.staff.role) },
      ip: req.ip, ua: (req.headers['user-agent'] as string | undefined) ?? null,
    });

    if (ext!.toLowerCase() === 'xlsx') {
      const includeContact = REPORT_CONTACT_ROLES.has(guard.ctx.staff.role);
      const wb = await buildActivityExcelReport({ organization, ...data, includeContact });
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      reply.header('content-type', XLSX_MIME);
      reply.header('content-disposition', `attachment; filename="${reportFilename(data.activity)}"`);
      reply.header('cache-control', 'no-store');
      return reply.send(buf);
    }
    const html = await buildActivityPdfHtml({ organization, ...data, includeContact: REPORT_CONTACT_ROLES.has(guard.ctx.staff.role) });
    const hf = pdfHeaderFooter({ organization, activity: data.activity });
    const pdfBuf = await renderHtmlToPdf(html, hf);
    reply.header('content-type', 'application/pdf');
    reply.header('content-disposition', `attachment; filename="${pdfFilename(data.activity)}"`);
    reply.header('cache-control', 'no-store');
    return reply.send(pdfBuf);
    });
  });

  // GET /api/v2/reports/period.(xlsx|pdf) · informe de período branded.
  for (const ext of ['xlsx', 'pdf'] as const) {
    app.get(`/reports/period.${ext}`, async (req, reply) => {
      const db = getDb();
      const guard = await requireTenantStaff(db, req);
      if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    return withTenant(db, guard.ctx.org.id, async (db) => {
      if (!CAN_GENERATE_REPORTS.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tienes permiso para generar reportes.' }; }
      if ((await reportLimiter.hit(`${guard.ctx.org.id}:${guard.ctx.staff.id}`)).limited) { reply.code(429); return { error: 'Demasiados reportes seguidos. Espera un momento.' }; }
      if (ext === 'pdf' && (await pdfLimiter.hit(`${guard.ctx.org.id}:${guard.ctx.staff.id}`)).limited) { reply.code(429); return { error: 'Demasiados PDF en poco tiempo. Espera un momento.' }; }

      const parsed = parsePeriodQuery(req.query as Record<string, unknown>);
      if (!parsed.ok) { reply.code(400); return { error: parsed.error }; }

      const period = await periodEngine(db, guard.ctx.org.id, parsed.range, { types: parsed.types ?? undefined, categories: parsed.categories ?? undefined });
      const organization = await loadReportOrg(db, guard.ctx.org.id);
      await writeReportAudit(db, {
        orgId: guard.ctx.org.id,
        staff: guard.ctx.staff,
        report: 'period',
        format: ext,
        meta: { from: parsed.q.from, to: parsed.q.to },
        ip: req.ip, ua: (req.headers['user-agent'] as string | undefined) ?? null,
      });

      if (ext === 'xlsx') {
        const wb = await buildPeriodExcelReport({ organization, period });
        const buf = Buffer.from(await wb.xlsx.writeBuffer());
        reply.header('content-type', XLSX_MIME);
        reply.header('content-disposition', `attachment; filename="${periodFilename(parsed.range.from, parsed.range.to)}"`);
        reply.header('cache-control', 'no-store');
        return reply.send(buf);
      }
      const html = await buildPeriodPdfHtml({ organization, period });
      const hf = periodPdfHeaderFooter({ organization, period });
      const pdfBuf = await renderHtmlToPdf(html, hf);
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `attachment; filename="${periodPdfFilename(parsed.range.from, parsed.range.to)}"`);
      reply.header('cache-control', 'no-store');
      return reply.send(pdfBuf);
    });
    });
  }

  // GET /api/v2/reports/protocol.xlsx?from=&to= · reporte FORMAL de protocolo
  // (resumen + por actividad + detalle). Sin from/to → todo el histórico.
  // Accesible también al rol 'protocolo' (gestiona su módulo), no solo owner/admin.
  app.get('/reports/protocol.xlsx', async (req, reply) => {
    const db = getDb();
    const guard = requireRole(await requireTenantStaff(db, req), PROTOCOL_REPORT_ROLES, 'No tienes permiso para exportar protocolo.');
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if ((await reportLimiter.hit(`${guard.ctx.org.id}:${guard.ctx.staff.id}`)).limited) { reply.code(429); return { error: 'Demasiados reportes seguidos. Espera un momento.' }; }
    return withTenant(db, guard.ctx.org.id, async (db) => {

    // Rango: por defecto TODO (pasado y futuro, porque hay eventos próximos).
    const q = req.query as Record<string, unknown>;
    const hasRange = q.from != null && q.to != null;
    const fromRaw = String(q.from ?? '2020-01-01').trim();
    const toRaw = String(q.to ?? '2099-12-31').trim();
    // "Todo el histórico" (sin from/to) usa su propio tope explícito, mayor que el de los demás informes.
    const parsed = parsePeriodQuery({ from: fromRaw, to: toRaw }, { maxDays: 366 * 100 });
    if (!parsed.ok) { reply.code(400); return { error: parsed.error }; }

    const data = await loadProtocolReportData(db, guard.ctx.org.id, parsed.q.from, parsed.q.to);
    data.range = hasRange ? { from: fromRaw, to: toRaw } : { from: 'todo el histórico', to: '' };
    const organization = await loadReportOrg(db, guard.ctx.org.id);
    await writeReportAudit(db, {
      orgId: guard.ctx.org.id,
      staff: guard.ctx.staff,
      report: 'protocol',
      format: 'xlsx',
      meta: { from: fromRaw, to: toRaw },
      ip: req.ip, ua: (req.headers['user-agent'] as string | undefined) ?? null,
    });

    const wb = await buildProtocolExcelReport(organization, data);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    reply.header('content-type', XLSX_MIME);
    reply.header('content-disposition', `attachment; filename="${protocolReportFilename(fromRaw, toRaw)}"`);
    reply.header('cache-control', 'no-store');
    return reply.send(buf);
    });
  });
};
