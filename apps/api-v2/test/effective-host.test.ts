// apps/api-v2/test/effective-host.test.ts · unit (sin DB).
// effectiveHost: default usa Host; solo con TRUST_FORWARDED_HOST=1 confía en
// x-forwarded-host (detrás de proxy). No cambia dev/local.

import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { effectiveHost } from '../src/tenant.js';

const req = (headers: Record<string, unknown>) => ({ headers } as unknown as FastifyRequest);

const PREV = process.env.TRUST_FORWARDED_HOST;
afterEach(() => {
  if (PREV === undefined) delete process.env.TRUST_FORWARDED_HOST;
  else process.env.TRUST_FORWARDED_HOST = PREV;
});

describe('effectiveHost', () => {
  it('default (flag off): usa Host aunque venga x-forwarded-host (anti-spoof en dev)', () => {
    delete process.env.TRUST_FORWARDED_HOST;
    expect(effectiveHost(req({ host: 'ccb.contan2.com', 'x-forwarded-host': 'evil.com' }))).toBe('ccb.contan2.com');
  });

  it('flag="0": sigue usando Host', () => {
    process.env.TRUST_FORWARDED_HOST = '0';
    expect(effectiveHost(req({ host: 'a.local', 'x-forwarded-host': 'b.local' }))).toBe('a.local');
  });

  it('flag="1": usa x-forwarded-host (host real del tenant tras proxy)', () => {
    process.env.TRUST_FORWARDED_HOST = '1';
    expect(effectiveHost(req({ host: 'api-internal:3001', 'x-forwarded-host': 'ccb.stg.contan2.com' }))).toBe('ccb.stg.contan2.com');
  });

  it('flag="1" sin x-forwarded-host: cae a Host', () => {
    process.env.TRUST_FORWARDED_HOST = '1';
    expect(effectiveHost(req({ host: 'api-internal:3001' }))).toBe('api-internal:3001');
  });

  it('flag="1" con lista (array de varios proxies): toma el primero', () => {
    process.env.TRUST_FORWARDED_HOST = '1';
    expect(effectiveHost(req({ host: 'i', 'x-forwarded-host': ['ccb.stg.contan2.com', 'proxy2'] }))).toBe('ccb.stg.contan2.com');
  });

  it('flag="1" con CSV: toma el primero y lo trimea', () => {
    process.env.TRUST_FORWARDED_HOST = '1';
    expect(effectiveHost(req({ host: 'i', 'x-forwarded-host': 'ccb.stg.contan2.com, proxy2' }))).toBe('ccb.stg.contan2.com');
  });
});
