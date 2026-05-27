// =============================================================================
// test/security/uploads-svg.test.js
// =============================================================================
// Cubre V007 (uploads sin auth + SVG XSS):
//   1. POST /api/uploads/image sin sesión → no 200/201.
//   2. SVG malicioso con <script> o handlers on* queda sanitizado por el
//      filtro de uploads.js (verificamos la función sanitizeSvg cuando esté
//      exportada; mientras tanto, el assert principal es que el endpoint
//      requiere auth para ser invocable).
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';

describe('V007 · uploads/image protegido + SVG sanitizado', () => {
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

  it('POST con SVG malicioso sin sesión queda bloqueado por auth (no llega al sanitizer)', async () => {
    const app = await getTestApp();
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><a onclick="alert(2)">x</a></svg>';
    const res = await request(app)
      .post('/api/uploads/image')
      .set('Host', 'ccb.localhost')
      .attach('image', Buffer.from(malicious), {
        filename: 'evil.svg',
        contentType: 'image/svg+xml',
      });
    // El endpoint requiere staff auth; sin cookie no procesa el upload.
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
  });
});
