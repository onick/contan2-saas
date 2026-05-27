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
// Permite a los tests apuntar a un directorio temporal aislado vía env var
// UPLOADS_DIR. Default productivo: `<repo>/backend/data/uploads` (persistido
// como volumen en Coolify).
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'data', 'uploads');

await fs.mkdir(UPLOADS_DIR, { recursive: true });

// SVG está deliberadamente EXCLUIDO de los MIME aceptados hasta que el
// sanitizer sea robusto (ver `sanitizeSvg` abajo + comentarios al final).
// Los SVG ya subidos a /uploads/* siguen sirviéndose como estáticos; lo
// que bloqueamos son uploads NUEVOS.
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);
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
      return cb(new HttpError(400, 'Tipo de archivo no permitido. Usa JPG, PNG, WebP o GIF. SVG temporalmente deshabilitado por seguridad.'));
    }
    cb(null, true);
  },
});

/**
 * Sanitizador best-effort de SVG. **NO se usa en uploads actualmente**:
 * la versión regex no cubre vectores como entidades codificadas
 * (`&#x6A;avascript:`), `<foreignObject>` con HTML embebido, atributos
 * `style` con `expression()` legacy ni `<use href="#...">` malicioso.
 *
 * Exportado para:
 *   1. Tests automatizados que documentan los vectores cubiertos y los no
 *      cubiertos (`test/security/uploads-svg.test.js`).
 *   2. Uso futuro cuando se implemente sanitización robusta (DOMPurify
 *      en Node con jsdom, o un sanitizer SVG dedicado).
 *
 * Hasta entonces, el endpoint `POST /api/uploads/image` rechaza
 * `image/svg+xml` directamente desde el `fileFilter` de multer.
 */
export function sanitizeSvg(content) {
  let s = String(content);
  // Eliminar bloques <script>...</script>
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Eliminar handlers on* (onclick, onload, onmouseover, etc.)
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Eliminar URIs javascript: en href/xlink:href
  s = s.replace(/(href|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '');
  return s;
}

// Tier de autorización: POST /image → STAFF
// (ver docs/migration-v2/05-authorization-matrix.md).
// Razón: el endpoint se usa tanto para subir el logo del tenant (operación
// admin que se controla en orgBranding) como para subir afiches de
// actividades (operación de operator). El control granular vive en los
// endpoints consumidores del resultado.
//
// **No se confía en el MIME declarado por el cliente**. El `fileFilter`
// de multer hace un primer descarte por mimetype, pero el contenido real
// se valida en `optimizeImage`:
//   - PNG/JPEG/WebP: sharp DEBE poder decodificar el archivo. Si falla
//     (porque los bytes son en realidad SVG, ZIP, ejecutable, etc.) →
//     el archivo se borra del disco y se devuelve 400.
//   - GIF: validamos firma `GIF87a` / `GIF89a` en los primeros 6 bytes.
//     Si no matchea, se borra y se devuelve 400.
//   - SVG: rechazado en el fileFilter (sanitizer regex insuficiente; ver
//     comentario superior + docs/migration-v2/06-svg-quarantine-runbook.md).
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
        // El validador interno garantiza que cualquier archivo no válido
        // (SVG disfrazado, bytes corruptos, formato no soportado) ya fue
        // borrado del disco antes de llegar aquí. Solo propagamos el error.
        next(e);
      }
    });
  });

  return router;
}

// Firma mágica de GIF (GIF87a o GIF89a en los primeros 6 bytes).
const GIF_MAGIC_87 = Buffer.from('GIF87a', 'ascii');
const GIF_MAGIC_89 = Buffer.from('GIF89a', 'ascii');

async function isValidGifByContent(filePath) {
  const fd = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(6);
    const { bytesRead } = await fd.read(buf, 0, 6, 0);
    if (bytesRead < 6) return false;
    return buf.equals(GIF_MAGIC_87) || buf.equals(GIF_MAGIC_89);
  } finally {
    await fd.close();
  }
}

