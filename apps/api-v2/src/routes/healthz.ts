import type { FastifyPluginAsync } from 'fastify';
import { HealthzResponseSchema, type HealthzResponse } from '@contan2/contracts';

export const healthzRoute: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async (): Promise<HealthzResponse> => {
    const body: HealthzResponse = {
      ok: true,
      service: 'api-v2',
      ts: new Date().toISOString(),
      buildSha: process.env.BUILD_SHA ?? 'unknown',
    };
    return HealthzResponseSchema.parse(body);
  });
};
