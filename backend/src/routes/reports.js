import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { buildActivityExcelReport, reportFilename } from '../services/reports/activityExcelReport.js';
import { buildActivityPdfHtml, pdfHeaderFooter, pdfFilename } from '../services/reports/activityPdfTemplate.js';
import { renderHtmlToPdf } from '../services/reports/pdfRenderer.js';
import { buildPeriodSummary, previousRange } from '../services/reports/periodAggregator.js';
import { buildPeriodExcelReport, periodFilename } from '../services/reports/periodExcelReport.js';
import { buildPeriodPdfHtml, periodPdfHeaderFooter, periodPdfFilename } from '../services/reports/periodPdfTemplate.js';

const VALID_TYPES = new Set(['exposicion', 'concierto', 'cine', 'taller', 'teatro', 'conferencia', 'otro']);

function parsePeriodQuery(req) {
  const fromRaw = String(req.query.from || '').trim();
  const toRaw = String(req.query.to || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) throw new HttpError(400, 'from inválido (YYYY-MM-DD)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) throw new HttpError(400, 'to inválido (YYYY-MM-DD)');
  const from = new Date(fromRaw + 'T00:00:00Z').toISOString();
  // to es exclusivo: incluimos el día completo añadiendo 1 día.
  const toDate = new Date(toRaw + 'T00:00:00Z');
  toDate.setUTCDate(toDate.getUTCDate() + 1);
  const to = toDate.toISOString();
  if (new Date(from) > new Date(to)) throw new HttpError(400, 'from debe ser <= to');

  let types = null;
  if (req.query.types) {
    types = String(req.query.types).split(',').map(s => s.trim()).filter(Boolean);
    const bad = types.find(t => !VALID_TYPES.has(t));
    if (bad) throw new HttpError(400, `Tipo inválido: ${bad}`);
  }
  return { from, to, types };
}

async function loadActivityReportData(req) {
  if (!req.organization) throw new HttpError(404, 'Sin organización');
  const activity = await req.repos.activities.findById(req.params.id);
  if (!activity) throw new HttpError(404, 'Actividad no encontrada');

  const attendances = await req.repos.attendance.findByActivityId(req.params.id);
  const usersAndAffs = await Promise.all(
    attendances.map(async att => {
      const user = await req.repos.users.findById(att.userId);
      if (!user) return { user: null, affinity: { totalAttendances: 0 } };
      const allAtts = await req.repos.attendance.findByUserId(user.id);
      return { user, affinity: { totalAttendances: allAtts.length } };
    }),
  );
  const users = usersAndAffs.map(x => x.user).filter(Boolean);
  const affinities = usersAndAffs.map(x => x.affinity);
  return { activity, attendances, users, affinities };
}

export function createReportsRouter() {
  const router = Router();

  // GET /api/reports/activity/:id.xlsx — informe Excel branded.
  router.get('/activity/:id.xlsx', async (req, res, next) => {
    try {
      const data = await loadActivityReportData(req);
      const wb = await buildActivityExcelReport({
        organization: req.organization,
        ...data,
      });
      const filename = reportFilename(data.activity);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      next(e);
    }
  });

  // GET /api/reports/period/preview — JSON con summary/topActivities/byType
  // para mostrar vista previa en la UI sin generar el documento completo.
  router.get('/period/preview', async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Sin organización');
      const { from, to, types } = parsePeriodQuery(req);

      // Cargamos en paralelo el período actual y el anterior (mismo span)
      // para calcular deltas en la vista previa.
      const prev = previousRange(from, to);
      const [period, prevPeriod] = await Promise.all([
        buildPeriodSummary({ repos: req.repos, from, to, types }),
        prev
          ? buildPeriodSummary({ repos: req.repos, from: prev.from, to: prev.to, types })
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      // Helper de delta %: positivo si subió, negativo si bajó, null si era 0
      const deltaPct = (curr, before) => {
        if (before == null || before === 0) return curr > 0 ? 100 : null;
        return Math.round(((curr - before) / before) * 100);
      };

      const comparison = prevPeriod ? {
        previousRange: prev,
        previous: prevPeriod.summary,
        deltas: {
          activitiesCount: deltaPct(period.summary.activitiesCount, prevPeriod.summary.activitiesCount),
          attendancesCount: deltaPct(period.summary.attendancesCount, prevPeriod.summary.attendancesCount),
          uniqueAttendees: deltaPct(period.summary.uniqueAttendees, prevPeriod.summary.uniqueAttendees),
          avgOccupancy: deltaPct(period.summary.avgOccupancy, prevPeriod.summary.avgOccupancy),
        },
      } : null;

      res.json({
        range: period.range,
        summary: period.summary,
        topActivities: period.topActivities,
        byType: period.byType,
        byMonth: period.byMonth,
        byDay: period.byDay,
        comparison,
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/reports/period.xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD&types=cine,taller
  router.get('/period.xlsx', async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Sin organización');
      const { from, to, types } = parsePeriodQuery(req);
      const period = await buildPeriodSummary({ repos: req.repos, from, to, types });
      const wb = await buildPeriodExcelReport({ organization: req.organization, period });

      const filename = periodFilename(from, to);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      next(e);
    }
  });

  // GET /api/reports/period.pdf — mismo rango y tipos que el Excel.
  router.get('/period.pdf', async (req, res, next) => {
    try {
      if (!req.organization) throw new HttpError(404, 'Sin organización');
      const { from, to, types } = parsePeriodQuery(req);
      const period = await buildPeriodSummary({ repos: req.repos, from, to, types });
      const html = await buildPeriodPdfHtml({ organization: req.organization, period });
      const hf = periodPdfHeaderFooter({ organization: req.organization, period });
      const pdfBuf = await renderHtmlToPdf(html, hf);

      const filename = periodPdfFilename(from, to);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', pdfBuf.length);
      res.end(pdfBuf);
    } catch (e) {
      next(e);
    }
  });

  // GET /api/reports/activity/:id.pdf — informe PDF branded vía Puppeteer.
  router.get('/activity/:id.pdf', async (req, res, next) => {
    try {
      const data = await loadActivityReportData(req);
      const html = await buildActivityPdfHtml({
        organization: req.organization,
        ...data,
      });
      const hf = pdfHeaderFooter({ organization: req.organization, activity: data.activity });
      const pdfBuf = await renderHtmlToPdf(html, hf);

      const filename = pdfFilename(data.activity);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', pdfBuf.length);
      res.end(pdfBuf);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
