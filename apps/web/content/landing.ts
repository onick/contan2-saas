// apps/web/content/landing.ts · contenido PLACEHOLDER de la landing. El bloque B
// lo reemplaza por el copy final aprobado en el mockup.

import shotKiosko from './landing/media/shot-kiosko.png';
import type { LandingContent, LandingImage } from './landing.types';

const image: LandingImage = {
  src: shotKiosko,
  alt: '[placeholder] Captura del kiosko de registro',
  origin: 'staging-test-tenant',
  capturedAt: '2026-10-16',
  redacted: false,
};

export const landing: LandingContent = {
  seo: {
    title: '[placeholder] contan2 · registro y asistencia',
    description:
      '[placeholder] Descripción de la plataforma contan2 para centros culturales: registro, control de acceso y reportes en un solo lugar.',
    canonical: 'https://contan2.com/',
    ogImage: { url: 'https://contan2.com/marketing/og.png', width: 1200, height: 630, alt: '[placeholder] contan2' },
  },
  nav: {
    links: [
      { label: 'Producto', href: '#producto' },
      { label: 'Preguntas', href: '#preguntas' },
    ],
    login: { label: 'Iniciar sesión', href: '/login', variant: 'ghost' },
    primary: { label: 'Solicitar una demo', href: '#contacto', variant: 'primary' },
  },
  hero: {
    eyebrow: '[placeholder] Eyebrow',
    title: '[placeholder] Título principal de la landing',
    subtitle: '[placeholder] Subtítulo breve que explica la propuesta de valor.',
    ctas: [
      { label: 'Solicitar una demo', href: '#contacto', variant: 'primary' },
      { label: 'Iniciar sesión', href: '/login', variant: 'secondary' },
    ],
    image,
  },
  proof: {
    client: { name: '[placeholder] Cliente', permissionRef: 'pendiente' },
    metrics: [{ value: '0', label: '[placeholder] Métrica', source: 'placeholder', asOf: '2026-10-16' }],
  },
  modules: {
    heading: '[placeholder] Módulos',
    intro: '[placeholder] Introducción a los módulos.',
    items: [
      {
        id: 'kiosko',
        kicker: '[placeholder]',
        title: '[placeholder] Kiosko',
        body: '[placeholder] Descripción del módulo.',
        bullets: ['[placeholder] Punto uno', '[placeholder] Punto dos'],
        image,
      },
    ],
  },
  steps: {
    heading: '[placeholder] Cómo funciona',
    items: [{ title: '[placeholder] Paso uno', body: '[placeholder] Detalle del paso.' }],
  },
  trust: {
    heading: '[placeholder] Confianza y datos',
    items: [{ title: '[placeholder] Seguridad', body: '[placeholder] Detalle.' }],
  },
  faq: {
    heading: '[placeholder] Preguntas frecuentes',
    items: [{ q: '[placeholder] ¿Pregunta de ejemplo?', a: '[placeholder] Respuesta de ejemplo.' }],
  },
  contact: {
    heading: '[placeholder] Hablemos',
    body: '[placeholder] Cuéntanos sobre tu organización.',
    successTitle: '[placeholder] Mensaje enviado',
    successBody: '[placeholder] Te responderemos pronto.',
    errorBody: '[placeholder] No pudimos enviar tu mensaje. Inténtalo de nuevo.',
    fallbackEmail: 'hola@contan2.com',
  },
  footer: {
    legal: '[placeholder] © contan2',
    email: 'hola@contan2.com',
    links: [{ label: 'Iniciar sesión', href: '/login' }],
  },
};
