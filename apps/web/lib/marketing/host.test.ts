import { describe, it, expect } from 'vitest';
import { isMarketingHost } from './host';

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
