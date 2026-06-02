import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Root del monorepo (apps/web → ../../). Necesario para que el output
// `standalone` trace e incluya los packages workspace (@contan2/contracts) y
// no se confunda con múltiples lockfiles. Solo afecta a `next build`.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Imagen autónoma para Docker (staging/v2): server + node_modules mínimos.
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
