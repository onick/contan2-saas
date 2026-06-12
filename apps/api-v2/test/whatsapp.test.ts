// apps/api-v2/test/whatsapp.test.ts · unit (sin DB, sin red): canal WhatsApp
// de credenciales. Normalización RD a E.164, dry-run honesto sin credenciales
// de Meta, payload de plantilla correcto con transporte inyectado, errores de
// transporte sin lanzar, y máscara de teléfono.

import { describe, it, expect } from 'vitest';
import {
  normalizePhoneRD,
  maskPhone,
  sendWhatsAppCredential,
  type WhatsAppTransport,
} from '../src/services/whatsapp.js';

const PNG = Buffer.from('fake-png');
const user = { code: 'CCB-ABC123', firstName: 'Ana', phone: '809-555-1234' };

describe('normalizePhoneRD', () => {
  it('10 dígitos con NPA dominicano → +1 (sin signo)', () => {
    expect(normalizePhoneRD('809-555-1234')).toBe('18095551234');
    expect(normalizePhoneRD('(829) 555 1234')).toBe('18295551234');
    expect(normalizePhoneRD('8495551234')).toBe('18495551234');
  });
  it('ya con país (11) o internacional (+/00) → tal cual en dígitos', () => {
    expect(normalizePhoneRD('1-809-555-1234')).toBe('18095551234');
    expect(normalizePhoneRD('+34 600 111 222')).toBe('34600111222');
    expect(normalizePhoneRD('0034600111222')).toBe('34600111222');
  });
  it('ambiguos o basura → null (mejor no mandar)', () => {
    expect(normalizePhoneRD('555-1234')).toBeNull(); // 7 dígitos
    expect(normalizePhoneRD('2125551234')).toBeNull(); // 10 dígitos no-RD sin país
    expect(normalizePhoneRD('')).toBeNull();
    expect(normalizePhoneRD(null)).toBeNull();
  });
});

describe('maskPhone', () => {
  it('solo deja los últimos 4', () => {
    expect(maskPhone('18095551234')).toBe('*******1234');
  });
});

describe('sendWhatsAppCredential', () => {
  it('sin teléfono → skipped', async () => {
    expect(await sendWhatsAppCredential({ ...user, phone: null }, PNG)).toMatchObject({ skipped: true, reason: 'sin teléfono' });
  });

  it('teléfono no normalizable → skipped (no se manda a un número dudoso)', async () => {
    expect(await sendWhatsAppCredential({ ...user, phone: '12345' }, PNG)).toMatchObject({ skipped: true, reason: 'teléfono no normalizable' });
  });

  it('dry-run sin credenciales de Meta → skipped honesto', async () => {
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(await sendWhatsAppCredential(user, PNG)).toMatchObject({ skipped: true, reason: 'sin credenciales de WhatsApp' });
  });

  it('con transporte inyectado: sube media y manda plantilla con header imagen + nombre/código', async () => {
    const calls: Array<{ to: string; template: string; lang: string; components: unknown[] }> = [];
    const transport: WhatsAppTransport = {
      uploadMedia: async (png) => { expect(png).toBe(PNG); return { id: 'media-1' }; },
      sendTemplate: async (to, template, lang, components) => { calls.push({ to, template, lang, components }); return { id: 'wamid-1' }; },
    };
    const r = await sendWhatsAppCredential(user, PNG, { transport, template: 'credencial_qr', lang: 'es' });
    expect(r).toMatchObject({ sent: true, id: 'wamid-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe('18095551234');
    expect(calls[0].template).toBe('credencial_qr');
    const json = JSON.stringify(calls[0].components);
    expect(json).toContain('media-1');
    expect(json).toContain('Ana');
    expect(json).toContain('CCB-ABC123');
  });

  it('falla la subida de media → { sent:false } sin lanzar', async () => {
    const transport: WhatsAppTransport = {
      uploadMedia: async () => ({ error: 'boom' }),
      sendTemplate: async () => ({ id: 'no-debería-llegar' }),
    };
    expect(await sendWhatsAppCredential(user, PNG, { transport })).toMatchObject({ sent: false, error: 'boom' });
  });

  it('falla el send → { sent:false } con el error del Graph', async () => {
    const transport: WhatsAppTransport = {
      uploadMedia: async () => ({ id: 'm' }),
      sendTemplate: async () => ({ error: 'template not approved' }),
    };
    expect(await sendWhatsAppCredential(user, PNG, { transport })).toMatchObject({ sent: false, error: 'template not approved' });
  });
});
