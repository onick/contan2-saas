// apps/api-v2/src/routes/reports.ts · reportes operativos (F4 PR-1).
//
// GET /api/v2/reports/attendance-by-activity?from=&to=&format=json|csv
//   owner/admin (operator → 403: los reportes son superficie admin, no operación
//   de puerta). Tenant-scoped por la sesión. Rate-limit + auditoría por generación
//   (sin PII). CSV con BOM UTF-8, Content-Disposition y celdas sanitizadas
//   (anti-injection). Cota dura de filas en report-data (sin truncado silencioso).

import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import type { ReportAttendanceByActivityResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { attendanceByActivity, parseRange, ReportError } from '../services/report-data.js';
import { periodSummary } from '../services/reports/period-summary.js';
import { ACTIVITY_TYPES, type PeriodSummaryResponse } from '@contan2/contracts';
import { CSV_BOM, csvRow, safeFilename } from '../services/csv.js';
import { buildAttendanceWorkbook } from '../services/report-excel.js';
import { buildAttendancePdf } from '../services/report-pdf.js';
import { writeReportAudit } from '../services/report-audit.js';
import { buildPeriodSummary, previousRange, loadActivityReportData, type PeriodQuery } from '../services/reports/report-data.js';
import { buildActivityExcelReport, reportFilename } from '../services/reports/activity-excel-report.js';
import { buildActivityPdfHtml, pdfHeaderFooter, pdfFilename } from '../services/reports/activity-pdf-template.js';
import { buildPeriodExcelReport, periodFilename } from '../services/reports/period-excel-report.js';
import { buildPeriodPdfHtml, periodPdfHeaderFooter, periodPdfFilename } from '../services/reports/period-pdf-template.js';
import { renderHtmlToPdf } from '../services/reports/pdf-renderer.js';

const VALID_TYPES = new Set(['exposicion', 'concierto', 'cine', 'taller', 'teatro', 'conferencia', 'otro']);
const ACT_FILE_RE = /^([0-9a-f-]{36})\.(xlsx|pdf)$/i;

// Branding del tenant para las plantillas (shape camelCase de v1).
interface ReportOrg { name: string; primaryColor: string | null; secondaryColor: string | null; logoUrl: string | null }
async function loadReportOrg(db: ReturnType<typeof getDb>, orgId: string): Promise<ReportOrg> {
  const o = await db.selectFrom('organizations')
    .select(['name', 'primary_color', 'secondary_color', 'logo_url'])
    .where('id', '=', orgId).executeTakeFirstOrThrow();
  return { name: o.name, primaryColor: o.primary_color, secondaryColor: o.secondary_color, logoUrl: o.logo_url };
}

// Query de período (paridad v1 parsePeriodQuery): from/to YYYY-MM-DD (to se
// vuelve EXCLUSIVO sumando 1 día), types CSV del enum, categories texto libre.
function parsePeriodQuery(query: Record<string, unknown>):
  | { ok: true; q: PeriodQuery }
  | { ok: false; error: string } {
  const fromRaw = String(query.from ?? '').trim();
  const toRaw = String(query.to ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) return { ok: false, error: 'from inválido (YYYY-MM-DD)' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) return { ok: false, error: 'to inválido (YYYY-MM-DD)' };
  const from = new Date(`${fromRaw}T00:00:00Z`).toISOString();
  const toDate = new Date(`${toRaw}T00:00:00Z`);
  toDate.setUTCDate(toDate.getUTCDate() + 1);
  const to = toDate.toISOString();
  if (new Date(from) > new Date(to)) return { ok: false, error: 'from debe ser <= to' };

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
  return { ok: true, q: { from, to, types, categories } };
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORMATS = new Set(['json', 'csv', 'xlsx', 'pdf']);

const CAN_GENERATE_REPORTS = new Set(['owner', 'admin']);
const reportLimiter = createRateLimiter({ max: 20, windowMs: 60_000, prefix: endpointPrefix('reports') });

const CSV_HEADER = [
  'Actividad', 'Fecha', 'Lugar', 'Categoría', 'Estado',
  'Capacidad', 'Inscritos', 'Check-ins', 'Personas', 'Anónimos', 'Ocupación %',
];

export const reportsRoute: FastifyPluginAsync = async (app) => {
  // Dashboard ejecutivo (read-only · cualquier staff del tenant). Agregados del
  // período + comparación con el anterior, todo desde datos reales.
  app.get('/reports/period-summary', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const q = req.query as Record<string, unknown>;
    // types: CSV de tipos válidos (enum). Vacío/ausente = todos.
    const allowed = new Set<string>(ACTIVITY_TYPES);
    const types = String(q.types ?? '').split(',').map((t) => t.trim()).filter((t) => allowed.has(t));
    try {
      const range = parseRange(q.from, q.to);
      const body: PeriodSummaryResponse = await periodSummary(db, guard.ctx.org.id, range, types.length ? types : undefined);
      return body;
    } catch (e) {
      if (e instanceof ReportError) { reply.code(e.status); return { error: e.message }; }
      throw e;
    }
  });

  app.get('/reports/attendance-by-activity', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    if (!CAN_GENERATE_REPORTS.has(staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para generar reportes.' };
    }
    if ((await reportLimiter.hit(`${org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiados reportes en poco tiempo. Esperá un momento.' };
    }

    const q = req.query as Record<string, unknown>;
    const format = String(q.format ?? 'json').toLowerCase();
    if (!FORMATS.has(format)) {
      reply.code(400);
      return { error: 'Formato inválido: usá json, csv, xlsx o pdf.' };
    }

    let report;
    try {
      const range = parseRange(q.from, q.to);
      report = await attendanceByActivity(db, org.id, range);
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

    if (format === 'csv') {
      const lines = [csvRow(CSV_HEADER)];
      for (const r of report.rows) {
        lines.push(csvRow([
          r.name, r.date.slice(0, 10), r.location, r.category ?? '', r.status,
          r.capacity, r.enrolledCount, r.attendances, r.people, r.anonymous, r.occupancyPct,
        ]));
      }
      lines.push(csvRow([
        'TOTAL', '', '', '', '',
        report.totals.capacity, '', report.totals.attendances, report.totals.people, report.totals.anonymous, report.totals.occupancyPct,
      ]));
      const filename = safeFilename(`asistencia-por-actividad_${report.period.from}_${report.period.to}.csv`);
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${filename}"`);
      return CSV_BOM + lines.join('\r\n') + '\r\n';
    }

    if (format === 'xlsx') {
      const buf = await buildAttendanceWorkbook(report, { name: org.name, primaryColor: org.primaryColor });
      const filename = safeFilename(`asistencia-por-actividad_${report.period.from}_${report.period.to}.xlsx`);
      reply.header('content-type', XLSX_MIME);
      reply.header('content-disposition', `attachment; filename="${filename}"`);
      return buf;
    }

    if (format === 'pdf') {
      const buf = await buildAttendancePdf(report, { name: org.name, primaryColor: org.primaryColor });
      const filename = safeFilename(`asistencia-por-actividad_${report.period.from}_${report.period.to}.pdf`);
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `attachment; filename="${filename}"`);
      return buf;
    }

    const body: ReportAttendanceByActivityResponse = report;
    return body;
  });

  // ── Reportería BRANDED (S2 · paridad v1 /reports/*) ───────────────────────
  // Todos owner/admin + reportLimiter. PII masiva → superficie admin.

  // GET /api/v2/reports/activity/:file · file = <uuid>.(xlsx|pdf)
  app.get('/reports/activity/:file', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!CAN_GENERATE_REPORTS.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para generar reportes.' }; }
    if ((await reportLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiados reportes seguidos. Espera un momento.' }; }

    const m = ACT_FILE_RE.exec((req.params as { file: string }).file);
    if (!m) { reply.code(400); return { error: 'Ruta inválida: <id>.xlsx o <id>.pdf.' }; }
    const [, id, ext] = m;

    const data = await loadActivityReportData(db, guard.ctx.org.id, id!);
    if (!data) { reply.code(404); return { error: 'Actividad no encontrada.' }; }
    const organization = await loadReportOrg(db, guard.ctx.org.id);
    await writeReportAudit(db, {
      orgId: guard.ctx.org.id,
      staff: guard.ctx.staff,
      report: 'activity',
      format: ext!.toLowerCase(),
      meta: { activityId: id },
      ip: req.ip, ua: (req.headers['user-agent'] as string | undefined) ?? null,
    });

    if (ext!.toLowerCase() === 'xlsx') {
      const wb = await buildActivityExcelReport({ organization, ...data });
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      reply.header('content-type', XLSX_MIME);
      reply.header('content-disposition', `attachment; filename="${reportFilename(data.activity)}"`);
      reply.header('cache-control', 'no-store');
      return reply.send(buf);
    }
    const html = await buildActivityPdfHtml({ organization, ...data });
    const hf = pdfHeaderFooter({ organization, activity: data.activity });
    const pdfBuf = await renderHtmlToPdf(html, hf);
    reply.header('content-type', 'application/pdf');
    reply.header('content-disposition', `attachment; filename="${pdfFilename(data.activity)}"`);
    reply.header('cache-control', 'no-store');
    return reply.send(pdfBuf);
  });

  // GET /api/v2/reports/period/preview · JSON con summary + deltas vs período anterior.
  app.get('/reports/period/preview', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!CAN_GENERATE_REPORTS.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para generar reportes.' }; }
    if ((await reportLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiados reportes seguidos. Espera un momento.' }; }

    const parsed = parsePeriodQuery(req.query as Record<string, unknown>);
    if (!parsed.ok) { reply.code(400); return { error: parsed.error }; }

    const prev = previousRange(parsed.q.from, parsed.q.to);
    const [period, prevPeriod] = await Promise.all([
      buildPeriodSummary(db, guard.ctx.org.id, parsed.q),
      prev
        ? (() => {
            const prevParsed = parsePeriodQuery({ from: prev.from, to: prev.to, types: parsed.q.types?.join(','), categories: parsed.q.categories?.join(',') });
            return prevParsed.ok ? buildPeriodSummary(db, guard.ctx.org.id, prevParsed.q).catch(() => null) : Promise.resolve(null);
          })()
        : Promise.resolve(null),
    ]);

    const deltaPct = (curr: number, before: number | null | undefined): number | null => {
      if (before == null || before === 0) return curr > 0 ? 100 : null;
      return Math.round(((curr - before) / before) * 100);
    };
    const comparison = prevPeriod
      ? {
          previousRange: prev,
          previous: prevPeriod.summary,
          deltas: {
            activitiesCount: deltaPct(period.summary.activitiesCount, prevPeriod.summary.activitiesCount),
            attendancesCount: deltaPct(period.summary.attendancesCount, prevPeriod.summary.attendancesCount),
            uniqueAttendees: deltaPct(period.summary.uniqueAttendees, prevPeriod.summary.uniqueAttendees),
            avgOccupancy: deltaPct(period.summary.avgOccupancy, prevPeriod.summary.avgOccupancy),
          },
        }
      : null;

    return {
      range: period.range,
      summary: period.summary,
      topActivities: period.topActivities,
      byType: period.byType,
      byMonth: period.byMonth,
      byDay: period.byDay,
      comparison,
    };
  });

  // GET /api/v2/reports/period.(xlsx|pdf) · informe de período branded.
  for (const ext of ['xlsx', 'pdf'] as const) {
    app.get(`/reports/period.${ext}`, async (req, reply) => {
      const db = getDb();
      const guard = await requireTenantStaff(db, req);
      if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
      if (!CAN_GENERATE_REPORTS.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para generar reportes.' }; }
      if ((await reportLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) { reply.code(429); return { error: 'Demasiados reportes seguidos. Espera un momento.' }; }

      const parsed = parsePeriodQuery(req.query as Record<string, unknown>);
      if (!parsed.ok) { reply.code(400); return { error: parsed.error }; }

      const period = await buildPeriodSummary(db, guard.ctx.org.id, parsed.q);
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
        reply.header('content-disposition', `attachment; filename="${periodFilename(parsed.q.from, parsed.q.to)}"`);
        reply.header('cache-control', 'no-store');
        return reply.send(buf);
      }
      const html = await buildPeriodPdfHtml({ organization, period });
      const hf = periodPdfHeaderFooter({ organization, period });
      const pdfBuf = await renderHtmlToPdf(html, hf);
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `attachment; filename="${periodPdfFilename(parsed.q.from, parsed.q.to)}"`);
      reply.header('cache-control', 'no-store');
      return reply.send(pdfBuf);
    });
  }
};
