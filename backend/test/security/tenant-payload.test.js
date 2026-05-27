// =============================================================================
// test/security/tenant-payload.test.js
// =============================================================================
// Cubre V010 · `GET /api/_tenant` es PUBLIC por diseño (branding pre-login),
// pero el payload debe estar allowlisted: solo metadata visual + operativa
// no sensible. Snapshot garantiza que si alguien agrega un campo nuevo al
// modelo `organizations`, no se filtra al endpoint público sin querer.
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/app.js';
import { PUBLIC_TENANT_FIELDS } from '../../src/routes/tenant.js';

describe('V010 · /api/_tenant payload allowlisted', () => {
  it('lista de campos públicos es exactamente la allowlist esperada', () => {
    expect(PUBLIC_TENANT_FIELDS).toEqual([
      'slug',
      'name',
      'legalName',
      'logoUrl',
      'primaryColor',
      'secondaryColor',
      'sidebarStyle',
      'codePrefix',
      'locale',
      'timezone',
    ]);
  });

  it('GET /api/_tenant no expone campos sensibles', async () => {
    const app = await getTestApp();
    const res = await request(app).get('/api/_tenant').set('Host', 'ccb.localhost');
    expect(res.status).toBe(200);
    const body = res.body;
    // Allowlist match — solo los campos esperados.
    const keys = Object.keys(body).sort();
    expect(keys).toEqual([...PUBLIC_TENANT_FIELDS].sort());

    // Defensa explícita: campos prohibidos NO deben aparecer.
    const FORBIDDEN = [
      'staffPinHash', 'pinHash', 'passwordHash',
      'emailReplyTo', 'emailFromAddr',
      'plan', 'status',
      'createdAt', 'updatedAt',
      'customDomainVerificationToken', 'verificationToken',
    ];
    for (const f of FORBIDDEN) {
      expect(body).not.toHaveProperty(f);
    }
  });

  it('GET /api/_tenant no expone secretos serializando todo el row', async () => {
    const app = await getTestApp();
    const res = await request(app).get('/api/_tenant').set('Host', 'ccb.localhost');
    const text = JSON.stringify(res.body || {}).toLowerCase();
    // Strings que nunca deberían aparecer en el payload público.
    expect(text).not.toMatch(/hash/);
    expect(text).not.toMatch(/secret/);
    expect(text).not.toMatch(/token/);
    expect(text).not.toMatch(/password/);
  });
});
