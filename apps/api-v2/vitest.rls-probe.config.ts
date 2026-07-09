// Config EXCLUSIVA del probe RLS. No se auto-carga en `pnpm test` (vitest solo
// auto-descubre vitest.config.*). Se usa explícito:
//   npx vitest run --config vitest.rls-probe.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/rls-enforcement.probe.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
