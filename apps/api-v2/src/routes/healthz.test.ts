import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server.js';
import { HealthzResponseSchema } from '@contan2/contracts';

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('GET /api/v2/healthz', () => {
  it('responds 200', async () => {
    app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/healthz' });
    expect(res.statusCode).toBe(200);
  });

  it('body matches HealthzResponseSchema', async () => {
    app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/healthz' });
    const body = res.json() as unknown;
    const parsed = HealthzResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ok).toBe(true);
      expect(parsed.data.service).toBe('api-v2');
    }
  });

  it('content-type is application/json', async () => {
    app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/healthz' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
