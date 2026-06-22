import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('GET /healthz', () => {
  it('responde 200 con shape ok/service/ts/buildSha', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('web');
    expect(typeof body.ts).toBe('string');
    expect('buildSha' in body).toBe(true);
  });
});
