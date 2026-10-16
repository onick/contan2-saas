// sitemap.xml: solo la raíz pública mientras no existan más páginas públicas.
// En staging y tenants responde un <urlset> vacío (200) en vez de 404: es
// válido para los crawlers y evita ruido de errores.
import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getRequestHost } from '../lib/marketing/host';
import { sitemapFor } from '../lib/marketing/seo';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = getRequestHost(await headers());
  return sitemapFor(host, process.env.ROOT_DOMAIN);
}
