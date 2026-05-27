// =============================================================================
// test/security/uploads-svg.test.js
// =============================================================================
// Cubre V007:
//   1. POST /api/uploads/image rechaza SVG por MIME (fileFilter).
//   2. Rechaza también SVG disfrazado como image/png o image/gif (sharp
//      no decodifica + GIF magic byte fail) — y NO deja archivo persistido.
//   3. sanitizeSvg() queda como characterization test (función pura).
//
// Higiene: estos tests escriben a un directorio temporal aislado vía
// `UPLOADS_DIR=$tmpdir` seteado en el setup global, NO al volumen real
// `backend/data/uploads`. Cada test cleans up sus archivos.
// =============================================================================

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getTestApp, runIfPostgres, isPostgresAvailable, getTestUploadsDir } from '../helpers/app.js';
import { sanitizeSvg } from '../../src/routes/uploads.js';

async function listUploads() {
  try { return await readdir(getTestUploadsDir()); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}

// Reusable: PNG mínimo válido decodificable por sharp (1×1 transparente).
// Generado con:
//   sharp({create:{width:1,height:1,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
//     .png().toBuffer()
const VALID_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==',
  'base64',
);

describe('V007 · uploads/image · SVG rechazado en uploads nuevos', () => {
  it('POST /api/uploads/image sin cookie → no 200', async () => {
    const app = await getTestApp();
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .attach('image', Buffer.from('fake-image-bytes'), {
        filename: 'test.png',
        contentType: 'image/png',
      });
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
  });

  it('POST con SVG sin auth → no 200 (cualquier camino lo rechaza)', async () => {
    const app = await getTestApp();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .attach('image', Buffer.from(svg), {
        filename: 'logo.svg',
        contentType: 'image/svg+xml',
      });
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
  });
});

