import { describe, it, expect } from 'vitest';
import {
  buildLandingSeo,
  toNextMetadata,
  serializeJsonLd,
  validateSeoCopy,
  findSeoPlaceholders,
  siteKind,
  robotsFor,
  sitemapFor,
} from './seo';
import { landing } from '../../content/landing';
import type { LandingContent } from '../../content/landing.types';

// Fixture propio: no depende del contenido (lo edita el bloque B).
const fixture = {
  seo: {
    title: 'contan2 · Registro de visitantes para centros culturales',
    description:
      'Registro de visitantes, acceso con credencial QR, invitaciones y reportes de asistencia para centros culturales, museos y salas, con tu identidad.',
    canonical: 'https://contan2.com/',
    ogImage: { url: 'https://contan2.com/marketing/og.png', width: 1200, height: 630, alt: 'Panel de contan2 con registro y reportes' },
  },
} as LandingContent;

describe('buildLandingSeo', () => {
  const seo = buildLandingSeo(fixture);

  it('toma title, description y canonical del contenido', () => {
    expect(seo.title).toBe(fixture.seo.title);
    expect(seo.description).toBe(fixture.seo.description);
    expect(seo.canonical).toBe('https://contan2.com/');
  });

  it('og: website, es_DO, imagen 1200x630 con alt', () => {
    expect(seo.openGraph.type).toBe('website');
    expect(seo.openGraph.locale).toBe('es_DO');
    expect(seo.openGraph.url).toBe('https://contan2.com/');
    expect(seo.openGraph.image).toEqual(fixture.seo.ogImage);
  });

  it('twitter summary_large_image con la misma imagen', () => {
    expect(seo.twitter).toEqual({
      card: 'summary_large_image',
      title: fixture.seo.title,
      description: fixture.seo.description,
      image: 'https://contan2.com/marketing/og.png',
    });
  });

  it('JSON-LD: Organization + SoftwareApplication exactos, sin aggregateRating ni ofertas', () => {
    expect(seo.jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': 'https://contan2.com/#organization',
          name: 'contan2',
          url: 'https://contan2.com/',
          logo: 'https://contan2.com/marketing/og.png',
        },
        {
          '@type': 'SoftwareApplication',
          '@id': 'https://contan2.com/#software',
          name: 'contan2',
          url: 'https://contan2.com/',
          description: fixture.seo.description,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          inLanguage: 'es',
          publisher: { '@id': 'https://contan2.com/#organization' },
        },
      ],
    });
    const s = JSON.stringify(seo.jsonLd);
    expect(s).not.toMatch(/aggregateRating|review|offers|price/i);
  });

  it('serializeJsonLd escapa "<" y sigue siendo JSON válido', () => {
    const out = serializeJsonLd({ a: '</script><b>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual({ a: '</script><b>' });
  });
});

describe('toNextMetadata', () => {
  it('refleja canonical, og y twitter', () => {
    const m = toNextMetadata(buildLandingSeo(fixture));
    expect(m.title).toBe(fixture.seo.title);
    expect(m.alternates?.canonical).toBe('https://contan2.com/');
    expect(m.openGraph).toMatchObject({ type: 'website', locale: 'es_DO', url: 'https://contan2.com/' });
    expect(m.openGraph?.images).toEqual([{ url: 'https://contan2.com/marketing/og.png', width: 1200, height: 630, alt: fixture.seo.ogImage.alt }]);
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: ['https://contan2.com/marketing/og.png'] });
  });
});

describe('validateSeoCopy', () => {
  const ok = { title: 'a'.repeat(60), description: 'b'.repeat(120) };
  it('acepta los límites inclusivos', () => {
    expect(validateSeoCopy(ok)).toEqual([]);
    expect(validateSeoCopy({ ...ok, description: 'b'.repeat(160) })).toEqual([]);
  });
  it('rechaza título > 60 con mensaje claro', () => {
    expect(validateSeoCopy({ ...ok, title: 'a'.repeat(61) })).toEqual(['seo.title mide 61 caracteres; debe tener entre 1 y 60.']);
  });
  it('rechaza descripción fuera de 120–160', () => {
    expect(validateSeoCopy({ ...ok, description: 'b'.repeat(119) })).toHaveLength(1);
    expect(validateSeoCopy({ ...ok, description: 'b'.repeat(161) })[0]).toContain('161 caracteres');
  });
  it('el fixture (copy ajustado a los límites) cumple', () => {
    expect(validateSeoCopy(fixture.seo)).toEqual([]);
  });
  it('el contenido real de la landing cumple las longitudes', () => {
    expect(validateSeoCopy(landing.seo)).toEqual([]);
  });
});

describe('findSeoPlaceholders', () => {
  it('detecta marcadores provisionales y pasa el copy final', () => {
    expect(findSeoPlaceholders(fixture.seo)).toEqual([]);
    const bad = { ...fixture.seo, title: '[placeholder] x', ogImage: { ...fixture.seo.ogImage, alt: '[placeholder] y' } };
    expect(findSeoPlaceholders(bad)).toHaveLength(2);
  });
});

describe('robots y sitemap por host', () => {
  it('prod marketing: Allow / + Disallow + Sitemap', () => {
    for (const host of ['contan2.com', 'www.contan2.com', 'contan2.com:443']) {
      expect(robotsFor(host, 'contan2.com')).toEqual({
        rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/app/', '/platform/', '/landing'] },
        sitemap: 'https://contan2.com/sitemap.xml',
      });
    }
  });
  it('tenants y admin: Disallow /', () => {
    for (const host of ['ccb.contan2.com', 'admin.contan2.com', null]) {
      expect(robotsFor(host, 'contan2.com')).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    }
  });
  it('staging: Disallow / en cualquier host, incluido el marketing', () => {
    for (const host of ['stg.contan2.com', 'ccb.stg.contan2.com', 'contan2.com']) {
      expect(robotsFor(host, 'stg.contan2.com')).toEqual({ rules: { userAgent: '*', disallow: '/' } });
      expect(sitemapFor(host, 'stg.contan2.com')).toEqual([]);
    }
  });
  it('sitemap: solo la raíz en marketing; vacío en tenants', () => {
    expect(sitemapFor('contan2.com', 'contan2.com')).toEqual([{ url: 'https://contan2.com/', changeFrequency: 'monthly', priority: 1 }]);
    expect(sitemapFor('ccb.contan2.com', 'contan2.com')).toEqual([]);
  });
  it('siteKind: sin ROOT_DOMAIN cae a localhost', () => {
    expect(siteKind('localhost', undefined)).toBe('marketing');
    expect(siteKind('ccb.localhost', undefined)).toBe('closed');
  });
});
