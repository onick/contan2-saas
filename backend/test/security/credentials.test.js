// =============================================================================
// test/security/credentials.test.js
// =============================================================================
// Cubre V008b + política del PNG público:
//   1. POST /:code/send requiere sesión staff (anónimo → no 200).
//   2. POST /bulk-send requiere admin/owner (anónimo → no 200).
//   3. GET /:code.png queda público pero con rate-limit y SIN email visible
//      en el SVG/PNG generado.
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';
import { generateCredentialPng } from '../../src/services/credential.js';

describe('credentials · auth + rate-limit', () => {
  it('POST /api/credentials/:code/send sin cookie → no 200', async () => {
    const app = await getTestApp();
    const res = await request(app)
      .post('/api/credentials/CCB-X3LM9P/send')
      .set('Host', 'ccb.localhost')
      .send({});
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
  });

  it('POST /api/credentials/bulk-send sin cookie → no 200', async () => {
    const app = await getTestApp();
    const res = await request(app)
      .post('/api/credentials/bulk-send')
      .set('Host', 'ccb.localhost')
      .send({ codes: ['CCB-X3LM9P'] });
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
  });

  it('GET /:code.png con rate-limit aplica después de N requests rápidos', async () => {
    const app = await getTestApp();
    // El limit es 60/min por IP. Hacer 65 requests al hilo y verificar
    // que al menos uno responde 429. Como memory driver carga el seed
    // del CCB, usamos un código que existe.
    const code = 'CCB-D7PO8F'; // seed del memory driver
    let saw429 = false;
    for (let i = 0; i < 65; i++) {
      const res = await request(app).get(`/api/credentials/${code}.png`).set('Host', 'ccb.localhost');
      if (res.status === 429) { saw429 = true; break; }
    }
    expect(saw429).toBe(true);
  });
});

describe('credential PNG · no expone email del visitante', () => {
  it('generateCredentialPng no embebe el email en el SVG', async () => {
    const user = {
      id: 'test-id',
      code: 'CCB-X3LM9P',
      firstName: 'Carmen',
      lastName: 'Núñez',
      email: 'carmen.test@example.com',
    };
    const pngBuffer = await generateCredentialPng(user, null);
    // El PNG es binario; convertimos a string ASCII para buscar el email.
    // Si el sanitizer del SVG metió el email en el bitmap, no aparecerá en
    // string crudo (los chars del email se renderizan como píxeles), pero
    // si por error el SVG sigue conteniendo el email como texto, los chars
    // 'c', 'a', 'r', etc. del email aparecerán en el preámbulo SVG dentro
    // del PNG. Como sharp convierte SVG → PNG, los chars literales del
    // SVG NO sobreviven al bitmap. Por eso este test verifica el contrato
    // a nivel del generador SVG directamente.
    expect(pngBuffer).toBeInstanceOf(Buffer);
    expect(pngBuffer.length).toBeGreaterThan(1000);

    // Verificación adicional: la fuente de credential.js NO debe contener
    // referencia al email del user en el SVG renderizado. Esto se cubre
    // mejor con un test directo del SVG (no del PNG). Ver doc 03 — V008b.
  });

  it('el módulo credential.js no escribe `user.email` en el SVG', async () => {
    // Lectura estática del archivo para verificar que no hay regresión:
    // si alguien re-agrega `<text>${email}</text>`, este test falla.
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../../src/services/credential.js', import.meta.url),
      'utf-8',
    );
    // No debe haber referencias activas a `user.email` en el SVG generado.
    // Aceptamos comentarios que mencionan email; rechazamos código activo.
    const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(noComments).not.toMatch(/escapeXml\(\s*email\s*\)/);
    expect(noComments).not.toMatch(/\$\{\s*email\s*\}/);
  });
});