// === Uploads con sesión válida y MIME disfrazado (postgres) =================
// El cliente puede mentir con el header Content-Type. Estos tests garantizan
// que NO se confía en él: bytes SVG declarados como image/png o image/gif
// son rechazados (sharp falla decodificar / GIF magic byte falla) y el
// archivo se borra del disco.
describe('V007 · uploads/image · contenido > MIME (postgres)', () => {
  let app;
  let ownerCookie;

  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Host', 'ccb.localhost')
      .send({ email: 'ccb-owner@test.local', password: 'TestOwner!1234' });
    const sc = (loginRes.headers['set-cookie'] || []).find(c => /^contan2_session=/.test(c));
    ownerCookie = sc ? sc.split(';')[0] : null;
  });

  afterEach(async () => {
    // No assertion aquí — solo limpiamos archivos huérfanos entre tests
    // para evitar interferencia.
    const fs = await import('node:fs/promises');
    for (const f of await listUploads()) {
      await fs.unlink(path.join(getTestUploadsDir(), f)).catch(() => {});
    }
  });

  runIfPostgres('POST con image/svg+xml + owner → 400 fileFilter', async () => {
    expect(ownerCookie).toBeTruthy();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="1"/></svg>';
    const before = await listUploads();
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .attach('image', Buffer.from(svg), {
        filename: 'logo.svg',
        contentType: 'image/svg+xml',
      });
    expect(res.status).toBe(400);
    const after = await listUploads();
    expect(after.length).toBe(before.length);
  });

  runIfPostgres('POST con extensión .svg + contentType image/svg+xml + owner → 400', async () => {
    expect(ownerCookie).toBeTruthy();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .attach('image', Buffer.from(svg), {
        filename: 'sneaky.png',
        contentType: 'image/svg+xml',
      });
    expect(res.status).toBe(400);
  });

  // === Disfraz P1: bytes SVG declarados como image/png ====================
  runIfPostgres('POST con bytes SVG declarados como image/png + owner → 400 y NO se persiste', async () => {
    expect(ownerCookie).toBeTruthy();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="1"/></svg>';
    const before = await listUploads();
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .attach('image', Buffer.from(svg), {
        filename: 'pretend.png',
        contentType: 'image/png', // mintiendo
      });
    expect(res.status).toBe(400);
    expect(res.body?.error || JSON.stringify(res.body)).toMatch(/imagen|PNG|JPEG|WebP|válida/i);
    // Crítico: el archivo NO debe quedar en uploads.
    const after = await listUploads();
    expect(after.length).toBe(before.length);
  });

  // === Disfraz P1: bytes SVG declarados como image/gif ====================
  runIfPostgres('POST con bytes SVG declarados como image/gif + owner → 400 y NO se persiste', async () => {
    expect(ownerCookie).toBeTruthy();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const before = await listUploads();
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .attach('image', Buffer.from(svg), {
        filename: 'pretend.gif',
        contentType: 'image/gif',
      });
    expect(res.status).toBe(400);
    expect(res.body?.error || JSON.stringify(res.body)).toMatch(/GIF|firma|válid/i);
    const after = await listUploads();
    expect(after.length).toBe(before.length);
  });

  runIfPostgres('POST con bytes ZIP declarados como image/png + owner → 400 y NO se persiste', async () => {
    expect(ownerCookie).toBeTruthy();
    // ZIP empty: PK\x05\x06 + 18 zeros.
    const zip = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x05, 0x06]),
      Buffer.alloc(18, 0),
    ]);
    const before = await listUploads();
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .attach('image', zip, {
        filename: 'bad.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    const after = await listUploads();
    expect(after.length).toBe(before.length);
  });

  runIfPostgres('POST con PNG válido + owner → 201 y queda en uploads', async () => {
    expect(ownerCookie).toBeTruthy();
    const before = await listUploads();
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .attach('image', VALID_PNG_BYTES, {
        filename: 'tiny.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\//);
    const after = await listUploads();
    expect(after.length).toBe(before.length + 1);
  });

  runIfPostgres('GET /uploads/<file> trae header X-Content-Type-Options: nosniff', async () => {
    expect(ownerCookie).toBeTruthy();
    // Subir un PNG válido primero para tener un asset que servir.
    const up = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .attach('image', VALID_PNG_BYTES, { filename: 'a.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const url = up.body.url;
    const res = await request(app).get(url).set('Host', 'ccb.localhost');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('sanitizeSvg() · función pura · contrato documentado', () => {
  it('elimina bloques <script>...</script>', () => {
    const input = '<svg><script>alert(1)</script><circle/></svg>';
    const out = sanitizeSvg(input);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert\(1\)/);
  });

  it('elimina <script> con tag case-mix', () => {
    const input = '<svg><sCrIpT>alert(1)</ScRiPt><circle/></svg>';
    const out = sanitizeSvg(input);
    expect(out).not.toMatch(/alert\(1\)/);
  });

  it('elimina handlers on* (onclick, onload, onmouseover)', () => {
    const cases = [
      '<svg onload="alert(1)"><circle/></svg>',
      '<svg><a onclick="alert(1)">x</a></svg>',
      '<svg><circle onmouseover="alert(1)"/></svg>',
    ];
    for (const input of cases) {
      const out = sanitizeSvg(input);
      expect(out).not.toMatch(/onload\s*=/i);
      expect(out).not.toMatch(/onclick\s*=/i);
      expect(out).not.toMatch(/onmouseover\s*=/i);
      expect(out).not.toMatch(/alert\(1\)/);
    }
  });

  it('elimina href="javascript:..." y xlink:href="javascript:..."', () => {
    const input = '<svg><a href="javascript:alert(1)"><circle/></a><image xlink:href="javascript:alert(2)"/></svg>';
    const out = sanitizeSvg(input);
    expect(out).not.toMatch(/javascript:/i);
  });

  // === VECTORES QUE LA REGEX NO CUBRE ===

  it('LIMITACIÓN · entidades codificadas en javascript: NO se sanitizan', () => {
    const input = '<svg><a href="&#x6A;avascript:alert(1)"><circle/></a></svg>';
    const out = sanitizeSvg(input);
    expect(out).toContain('&#x6A;avascript:');
  });

  it('LIMITACIÓN · <foreignObject> con HTML embebido NO se remueve', () => {
    const input = '<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><iframe src="javascript:alert(1)"></iframe></div></foreignObject></svg>';
    const out = sanitizeSvg(input);
    expect(out).toContain('<foreignObject>');
    expect(out).toContain('<iframe');
  });

  it('LIMITACIÓN · style="..." con expression() o url(javascript:) NO se sanitiza', () => {
    const input = '<svg><circle style="background:url(javascript:alert(1))"/></svg>';
    const out = sanitizeSvg(input);
    expect(out).toContain('javascript:');
  });
});
