// apps/web/content/landing.types.ts · contrato tipado del contenido de la
// landing (plan 2026-10-16 §4-S). El contenido real vive en content/landing.ts;
// los componentes de components/marketing/landing/* solo lo renderizan.

import type { StaticImageData } from 'next/image';

export type LandingImage = {
  src: StaticImageData;
  /** Recorte para pantallas <768 px (arte dirigido con <picture>). Aditivo. */
  mobileSrc?: StaticImageData;
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
  href: '/login' | '#contacto' | `mailto:${string}`;
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
    /** Aditivos (bloque B): ubicación del cliente, frase con {client} y {m0}…{mN}, y notas. */
    location?: string;
    statement?: string;
    sourceNote?: string;
    note?: string;
  };
  /** Aditivo (bloque B): sección Problema → solución. */
  problem?: {
    heading: string;
    labels: { before: string; after: string };
    rows: { before: string; after: string }[];
  };
  modules: { heading: string; intro: string; items: LandingModule[] };
  steps: { heading: string; items: { title: string; body: string }[] };
  trust: {
    heading: string;
    /** Aditivo: cada ítem puede indicar su ícono (lucide, ya inline). */
    items: { title: string; body: string; icon?: 'lock' | 'database' | 'qr' | 'user-check' }[];
    note?: string;
  };
  faq: {
    heading: string;
    items: { q: string; a: string }[];
    /** Aditivo: texto lateral con enlace a #contacto. */
    aside?: { before: string; linkLabel: string; after: string };
  };
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
    /** Aditivos (bloque B). Un enlace sin `href` se renderiza como texto. */
    tagline?: string;
    origin?: string;
    groups?: { title: string; links: { label: string; href?: string; note?: string }[] }[];
  };
};
