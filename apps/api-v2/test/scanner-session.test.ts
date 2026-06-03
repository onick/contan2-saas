// apps/api-v2/test/scanner-session.test.ts · unit (sin DB) de la cookie firmada.
process.env.SCANNER_SECRET = 'test-scanner-secret-xyz';

import { describe, it, expect } from 'vitest';
import { signScannerSession, verifyScannerSession, SCANNER_TTL_MS } from '../src/scanner-auth.js';

describe('scanner session · cookie firmada stateless', () => {
  it('firma y verifica el orgId', () => {
    const c = signScannerSession('org-123');
    expect(verifyScannerSession(c)?.orgId).toBe('org-123');
  });

  it('cookie vacía / undefined → null', () => {
    expect(verifyScannerSession(undefined)).toBeNull();
    expect(verifyScannerSession('')).toBeNull();
    expect(verifyScannerSession('sin-punto')).toBeNull();
  });

  it('HMAC adulterado → null (timing-safe)', () => {
    const c = signScannerSession('org-123');
    const last = c.slice(-1);
    const tampered = c.slice(0, -1) + (last === '0' ? '1' : '0');
    expect(verifyScannerSession(tampered)).toBeNull();
  });

  it('payload reemplazado (otro org) sin re-firmar → null', () => {
    const c = signScannerSession('org-123');
    const fakePayload = Buffer.from(`org-999|${Date.now() + 100_000}`).toString('base64url');
    expect(verifyScannerSession(`${fakePayload}${c.slice(c.lastIndexOf('.'))}`)).toBeNull();
  });

  it('expirada → null', () => {
    const c = signScannerSession('org-123', Date.now() - SCANNER_TTL_MS - 1000);
    expect(verifyScannerSession(c)).toBeNull();
  });

  it('no expirada (now dentro del TTL) → ok', () => {
    const c = signScannerSession('org-123', Date.now());
    expect(verifyScannerSession(c, Date.now() + 1000)?.orgId).toBe('org-123');
  });
});
