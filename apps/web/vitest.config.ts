import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Next convierte `import img from './x.png'` en StaticImageData
// ({ src, width, height }); vite solo da la URL. Este plugin imita a Next para
// que los componentes con next/image estático se puedan renderizar en tests.
const staticImages = (): Plugin => ({
  name: 'next-static-image-stub',
  enforce: 'pre',
  load(id) {
    const clean = id.split('?')[0] ?? id;
    if (!/\.(png|jpe?g|webp|avif|gif)$/i.test(clean)) return null;
    return `export default { src: ${JSON.stringify(clean)}, width: 1200, height: 800 };`;
  },
});

export default defineConfig({
  plugins: [staticImages(), react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
  },
});
