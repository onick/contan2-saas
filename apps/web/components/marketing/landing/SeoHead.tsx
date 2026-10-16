// SeoHead · <head> de la landing (Pages Router → next/head). Server-render
// puro, sin runtime JS. Stub: el bloque C agrega JSON-LD.
import Head from 'next/head';
import type { LandingSeo } from '../../../lib/marketing/seo';

export function SeoHead({ seo }: { seo: LandingSeo }) {
  const og = seo.openGraph;
  return (
    <Head>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="canonical" href={seo.canonical} />
      <meta property="og:type" content={og.type} />
      <meta property="og:locale" content={og.locale} />
      <meta property="og:site_name" content={og.siteName} />
      <meta property="og:url" content={og.url} />
      <meta property="og:title" content={og.title} />
      <meta property="og:description" content={og.description} />
      <meta property="og:image" content={og.image.url} />
      <meta property="og:image:width" content={String(og.image.width)} />
      <meta property="og:image:height" content={String(og.image.height)} />
      <meta property="og:image:alt" content={og.image.alt} />
      <meta name="twitter:card" content={seo.twitter.card} />
      <meta name="twitter:title" content={seo.twitter.title} />
      <meta name="twitter:description" content={seo.twitter.description} />
      <meta name="twitter:image" content={seo.twitter.image} />
      <script
        type="application/ld+json"
        // Escapa '<' para que ningún valor del contenido cierre el <script>.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c') }}
      />
    </Head>
  );
}
