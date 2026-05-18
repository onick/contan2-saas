import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { findActiveActivityBySlug, slugify } from '../utils/slugify.js';
import { buildEventPageHtml } from '../services/eventPublicTemplate.js';

function baseUrlFromReq(req) {
  // Confiamos en el host que Express resuelve (Traefik/Coolify setea X-Forwarded-*).
  // En el server.js no hay `trust proxy`, asi que req.protocol viene de la conexion directa.
  // En produccion estamos detras de HTTPS terminator -> forzamos https si el host no es localhost.
  const host = req.get('host') || 'localhost';
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/i.test(host);
  const proto = isLocal ? 'http' : 'https';
  return `${proto}://${host}`;
}

export function createEventosPublicRouter() {
  const router = Router();

  router.get('/:slug', async (req, res, next) => {
    try {
      if (!req.organization) {
        return res.status(404).type('text/html').send(notFoundHtml('Organizacion no encontrada'));
      }
      const slug = String(req.params.slug || '').trim().toLowerCase();
      if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) {
        return res.status(400).type('text/html').send(notFoundHtml('Enlace invalido'));
      }
      const activity = await findActiveActivityBySlug(req.repos, slug);
      if (!activity) {
        return res.status(404).type('text/html').send(notFoundHtml('Actividad no disponible'));
      }
      const html = buildEventPageHtml({
        organization: req.organization,
        activity: { ...activity, slug: slugify(activity.name) },
        baseUrl: baseUrlFromReq(req),
      });
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

function notFoundHtml(msg) {
  const safe = String(msg).replace(/</g, '&lt;');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>No disponible</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f7f8fb;color:#1f2937;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}
.box{max-width:420px;background:#fff;padding:32px;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,0.08)}
h1{margin:0 0 8px;font-size:22px}p{margin:0 0 18px;color:#6b7280;font-size:15px;line-height:1.5}
a{display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}</style>
</head><body><div class="box"><h1>${safe}</h1>
<p>El enlace que abriste no esta disponible. Es posible que la actividad haya terminado o cambiara de fecha.</p>
<a href="/">Ver actividades</a></div></body></html>`;
}
