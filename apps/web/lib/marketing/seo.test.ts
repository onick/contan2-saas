import { describe, it, expect } from 'vitest';
import { buildLandingSeo } from './seo';
import { landing } from '../../content/landing';

describe('buildLandingSeo (mínimo; el bloque C lo completa)', () => {
  const seo = buildLandingSeo(landing);

  it('toma title, description y canonical del contenido', () => {
    expect(seo.title).toBe(landing.seo.title);
    expect(seo.description).toBe(landing.seo.description);
    expect(seo.canonical).toBe('https://contan2.com/');
  });

  it('og básico: website, es_DO, imagen 1200x630', () => {
    expect(seo.openGraph.type).toBe('website');
    expect(seo.openGraph.locale).toBe('es_DO');
    expect(seo.openGraph.url).toBe('https://contan2.com/');
    expect(seo.openGraph.image).toMatchObject({ width: 1200, height: 630 });
  });

  it('JSON-LD mínimo de Organization (el bloque C agrega SoftwareApplication)', () => {
    expect(seo.jsonLd).toMatchObject({ '@context': 'https://schema.org', '@type': 'Organization', url: 'https://contan2.com/' });
  });

  it('twitter summary_large_image', () => {
    expect(seo.twitter.card).toBe('summary_large_image');
  });
});
