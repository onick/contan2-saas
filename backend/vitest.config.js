import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    // Tests usan DB_DRIVER=memory para velocidad. Si se quisiera testear
    // contra Postgres real, setear DB_DRIVER=postgres + DATABASE_URL antes.
    // Cada test arranca con env limpio (sin sesiones residuales).
    isolate: true,
    fileParallelism: false, // memory driver es estado global, evitar carreras
    // Auto-restore env/globals stubbed con vi.stubEnv/vi.stubGlobal entre
    // tests. Previene leak de process.env entre archivos cuando un test
    // muta variables (ej. ROOT_DOMAIN en platform-admin-ux.test.js) y
    // contamina la app/config que otro archivo arma a partir de defaults.
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
