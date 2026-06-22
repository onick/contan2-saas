import { describe, it, expect, afterEach, vi } from 'vitest';
import { GET } from './route';

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/version', () => {
  it('responde 200 con buildSha desde process.env.BUILD_SHA', async () => {
    vi.stubEnv('BUILD_SHA', 'abc1234567890abcdef');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buildSha).toBe('abc1234567890abcdef');
  });

  it('cae a "unknown" cuando BUILD_SHA no está seteado (gate A.5 debe abortar)', async () => {
    vi.stubEnv('BUILD_SHA', '');
    const res = await GET();
    const body = await res.json();
    // string vacío no es nullish → pasa literal; el gate A.5 falla al comparar.
    // Esto fuerza a arreglar "Include Source Commit" en Coolify antes de release.
    expect(body.buildSha).toBe('');
  });
});
