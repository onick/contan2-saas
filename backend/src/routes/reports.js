import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { buildActivityExcelReport, reportFilename } from '../services/reports/activityExcelReport.js';
import { buildActivityPdfHtml, pdfHeaderFooter, pdfFilename } from '../services/reports/activityPdfTemplate.js';
import { renderHtmlToPdf } from '../services/reports/pdfRenderer.js';

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
