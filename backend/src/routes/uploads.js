import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import sharp from 'sharp';
import { HttpError } from '../middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

await fs.mkdir(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safe = ext.match(/^\.(jpe?g|png|webp|gif)$/) ? ext : '.jpg';
    const name = `${Date.now()}-${randomBytes(6).toString('hex')}${safe}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new HttpError(400, 'Tipo de archivo no permitido. Usa JPG, PNG, WebP o GIF.'));
    }
    cb(null, true);
  },
});

export function createUploadsRouter() {
  const router = Router();

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
  const original = {
    filename: file.filename,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype,
  };

  if (isGif) return original;

  const base = path.basename(file.filename, path.extname(file.filename));
  const outFilename = `${base}.jpg`;
  const outPath = path.join(UPLOADS_DIR, outFilename);

  try {
    await sharp(file.path)
      .rotate() // auto-orient por EXIF
      .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toFile(outPath);
  } catch (e) {
    console.error('[uploads] sharp falló, dejando original:', e.message);
    return original;
  }

  const stat = await fs.stat(outPath);
  // Borrar el original solo si el output es un archivo distinto.
  if (outPath !== file.path) {
    await fs.unlink(file.path).catch(() => {});
  }
  return {
    filename: outFilename,
    path: outPath,
    size: stat.size,
    mimetype: 'image/jpeg',
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
