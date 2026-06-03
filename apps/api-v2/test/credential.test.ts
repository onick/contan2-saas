// apps/api-v2/test/credential.test.ts · unit (sin DB) del PNG de credencial y
// los tokens de marca. Verifica firma + dimensiones del PNG y el contrato del QR.

import { describe, it, expect } from 'vitest';
import { qrPayload } from '@contan2/codes';
import { generateCredentialPng } from '../src/services/credential.js';
import { resolveBrandingTokens, pickOn, generatePalette } from '../src/services/branding-tokens.js';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('credential · branding tokens', () => {
  it('pickOn elige contraste correcto', () => {
    expect(pickOn('#ffffff')).toBe('#1f2937');
    expect(pickOn('#000000')).toBe('#ffffff');
  });

  it('generatePalette deriva tonos desde el primary', () => {
    const p = generatePalette('#1a237e');
    expect(p).toBeTruthy();
    expect(p!['700']).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('resolveBrandingTokens cae a defaults seguros sin org', () => {
    const t = resolveBrandingTokens(null);
    expect(t.orgName).toBe('contan2-saas');
    expect(t.primary).toBe('#1a237e');
    expect(t.accent).toBe('#ff6f00');
  });
});

describe('credential · QR payload', () => {
  it('el QR codifica EXACTAMENTE el código (sin URL)', () => {
    expect(qrPayload({ code: 'CCB-AB12CD' })).toBe('CCB-AB12CD');
  });
});

describe('credential · PNG', () => {
  it('genera un PNG válido de 900×560 (sin org → defaults)', async () => {
    const buf = await generateCredentialPng({ code: 'CCB-AB12CD', firstName: 'Ana', lastName: 'Gómez' }, null);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true);
    expect(buf.readUInt32BE(16)).toBe(900); // IHDR width
    expect(buf.readUInt32BE(20)).toBe(560); // IHDR height
  });

  it('genera PNG con branding del tenant', async () => {
    const buf = await generateCredentialPng(
      { code: 'CCB-ZZ99ZZ', firstName: 'Carmen', lastName: 'Objío' },
      { name: 'Centro X', primaryColor: '#0f766e', secondaryColor: '#f59e0b' },
    );
    expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true);
    expect(buf.readUInt32BE(16)).toBe(900);
  });
});
