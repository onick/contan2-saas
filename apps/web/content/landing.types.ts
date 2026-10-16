// apps/web/content/landing.types.ts · contrato tipado del contenido de la
// landing (plan 2026-10-16 §4-S). El contenido real vive en content/landing.ts;
// los componentes de components/marketing/landing/* solo lo renderizan.

import type { StaticImageData } from 'next/image';

export type LandingImage = {
  src: StaticImageData;
  alt: string;
  caption?: string;
  /** De dónde salió la captura (trazabilidad de PII). */
  origin: 'staging-ccb' | 'staging-test-tenant' | 'prod-ccb';
  /** Fecha ISO (YYYY-MM-DD) de la captura. */
  capturedAt: string;
  /** ¿Se difuminó/aplanó información personal? */
  redacted: boolean;
};

export type LandingCta = {
  label: string;
  href: '/login' | '/registro' | '#contacto' | `mailto:${string}`;
  variant: 'primary' | 'secondary' | 'ghost';
};

export type LandingMetric = {
  value: string;
  label: string;
  source: string;
  /** Fecha ISO (YYYY-MM-DD) del dato. */
  asOf: string;
};

export type LandingModule = {
  id: 'kiosko' | 'puerta' | 'audiencias' | 'protocolo' | 'reportes' | 'identidad';
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  image: LandingImage;
};

export type LandingContent = {
  seo: {
    title: string;
    description: string;
    canonical: 'https://contan2.com/';
    ogImage: { url: string; width: 1200; height: 630; alt: string };
  };
  nav: {
    links: { label: string; href: `#${string}` }[];
    login: LandingCta;
    primary: LandingCta;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    ctas: LandingCta[];
    image: LandingImage;
  };
  proof: {
    client: { name: string; logo?: LandingImage; permissionRef: string };
    metrics: LandingMetric[];
  };
  modules: { heading: string; intro: string; items: LandingModule[] };
  steps: { heading: string; items: { title: string; body: string }[] };
  trust: { heading: string; items: { title: string; body: string }[] };
  faq: { heading: string; items: { q: string; a: string }[] };
  contact: {
    heading: string;
    body: string;
    successTitle: string;
    successBody: string;
    errorBody: string;
    fallbackEmail: string;
  };
  footer: {
    legal: string;
    email: string;
    links: { label: string; href: string }[];
  };
};
