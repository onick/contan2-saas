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
  },
});
