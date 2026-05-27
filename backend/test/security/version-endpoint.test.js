// =============================================================================
// test/security/version-endpoint.test.js
// =============================================================================
// El runbook 06 (Paso A.5) exige certificar el SHA desplegado antes de
// ejecutar el smoke de seguridad. Este endpoint es uno de los tres
// mecanismos aceptados.
//
// Contrato:
//   - GET /api/version → 200 + { buildSha: string, ts: ISO date }
//   - Si BUILD_SHA no está seteado, devuelve 'unknown' (el operador del
//     runbook trata 'unknown' como "abortar antes de B").
//   - NO requiere tenant, NO toca DB, NO expone secretos.
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';

describe('/api/version · identidad de build', () => {
  let app;
  beforeAll(async () => {
    app = await getTestApp();
  });

  it('responde 200 sin auth (público)', async () => {
    const res = await request(app).get('/api/version').set('Host', 'ccb.localhost');
    expect(res.status).toBe(200);
  });

  it('shape: { buildSha: string, ts: ISO }', async () => {
    const res = await request(app).get('/api/version').set('Host', 'ccb.localhost');
    expect(res.status).toBe(200);
    expect(typeof res.body.buildSha).toBe('string');
    expect(res.body.buildSha.length).toBeGreaterThan(0);
    expect(typeof res.body.ts).toBe('string');
    // ISO 8601: regex laxa pero útil
    expect(res.body.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('cuando BUILD_SHA no está seteado, buildSha === "unknown"', async () => {
    // Este test corre sin BUILD_SHA seteado (entorno de tests). Verifica
    // el contrato del fallback que activa el aborto en A.5 del runbook.
    const res = await request(app).get('/api/version').set('Host', 'ccb.localhost');
    if (!process.env.BUILD_SHA) {
      expect(res.body.buildSha).toBe('unknown');
    } else {
      // Si por alguna razón se setea en CI, debe ser exactamente el valor
      // de la env var.
      expect(res.body.buildSha).toBe(process.env.BUILD_SHA);
    }
  });

  it('NO expone secretos en el response', async () => {
    const res = await request(app).get('/api/version').set('Host', 'ccb.localhost');
    const text = JSON.stringify(res.body).toLowerCase();
    // Lista deny: nada que parezca clave, token, secret, password, hash
    // de DB, etc. Es defensa contra "alguien agregó una key extra al
    // endpoint y no se dio cuenta".
    expect(text).not.toMatch(/secret|password|token|api[_-]?key|database_url|resend|cookie/);
  });

  it('NO requiere resolve de tenant (responde con Host fuera de root)', async () => {
    // Apuntar a un host inexistente debe seguir devolviendo 200.
    const res = await request(app).get('/api/version').set('Host', 'no-tenant.example.invalid');
    expect(res.status).toBe(200);
  });
});
