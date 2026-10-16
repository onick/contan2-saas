import { describe, it, expect } from 'vitest';
import { getRequestHost, isMarketingHost, isWwwHost } from './host';

describe('isMarketingHost', () => {
  it('root y www del dominio raíz son marketing', () => {
    expect(isMarketingHost('contan2.com', 'contan2.com')).toBe(true);
    expect(isMarketingHost('www.contan2.com', 'contan2.com')).toBe(true);
    expect(isMarketingHost('CONTAN2.com:443', 'contan2.com')).toBe(true);
  });
  it('hosts de tenant y reservados NO son marketing', () => {
    expect(isMarketingHost('ccb.contan2.com', 'contan2.com')).toBe(false);
    expect(isMarketingHost('app.contan2.com', 'contan2.com')).toBe(false);
    expect(isMarketingHost(null, 'contan2.com')).toBe(false);
  });
  it('staging: stg.contan2.com es el root de su ROOT_DOMAIN', () => {
    expect(isMarketingHost('stg.contan2.com', 'stg.contan2.com')).toBe(true);
    expect(isMarketingHost('ccb.stg.contan2.com', 'stg.contan2.com')).toBe(false);
  });
});

describe('isWwwHost', () => {
  it('solo www.<root> (con o sin puerto, sin distinguir mayúsculas)', () => {
    expect(isWwwHost('www.contan2.com', 'contan2.com')).toBe(true);
    expect(isWwwHost('WWW.Contan2.com:443', 'contan2.com')).toBe(true);
    expect(isWwwHost('contan2.com', 'contan2.com')).toBe(false);
    expect(isWwwHost('www.ccb.contan2.com', 'contan2.com')).toBe(false);
    expect(isWwwHost(null, 'contan2.com')).toBe(false);
  });
  it('staging: www.stg.contan2.com', () => {
    expect(isWwwHost('www.stg.contan2.com', 'stg.contan2.com')).toBe(true);
  });
});

describe('getRequestHost', () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it('prefiere x-forwarded-host sobre host', () => {
    expect(getRequestHost(h({ host: 'localhost:3000', 'x-forwarded-host': 'contan2.com' }))).toBe('contan2.com');
  });
  it('cae a host si no hay x-forwarded-host', () => {
    expect(getRequestHost(h({ host: 'ccb.contan2.com' }))).toBe('ccb.contan2.com');
  });
  it('normaliza: minúsculas, sin puerto, primer valor de una lista', () => {
    expect(getRequestHost(h({ 'x-forwarded-host': 'CONTAN2.com:443, proxy.internal' }))).toBe('contan2.com');
  });
  it('sin ninguno → null', () => {
    expect(getRequestHost(h({}))).toBeNull();
  });
});
