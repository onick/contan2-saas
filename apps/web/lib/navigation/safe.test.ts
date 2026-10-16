import { describe, it, expect, vi, beforeEach } from 'vitest';

const nav = vi.hoisted(() => ({
  useSearchParams: vi.fn(),
  usePathname: vi.fn(),
}));
vi.mock('next/navigation', () => nav);

import { usePathnameSafe, useSearchParamsSafe } from './safe';

beforeEach(() => {
  nav.useSearchParams.mockReset();
  nav.usePathname.mockReset();
});

describe('useSearchParamsSafe', () => {
  it('devuelve los params reales cuando existen', () => {
    const sp = new URLSearchParams('a=1');
    nav.useSearchParams.mockReturnValue(sp);
    expect(useSearchParamsSafe()).toBe(sp);
  });

  it('con null (Pages Router / sin contexto) devuelve un URLSearchParams vacío, nunca null', () => {
    nav.useSearchParams.mockReturnValue(null);
    const sp = useSearchParamsSafe();
    expect(sp.toString()).toBe('');
    expect(sp.get('a')).toBeNull();
  });
});

describe('usePathnameSafe', () => {
  it('devuelve el pathname real', () => {
    nav.usePathname.mockReturnValue('/app/usuarios');
    expect(usePathnameSafe()).toBe('/app/usuarios');
  });

  it('con null devuelve cadena vacía', () => {
    nav.usePathname.mockReturnValue(null);
    expect(usePathnameSafe()).toBe('');
  });
});
