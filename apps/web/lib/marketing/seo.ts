// apps/web/lib/marketing/seo.ts · SEO de la landing de contan2.com.
// Puro y sin dependencias de runtime: lo consumen SeoHead (Pages Router,
// sin JS), toNextMetadata (App Router), app/robots.ts y app/sitemap.ts.

import type { Metadata, MetadataRoute } from 'next';
import type { LandingContent } from '../../content/landing.types';
import { isMarketingHost } from './host';

export const SITE_URL = 'https://contan2.com/';
export const SITE_NAME = 'contan2';

export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 160;

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
      siteName: SITE_NAME,
      url: canonical,
      title,
      description,
      image: ogImage,
    },
    twitter: { card: 'summary_large_image', title, description, image: ogImage.url },
    // Solo hechos verificables: sin aggregateRating, reseñas ni ofertas/precios.
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${canonical}#organization`,
          name: SITE_NAME,
          url: canonical,
          logo: ogImage.url,
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${canonical}#software`,
          name: SITE_NAME,
          url: canonical,
          description,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          inLanguage: 'es',
          publisher: { '@id': `${canonical}#organization` },
        },
      ],
    },
  };
}

/** Metadata de App Router (equivalente a lo que emite SeoHead en Pages). */
export function toNextMetadata(seo: LandingSeo): Metadata {
  const og = seo.openGraph;
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.canonical },
    openGraph: {
      type: og.type,
      locale: og.locale,
      siteName: og.siteName,
      url: og.url,
      title: og.title,
      description: og.description,
      images: [{ url: og.image.url, width: og.image.width, height: og.image.height, alt: og.image.alt }],
    },
    twitter: {
      card: seo.twitter.card,
      title: seo.twitter.title,
      description: seo.twitter.description,
      images: [seo.twitter.image],
    },
  };
}

/** JSON-LD serializado seguro para incrustar en un <script> (escapa '<'). */
export function serializeJsonLd(jsonLd: Record<string, unknown>): string {
  return JSON.stringify(jsonLd).replace(/</g, '\\u003c');
}

/**
 * Valida longitudes (título ≤60, descripción 120–160). Devuelve mensajes
 * claros; [] = todo bien.
 */
export function validateSeoCopy(seo: Pick<LandingContent['seo'], 'title' | 'description'>): string[] {
  const errors: string[] = [];
  const t = [...seo.title].length;
  const d = [...seo.description].length;
  if (t === 0 || t > TITLE_MAX) errors.push(`seo.title mide ${t} caracteres; debe tener entre 1 y ${TITLE_MAX}.`);
  if (d < DESCRIPTION_MIN || d > DESCRIPTION_MAX)
    errors.push(`seo.description mide ${d} caracteres; debe tener entre ${DESCRIPTION_MIN} y ${DESCRIPTION_MAX}.`);
  return errors;
}

/** Marcadores de contenido provisional que no deben llegar a producción. */
export function findSeoPlaceholders(c: LandingContent['seo']): string[] {
  const out: string[] = [];
  if (/\[placeholder\]/i.test(c.title)) out.push('seo.title contiene "[placeholder]".');
  if (/\[placeholder\]/i.test(c.description)) out.push('seo.description contiene "[placeholder]".');
  if (/\[placeholder\]/i.test(c.ogImage.alt)) out.push('seo.ogImage.alt contiene "[placeholder]".');
  return out;
}

// ── robots / sitemap por host ────────────────────────────────────────────────

export type SiteKind = 'marketing' | 'closed';

/**
 * 'marketing' solo para el host público de producción (contan2.com / www).
 * Todo lo demás (tenants, admin.*, y CUALQUIER host en staging stg.*) es
 * 'closed': no indexable.
 */
export function siteKind(host: string | null | undefined, rootDomain: string | undefined): SiteKind {
  const root = (rootDomain ?? 'localhost').toLowerCase();
  if (root.startsWith('stg.')) return 'closed';
  return isMarketingHost(host, root) ? 'marketing' : 'closed';
}

export function robotsFor(host: string | null | undefined, rootDomain: string | undefined): MetadataRoute.Robots {
  if (siteKind(host, rootDomain) === 'closed') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/app/', '/platform/', '/landing'] },
    sitemap: `${SITE_URL}sitemap.xml`,
  };
}

export function sitemapFor(host: string | null | undefined, rootDomain: string | undefined): MetadataRoute.Sitemap {
  if (siteKind(host, rootDomain) === 'closed') return [];
  return [{ url: SITE_URL, changeFrequency: 'monthly', priority: 1 }];
}
