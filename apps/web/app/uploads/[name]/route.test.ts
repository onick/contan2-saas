import { describe, it, expect, afterEach, vi } from 'vitest';
import { GET, HEAD } from './route';

afterEach(() => vi.restoreAllMocks());

const ctx = (name: string) => ({ params: Promise.resolve({ name }) });

function upstreamWithHeaders() {
  return vi.fn().mockResolvedValue(
    new Response('IMG', {
      status: 200,
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'set-cookie': 'secret=1', // header interno que NO debe relayarse
        'x-internal': 'leak',
      },
    }),
  );
}

describe('GET/HEAD /uploads/:name', () => {
  it('nombre válido → 200 y SOLO relaya headers permitidos (sin set-cookie ni internos)', async () => {
    vi.stubGlobal('fetch', upstreamWithHeaders());
    const res = await GET(new Request('http://x/uploads/a'), ctx('v2-activity-abc.webp'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('set-cookie')).toBeNull(); // NO se relaya
    expect(res.headers.get('x-internal')).toBeNull(); // NO se relaya
  });

  it('HEAD no devuelve cuerpo', async () => {
    vi.stubGlobal('fetch', upstreamWithHeaders());
    const res = await HEAD(new Request('http://x/uploads/a'), ctx('v2-activity-abc.webp'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it.each([
    '../secret.webp',
    '..%2f..%2fetc',
    'a/b.webp',
    'foo.txt',
    'sin-extension',
    '.hidden.webp',
  ])('nombre inseguro %s → 404 sin tocar api-v2', async (name) => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const res = await GET(new Request('http://x/uploads/a'), ctx(name));
    expect(res.status).toBe(404);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sirve legacy (png/jpg) con su content-type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('IMG', { status: 200, headers: { 'content-type': 'image/png' } })));
    const res = await GET(new Request('http://x/uploads/a'), ctx('1779905000000-abc123.png'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});
