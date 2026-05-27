// =============================================================================
// test/security/uploads-svg.test.js
// =============================================================================
// Cubre V007 (uploads + SVG XSS):
//   1. POST /api/uploads/image rechaza SVG en el filtro MIME (decisión:
//      hasta que tengamos sanitización robusta, no aceptamos SVG nuevos).
//   2. La función exportada `sanitizeSvg` queda disponible para uso futuro
//      con sanitización robusta. Documentamos qué cubre y qué NO cubre.
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, runIfPostgres, isPostgresAvailable } from '../helpers/app.js';
import { sanitizeSvg } from '../../src/routes/uploads.js';

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
    // Sin auth el guard responde primero; con auth el fileFilter rechaza.
    // Este test cubre el caso anónimo. El test autenticado vive en el
    // bloque postgres-gated más abajo.
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

// === SVG con sesión autenticada (Postgres-gated) ============================
// Garantiza que la decisión "rechazar SVG" se aplica al fileFilter de multer,
// NO al guard de sesión. El test anterior solo cubre el camino "sin cookie";
// este se asegura de que un owner válido también recibe rechazo por MIME.
describe('V007 · uploads/image · SVG rechazado para sesiones VÁLIDAS (postgres)', () => {
  let app;
  let ownerCookie;

  beforeAll(async () => {
    if (!isPostgresAvailable()) return;
    app = await getTestApp();
    // Login owner real (seed) — no anónimo, no operator.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Host', 'ccb.localhost')
      .send({ email: 'ccb-owner@test.local', password: 'TestOwner!1234' });
    const sc = (loginRes.headers['set-cookie'] || []).find(c => /^contan2_session=/.test(c));
    ownerCookie = sc ? sc.split(';')[0] : null;
  });

  runIfPostgres('POST con image/svg+xml + sesión owner → 400 por fileFilter', async () => {
    expect(ownerCookie).toBeTruthy();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="1"/></svg>';
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .attach('image', Buffer.from(svg), {
        filename: 'logo.svg',
        contentType: 'image/svg+xml',
      });
    // El fileFilter rechaza el MIME → HttpError(400). NO debe ser 200/201/401/403.
    expect(res.status).toBe(400);
    expect(res.body?.error || JSON.stringify(res.body)).toMatch(/svg|tipo|permitido/i);
  });

  runIfPostgres('POST con extensión .svg renombrado a .png + sesión owner → 400', async () => {
    expect(ownerCookie).toBeTruthy();
    // Vector típico: subir SVG con extensión .png pero contentType correcto.
    // El fileFilter mira el mimetype del cliente; multer no esnifa el magic
    // byte. Aceptamos esto como limitación documentada: el cliente debe
    // declarar el MIME real. Si el cliente miente con content-type image/png
    // sobre bytes SVG, el archivo entra (limitación conocida — el endpoint
    // no esnifa magic bytes en este sprint). Este test verifica el camino
    // honesto: extensión .svg con contentType image/svg+xml siempre falla.
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

  runIfPostgres('POST con image/png válido + sesión owner → 200/201 (camino feliz)', async () => {
    expect(ownerCookie).toBeTruthy();
    // PNG mínimo válido (signature de 8 bytes + 1×1 pixel IHDR/IDAT/IEND).
    // No sirve para sharp completo pero el fileFilter sí lo deja pasar
    // (mimetype está en ALLOWED_MIME). Si sharp falla luego, devuelve el
    // archivo original — pero el assert es: 2xx, NO 400 ni 403.
    const png = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, // IHDR length
      0x49, 0x48, 0x44, 0x52, // "IHDR"
      0x00, 0x00, 0x00, 0x01, // width 1
      0x00, 0x00, 0x00, 0x01, // height 1
      0x08, 0x02, 0x00, 0x00, 0x00, // bit depth 8, color type RGB
      0x90, 0x77, 0x53, 0xDE, // IHDR CRC
      0x00, 0x00, 0x00, 0x0C, // IDAT length
      0x49, 0x44, 0x41, 0x54, // "IDAT"
      0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01,
      0x18, 0xDD, 0x8D, 0xB4, // IDAT CRC (approximate)
      0x00, 0x00, 0x00, 0x00, // IEND length
      0x49, 0x45, 0x4E, 0x44, // "IEND"
      0xAE, 0x42, 0x60, 0x82, // IEND CRC
    ]);
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .set('Cookie', ownerCookie)
      .attach('image', png, {
        filename: 'tiny.png',
        contentType: 'image/png',
      });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect([200, 201]).toContain(res.status);
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
  // Estos tests documentan la insuficiencia y son la razón de que SVG esté
  // deshabilitado en uploads.js. Sirven como spec para validar un sanitizer
  // robusto cuando se integre (DOMPurify+jsdom o equivalente).

  it('LIMITACIÓN · entidades codificadas en javascript: NO se sanitizan', () => {
    const input = '<svg><a href="&#x6A;avascript:alert(1)"><circle/></a></svg>';
    const out = sanitizeSvg(input);
    // El sanitizer regex NO cubre este vector. El test verifica el bug
    // conocido para que cuando se cambie a un sanitizer robusto el test
    // sirva de regression check.
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

  // Conclusión: la función `sanitizeSvg` es defensa en profundidad parcial,
  // NO suficiente para aceptar SVG arbitrario de usuarios. Por eso el
  // endpoint POST /api/uploads/image rechaza image/svg+xml hasta tener
  // un sanitizer robusto.
});
