import fs from 'fs/promises';
import { buildBrandingStyle } from '../utils/palette.js';

// Cache de archivos HTML en memoria (se rellenan al primer hit por path).
// Si en dev cambias el HTML hay que reiniciar; aceptable para no leer disk
// en cada request.
const fileCache = new Map();

async function readHtml(filePath) {
  let html = fileCache.get(filePath);
  if (html) return html;
  html = await fs.readFile(filePath, 'utf-8');
  fileCache.set(filePath, html);
  return html;
}

// Inyecta <style data-branding-ssr> justo antes de </head> para que los
// CSS variables del tenant ya estén disponibles en el primer paint y no
// haya FOUC con los colores defaults.
export function serveHtmlWithBranding(filePath) {
  return async (req, res, next) => {
    try {
      const html = await readHtml(filePath);
      const styleBlock = buildBrandingStyle(req.organization);
      const out = styleBlock
        ? html.replace('</head>', `${styleBlock}</head>`)
        : html;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(out);
    } catch (e) {
      next(e);
    }
  };
}