async function deleteSilently(p) {
  try { await fs.unlink(p); }
  catch (e) { if (e.code !== 'ENOENT') console.error('[uploads] error borrando archivo:', e.message); }
}

/**
 * Re-codifica PNG/JPEG/WebP con sharp + valida GIF por firma. Si sharp NO
 * puede decodificar (ej. los bytes son SVG con MIME mentido), el archivo se
 * borra y se lanza HttpError(400). Igual para GIF sin firma válida.
 *
 * Importante: el cliente NO controla qué se persiste. Solo lo que sharp
 * pueda decodificar y re-codificar como PNG/JPEG (o un GIF con firma
 * válida) sobrevive.
 */
async function optimizeImage(file) {
  const isGif = file.mimetype === 'image/gif';

  if (isGif) {
    // GIFs animados se mantienen tal cual (sharp pierde la animación), pero
    // PRIMERO validamos la firma. Un atacante puede subir bytes SVG con
    // mimetype 'image/gif' — sin esta validación, el archivo se serviría
    // luego como image/gif al cliente, pero el navegador podría
    // interpretarlo (si el server respondiera con content-type incorrecto).
    const valid = await isValidGifByContent(file.path).catch(() => false);
    if (!valid) {
      await deleteSilently(file.path);
      throw new HttpError(400, 'Archivo no es un GIF válido (firma incorrecta)');
    }
    const stat = await fs.stat(file.path);
    return {
      filename: file.filename,
      path: file.path,
      size: stat.size,
      mimetype: 'image/gif',
    };
  }

  // Para PNG/JPEG/WebP: sharp DEBE poder decodificar el archivo Y el formato
  // detectado debe estar en la whitelist (png/jpeg/webp). sharp soporta SVG
  // vía librsvg, así que metadata() sobre un SVG NO falla — pero `meta.format`
  // sería 'svg' y debemos rechazarlo igual. Esto cierra el vector "SVG
  // declarado como image/png" que de otra forma sharp rasterizaría sin
  // queja y nos colaría el archivo.
  const ALLOWED_RASTER_FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp']);
  let hasAlpha = false;
  try {
    const meta = await sharp(file.path).metadata();
    if (!meta.format || !ALLOWED_RASTER_FORMATS.has(meta.format)) {
      throw new Error(`formato detectado por sharp no permitido: ${meta.format || 'desconocido'}`);
    }
    hasAlpha = meta.hasAlpha === true;
  } catch (e) {
    console.error('[uploads] sharp metadata falló o formato no permitido — rechazando archivo:', e.message);
    await deleteSilently(file.path);
    throw new HttpError(400, 'Archivo no es una imagen PNG/JPEG/WebP válida');
  }

  const base = path.basename(file.filename, path.extname(file.filename));
  const outExt = hasAlpha ? '.png' : '.jpg';
  const outFilename = `${base}${outExt}`;
  const outPath = path.join(UPLOADS_DIR, outFilename);
  // sharp no permite leer y escribir el mismo path en la misma operación
  // (puede pasar cuando el upload entra como `.png` y queremos salida `.png`).
  // Usamos un archivo temporal y luego rename atómico.
  const tmpPath = `${outPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    const pipeline = sharp(file.path)
      .rotate() // auto-orient por EXIF
      .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true });
    if (hasAlpha) {
      await pipeline.png({ compressionLevel: 9, palette: true }).toFile(tmpPath);
    } else {
      await pipeline.jpeg({ quality: 82, progressive: true, mozjpeg: true }).toFile(tmpPath);
    }
    // Mover el resultado al destino final (rename es atómico en mismo FS).
    await fs.rename(tmpPath, outPath);
  } catch (e) {
    console.error('[uploads] sharp re-encode falló — rechazando archivo:', e.message);
    await deleteSilently(file.path);
    await deleteSilently(tmpPath);
    if (outPath !== file.path) await deleteSilently(outPath);
    throw new HttpError(400, 'No se pudo procesar la imagen');
  }

  const stat = await fs.stat(outPath);
  if (outPath !== file.path) {
    await deleteSilently(file.path);
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
