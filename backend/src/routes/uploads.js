import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import sharp from 'sharp';
import { HttpError } from '../middleware/errorHandler.js';
import { requireStaffSession } from '../middleware/requireStaffSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

await fs.mkdir(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
]);
const MAX_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safe = ext.match(/^\.(jpe?g|png|webp|gif|svg)$/) ? ext : '.jpg';
    const name = `${Date.now()}-${randomBytes(6).toString('hex')}${safe}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new HttpError(400, 'Tipo de archivo no permitido. Usa JPG, PNG, WebP, GIF o SVG.'));
    }
    cb(null, true);
  },
});

/**
 * Sanitización mínima de SVG: bloquea scripts y handlers de eventos.
 * No es un sanitizer industrial (eso requeriría una librería como DOMPurify),
 * pero cubre los vectores comunes de XSS en SVG subido por admin.
 */
function sanitizeSvg(content) {
  let s = String(content);
  // Eliminar bloques <script>...</script>
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Eliminar handlers on* (onclick, onload, onmouseover, etc.)
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Eliminar URIs javascript: y data: (excepto image/*)
  s = s.replace(/(href|xlink:href)\s*=\s*(["'])javascript:[^"']*\2/gi, '');
  return s;
}

// Tier de autorización: POST /image → STAFF
// (ver docs/migration-v2/05-authorization-matrix.md).
// Razón: el endpoint se usa tanto para subir el logo del tenant (operación
// admin que se controla en orgBranding) como para subir afiches de
// actividades (operación de operator). El control granular vive en los
// endpoints consumidores del resultado. Sanitización de SVG ya aplicada
// arriba; queda cubrir con test automatizado (V007 P0).
export function createUploadsRouter() {
  const router = Router();
  router.use(requireStaffSession);

  router.post('/image', (req, res, next) => {
    upload.single('image')(req, res, async err => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return next(new HttpError(400, 'La imagen excede 5 MB'));
        }
        return next(err);
      }
      if (!req.file) return next(new HttpError(400, 'No se recibió ningún archivo'));

      try {
        const optimized = await optimizeImage(req.file);
        res.status(201).json({
          url: `/uploads/${optimized.filename}`,
          filename: optimized.filename,
          size: optimized.size,
          mimetype: optimized.mimetype,
        });
      } catch (e) {
        // Si la optimización falla, intentar limpiar el archivo subido y propagar.
        fs.unlink(req.file.path).catch(() => {});
        next(e);
      }
    });
  });

  return router;
}

// GIFs animados se dejan como están (sharp pierde la animación).
// Para JPG/PNG/WebP estáticos: resize a 1080 max + reencodar a JPEG progresivo q82.
// Reduce 640KB → ~60-90KB típicamente y acelera mucho la carga en tablets por WiFi.
async function optimizeImage(file) {
  const isGif = file.mimetype === 'image/gif';
  const isSvg = file.mimetype === 'image/svg+xml';
  const original = {
    filename: file.filename,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype,
  };

  if (isGif) return original;

  // SVG: vectorial, no se resizea ni reencoda. Sanitizamos el contenido
  // para bloquear scripts/handlers maliciosos y reescribimos el archivo.
  if (isSvg) {
    try {
      const raw = await fs.readFile(file.path, 'utf8');
      const sanitized = sanitizeSvg(raw);
      if (sanitized !== raw) {
        await fs.writeFile(file.path, sanitized, 'utf8');
      }
      const stat = await fs.stat(file.path);
      return { ...original, size: stat.size };
    } catch (e) {
      console.error('[uploads] sanitización SVG falló:', e.message);
      return original;
    }
  }

  // Detectar si la imagen tiene canal alpha (transparencia). Si lo tiene,
  // mantenemos PNG para preservar la transparencia (típico caso: logos).
  // Si no, JPEG q82 que es ~5-10x más liviano que PNG para fotos.
  let hasAlpha = false;
  try {
    const meta = await sharp(file.path).metadata();
    hasAlpha = meta.hasAlpha === true;
  } catch (e) {
    console.error('[uploads] sharp metadata falló, dejando original:', e.message);
    return original;
  }

  const base = path.basename(file.filename, path.extname(file.filename));
  const outExt = hasAlpha ? '.png' : '.jpg';
  const outFilename = `${base}${outExt}`;
  const outPath = path.join(UPLOADS_DIR, outFilename);

  try {
    const pipeline = sharp(file.path)
      .rotate() // auto-orient por EXIF
      .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true });
    if (hasAlpha) {
      // PNG comprimido al máximo, preservando transparencia.
      await pipeline.png({ compressionLevel: 9, palette: true }).toFile(outPath);
    } else {
      await pipeline.jpeg({ quality: 82, progressive: true, mozjpeg: true }).toFile(outPath);
    }
  } catch (e) {
    console.error('[uploads] sharp falló, dejando original:', e.message);
    return original;
  }

  const stat = await fs.stat(outPath);
  if (outPath !== file.path) {
    await fs.unlink(file.path).catch(() => {});
  }
  return {
    filename: outFilename,
    path: outPath,
    size: stat.size,
    mimetype: hasAlpha ? 'image/png' : 'image/jpeg',
  };
}

export async function deleteUploadFile(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return;
  if (!imageUrl.startsWith('/uploads/')) return;
  const filename = path.basename(imageUrl);
  const filePath = path.join(UPLOADS_DIR, filename);
  try {
    await fs.unlink(filePath);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[uploads] error borrando archivo:', e.message);
  }
}
