import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
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
    upload.single('image')(req, res, err => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return next(new HttpError(400, 'La imagen excede 5 MB'));
        }
        return next(err);
      }
      if (!req.file) return next(new HttpError(400, 'No se recibió ningún archivo'));
      const url = `/uploads/${req.file.filename}`;
      res.status(201).json({
        url,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });
    });
  });

  return router;
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
