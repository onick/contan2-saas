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
import { CSV_BOM, csvRow, safeFilename } from '../services/csv.js';
import { buildAttendanceWorkbook } from '../services/report-excel.js';
import { writeReportAudit } from '../services/report-audit.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const CAN_GENERATE_REPORTS = new Set(['owner', 'admin']);
const reportLimiter = createRateLimiter({ max: 20, windowMs: 60_000, prefix: endpointPrefix('reports') });

const CSV_HEADER = [
  'Actividad', 'Fecha', 'Lugar', 'Categoría', 'Estado',
  'Capacidad', 'Inscritos', 'Check-ins', 'Personas', 'Anónimos', 'Ocupación %',
];

export const reportsRoute: FastifyPluginAsync = async (app) => {
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
    if (format !== 'json' && format !== 'csv' && format !== 'xlsx') {
      reply.code(400);
      return { error: 'Formato inválido: usá json, csv o xlsx.' };
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

    const body: ReportAttendanceByActivityResponse = report;
    return body;
  });
};
