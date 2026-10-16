// robots.txt por HOST. Leer headers() vuelve la ruta dinámica (se renderiza
// por petición; es un texto mínimo, costo despreciable). Trade-off: la
// alternativa estática resolvería por ROOT_DOMAIN en build, pero los tenants
// (*.contan2.com) comparten la imagen con el marketing y necesitan
// `Disallow: /`, así que el host solo se conoce en runtime.
import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getRequestHost } from '../lib/marketing/host';
import { robotsFor } from '../lib/marketing/seo';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = getRequestHost(await headers());
  return robotsFor(host, process.env.ROOT_DOMAIN);
}
