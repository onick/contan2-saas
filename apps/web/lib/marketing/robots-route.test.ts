import { describe, it, expect, vi, afterEach } from 'vitest';

let current = new Headers();
vi.mock('next/headers', () => ({ headers: async () => current }));

import robots from '../../app/robots';
import sitemap from '../../app/sitemap';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('app/robots.ts y app/sitemap.ts (request simulado)', () => {
  it('lee x-forwarded-host y ROOT_DOMAIN', async () => {
    vi.stubEnv('ROOT_DOMAIN', 'contan2.com');
    current = new Headers({ 'x-forwarded-host': 'contan2.com', host: 'internal:3000' });
    expect((await robots()).sitemap).toBe('https://contan2.com/sitemap.xml');
    expect(await sitemap()).toHaveLength(1);

    current = new Headers({ host: 'ccb.contan2.com' });
    expect(await robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(await sitemap()).toEqual([]);
  });

  it('staging cierra todo', async () => {
    vi.stubEnv('ROOT_DOMAIN', 'stg.contan2.com');
    current = new Headers({ host: 'contan2.com' });
    expect(await robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
});
