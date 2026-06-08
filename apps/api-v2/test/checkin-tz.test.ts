// apps/api-v2/test/checkin-tz.test.ts · unit (sin DB) de la validación de CHECKIN_TZ.
import { describe, it, expect, afterEach } from 'vitest';
import { resolveCheckinTz } from '../src/routes/checkin.js';

const orig = process.env.CHECKIN_TZ;
afterEach(() => { if (orig === undefined) delete process.env.CHECKIN_TZ; else process.env.CHECKIN_TZ = orig; });

describe('resolveCheckinTz', () => {
  it('zona IANA válida → la usa', () => {
    process.env.CHECKIN_TZ = 'America/New_York';
    expect(resolveCheckinTz()).toBe('America/New_York');
  });
  it('UTC válido → la usa', () => {
    process.env.CHECKIN_TZ = 'UTC';
    expect(resolveCheckinTz()).toBe('UTC');
  });
  it('valor inválido → fallback documentado (America/Santo_Domingo)', () => {
    process.env.CHECKIN_TZ = 'Foo/Bar';
    expect(resolveCheckinTz()).toBe('America/Santo_Domingo');
  });
  it('vacío/ausente → default', () => {
    delete process.env.CHECKIN_TZ;
    expect(resolveCheckinTz()).toBe('America/Santo_Domingo');
  });
});
