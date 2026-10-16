// apps/web/lib/marketing/seo.ts · SEO de la landing. Implementación MÍNIMA
// (title/description/canonical/og/twitter); el bloque C agrega JSON-LD,
// robots, sitemap y validaciones de longitud.

import type { LandingContent } from '../../content/landing.types';

export type LandingSeo = {
  title: string;
  description: string;
  canonical: string;
  openGraph: {
    type: 'website';
    locale: 'es_DO';
    siteName: string;
    url: string;
    title: string;
    description: string;
    image: { url: string; width: number; height: number; alt: string };
  };
  twitter: { card: 'summary_large_image'; title: string; description: string; image: string };
  jsonLd: Record<string, unknown>;
};

export function buildLandingSeo(c: LandingContent): LandingSeo {
  const { title, description, canonical, ogImage } = c.seo;
  return {
    title,
    description,
    canonical,
    openGraph: {
      type: 'website',
      locale: 'es_DO',
      siteName: 'contan2',
      url: canonical,
      title,
      description,
      image: ogImage,
    },
    twitter: { card: 'summary_large_image', title, description, image: ogImage.url },
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'contan2',
      url: canonical,
      logo: ogImage.url,
    },
  };
}
