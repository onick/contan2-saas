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
  poweredByHeader: false,
  // Landing: AVIF primero (con WebP de respaldo), una sola calidad y pocos
  // anchos para que /_next/image genere pocas variantes (cache en disco del VPS).
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75],
    deviceSizes: [640, 828, 1080, 1440, 1920],
  },
  // Headers de seguridad (auditoría 2026-06-10). Sin CSP de script por ahora:
  // Next 16 requiere nonces para los inline scripts de hydration y eso pide un
  // middleware dedicado (queda en backlog explícito); estos headers no rompen
  // nada y cubren clickjacking/sniffing/leak de referrer/permisos del browser.
  async headers() {
    // El HTML estático de Pages Router sale sin Cache-Control: lo fijamos para
    // que sea cacheable en el borde (el rewrite de '/' en proxy.ts usa el mismo).
    const staticPageCache = [
      { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=86400' },
    ];
    return [
      { source: '/landing', headers: staticPageCache },
      { source: '/contacto/:path*', headers: staticPageCache },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
