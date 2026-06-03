// apps/api-v2/test/email.test.ts · unit del envío de credencial (Resend).
// Sin red: `deps.send` inyectado. Cubre skip (sin email / sin key = dry-run),
// envío real (payload correcto) y errores.

import { describe, it, expect, beforeEach } from 'vitest';
import { sendCredentialEmail, maskEmail, type SendMessage } from '../src/services/email.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const user = { code: 'CCB-AB12CD', email: 'ana@example.com', firstName: 'Ana', lastName: 'Gómez' };

beforeEach(() => {
  delete process.env.RESEND_API_KEY; // estado conocido: dry-run salvo que el test inyecte send
});

describe('email · sendCredentialEmail', () => {
  it('sin email → skipped', async () => {
    const r = await sendCredentialEmail({ ...user, email: null }, null, PNG);
    expect(r).toEqual({ skipped: true, reason: 'sin email' });
  });

  it('sin RESEND_API_KEY → dry-run skipped (no envía)', async () => {
    let called = false;
    const r = await sendCredentialEmail(user, null, PNG, { send: undefined });
    // sin send inyectado y sin key → skip; aseguramos que no se intentó enviar
    expect(r).toEqual({ skipped: true, reason: 'sin RESEND_API_KEY' });
    expect(called).toBe(false);
  });

  it('con send inyectado → sent con payload correcto', async () => {
    const sent: SendMessage[] = [];
    const r = await sendCredentialEmail(user, { name: 'Centro X', primaryColor: '#0f766e', secondaryColor: '#f59e0b' }, PNG, {
      send: async (m) => { sent.push(m); return { id: 're_123' }; },
    });
    expect(r).toEqual({ sent: true, id: 're_123' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ana@example.com');
    expect(sent[0]!.subject).toBe('Tu credencial · CCB-AB12CD');
    expect(sent[0]!.attachments[0]!.filename).toBe('credencial-CCB-AB12CD.png');
    expect(sent[0]!.attachments[0]!.content).toBe(PNG);
    expect(sent[0]!.html).toContain('CCB-AB12CD');
  });

  it('from/replyTo override se respetan', async () => {
    const sent: SendMessage[] = [];
    await sendCredentialEmail(user, null, PNG, {
      from: 'Centro <hola@centro.do>', replyTo: 'reply@centro.do',
      send: async (m) => { sent.push(m); return { id: 'x' }; },
    });
    expect(sent[0]!.from).toBe('Centro <hola@centro.do>');
    expect(sent[0]!.replyTo).toBe('reply@centro.do');
  });

  it('error del proveedor → sent:false', async () => {
    const r = await sendCredentialEmail(user, null, PNG, { send: async () => ({ error: 'boom' }) });
    expect(r).toEqual({ sent: false, error: 'boom' });
  });

  it('excepción del proveedor → sent:false (no lanza)', async () => {
    const r = await sendCredentialEmail(user, null, PNG, { send: async () => { throw new Error('net'); } });
    expect(r).toEqual({ sent: false, error: 'net' });
  });

  it('maskEmail oculta el local part', () => {
    expect(maskEmail('ana@example.com')).toBe('a***@example.com');
  });
});
