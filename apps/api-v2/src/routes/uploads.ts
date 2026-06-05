// apps/api-v2/src/routes/uploads.ts · serving controlado de portadas (S2: api-v2
// es propietario del storage y sirve `/uploads/:name`). NO usa @fastify/static
// (menos superficie): ruta única que valida el nombre, resuelve contra el root y
// hace streaming. Sirve archivos v2 (`v2-activity-<uuid>.webp`) Y legacy v1
// (`<v1>.png/jpg/...`) por compatibilidad — pero el borrado automático (otro
// módulo) sigue restringido a archivos v2. Sin listado de directorio.

import { createReadStream } from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { uploadsRoot, resolveServablePath, contentTypeFor } from '../storage.js';

// Se registra SIN el prefijo /api/v2: el image_url es `/uploads/<name>` y web-v2
// proxyará `/uploads/*` → api-v2 `/uploads/*` (PR B).
export const uploadsRoute: FastifyPluginAsync = async (app) => {
  app.get('/uploads/:name', async (req, reply) => {
    const name = (req.params as { name: string }).name;
    const ct = contentTypeFor(name); // null si extensión no permitida
    // resolveServablePath: nombre seguro + lstat archivo regular (NO symlink/dir/
    // special) + realpath dentro del root. null → 404 (sin listar el directorio).
    const real = ct ? await resolveServablePath(uploadsRoot(), name) : null;
    if (!ct || !real) {
      reply.code(404);
      return { error: 'No encontrado' };
    }
    reply.header('Content-Type', ct);
    reply.header('X-Content-Type-Options', 'nosniff');
    // Nombres inmutables (uuid v2 / timestamp+hash legacy) → cache larga.
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(createReadStream(real));
  });
};
