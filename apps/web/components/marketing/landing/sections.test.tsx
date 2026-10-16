// @vitest-environment node
// Pruebas de las secciones de la landing (bloque B): se renderizan a HTML
// estático, igual que en build, y se verifica la estructura que importa.
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../lib/marketing/landing-font', () => ({
  schibsted: { className: 'font-landing', variable: 'font-landing-var' },
}));

import { landing } from '../../../content/landing';
import { Faq } from './Faq';
import { Footer } from './Footer';
import { formatAsOf, ProofBar } from './ProofBar';
import { Hero } from './Hero';
import { LandingPage } from './LandingPage';
import { Modules } from './Modules';
import { Nav } from './Nav';
import { Problem } from './Problem';
import { Steps } from './Steps';
import { Trust } from './Trust';

const page = renderToStaticMarkup(<LandingPage content={landing} />);
const imgTags = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];

describe('Nav', () => {
  const html = renderToStaticMarkup(<Nav content={landing.nav} />);
  it('header con nav etiquetado, login y CTA primario a #contacto', () => {
    expect(html).toContain('<header');
    expect(html).toMatch(/<nav[^>]*aria-label="Secciones"/);
    expect(html).toContain('href="/login"');
    expect(html).toMatch(/<a href="#contacto"[^>]*data-cta="primary"/);
  });
});

describe('Hero', () => {
  const html = renderToStaticMarkup(<Hero content={landing.hero} />);
  it('un h1 con el título (LCP = texto)', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(landing.hero.title);
    expect(html).not.toMatch(/opacity:\s*0/);
  });
  it('CTA primario a #contacto y secundario a /login', () => {
    expect(html).toMatch(/<a href="#contacto"[^>]*data-cta="primary"/);
    expect(html).toMatch(/<a href="\/login"[^>]*data-cta="secondary"/);
  });
  it('imagen del hero: fetchPriority alta, eager, width/height y recorte móvil', () => {
    const [img] = imgTags(html);
    expect(img).toMatch(/width="\d+"/);
    expect(img).toMatch(/height="\d+"/);
    expect(img).toMatch(/fetchPriority="high"|fetchpriority="high"/);
    expect(img).toContain('loading="eager"');
    expect(html).toContain('<picture>');
    expect(html).toMatch(/<source media="\(max-width: 767px\)"/);
  });
});

describe('ProofBar', () => {
  const html = renderToStaticMarkup(<ProofBar content={landing.proof} />);
  it('frase con cifras reales, cliente, fecha y fuente', () => {
    expect(html).toContain('3,557');
    expect(html).toContain('2,837');
    expect(html).toContain('63');
    expect(html).toContain('Centro Cultural Banreservas');
    expect(html).toContain('Datos al 16 de octubre de 2026.');
    expect(html).toContain('Fuente:');
    expect(html).not.toMatch(/\{m\d\}|\{client\}/);
  });
  it('formatAsOf', () => {
    expect(formatAsOf('2026-05-04')).toBe('4 de mayo de 2026');
  });
});

describe('Problem / Steps / Trust', () => {
  it('Problem: tres filas Hoy → Con contan2', () => {
    const html = renderToStaticMarkup(<Problem content={landing.problem!} />);
    expect(html.match(/compare__row/g)).toHaveLength(3);
  });
  it('Steps: lista ordenada de tres pasos', () => {
    const html = renderToStaticMarkup(<Steps content={landing.steps} />);
    expect(html).toContain('<ol');
    expect(html.match(/class="step"/g)).toHaveLength(3);
  });
  it('Trust: cuatro ítems con ícono SVG inline', () => {
    const html = renderToStaticMarkup(<Trust content={landing.trust} />);
    expect(html.match(/<li class="trust__item"/g)).toHaveLength(4);
    expect(html.match(/<svg\b/g)?.length).toBe(4);
  });
});

describe('Modules', () => {
  const html = renderToStaticMarkup(<Modules content={landing.modules} />);
  it('seis módulos, sin Biblioteca, con h3 y viñetas', () => {
    expect(html.match(/<article\b/g)).toHaveLength(6);
    expect(html.match(/<h3\b/g)).toHaveLength(6);
    expect(html).not.toMatch(/bibliotec/i);
  });
  it('imágenes con width/height, lazy y sizes (ninguna eager ni prioritaria)', () => {
    const imgs = imgTags(html);
    expect(imgs).toHaveLength(6);
    for (const img of imgs) {
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
      expect(img).toContain('loading="lazy"');
      expect(img).toMatch(/sizes="/);
      expect(img).not.toMatch(/fetchpriority="high"/i);
    }
  });
});

describe('Faq', () => {
  const html = renderToStaticMarkup(<Faq content={landing.faq} />);
  it('<details> nativo por pregunta, cerrados al cargar', () => {
    expect(html.match(/<details\b/g)).toHaveLength(landing.faq.items.length);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html.match(/<summary\b/g)).toHaveLength(landing.faq.items.length);
  });
  it('enlace lateral a #contacto', () => {
    expect(html).toContain('href="#contacto"');
  });
});

describe('Footer', () => {
  const html = renderToStaticMarkup(<Footer content={landing.footer} />);
  it('landmark footer; Privacidad y Términos como texto, sin enlace', () => {
    expect(html).toContain('<footer');
    expect(html).toContain('Privacidad');
    expect(html).toContain('Términos');
    expect(html).toContain('(disponibles próximamente)');
    expect(html).not.toMatch(/<a [^>]*>\s*Privacidad/);
    expect(html).not.toMatch(/<a [^>]*>\s*Términos/);
    expect(html).not.toContain('href="#"');
  });
  it('correo de contacto', () => {
    expect(html).toContain('mailto:soporte@contan2.com');
  });
});

describe('LandingPage completa', () => {
  it('un solo h1', () => {
    expect(page.match(/<h1\b/g)).toHaveLength(1);
  });
  it('landmarks: header, nav con aria-label, main y footer', () => {
    expect(page).toContain('<header');
    expect(page).toMatch(/<nav[^>]*aria-label=/);
    expect(page).toContain('<main');
    expect(page).toContain('<footer');
  });
  it('todas las imágenes con width y height; solo una con fetchPriority alta', () => {
    const imgs = imgTags(page);
    expect(imgs.length).toBe(7);
    for (const img of imgs) {
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
    }
    expect(imgs.filter((i) => /fetchpriority="high"/i.test(i))).toHaveLength(1);
  });
  it('CTA primario a #contacto en nav y hero; sección #contacto presente', () => {
    expect(page.match(/data-cta="primary"/g)!.length).toBeGreaterThanOrEqual(2);
    expect(page).toContain('id="contacto"');
  });
  it('anclas del nav existen como id', () => {
    for (const l of landing.nav.links) expect(page).toContain(`id="${l.href.slice(1)}"`);
  });
  it('sin chunks de framework: cero <script src>; a lo sumo un inline ≤3 KB (mejora progresiva del formulario)', () => {
    expect(page).not.toMatch(/<script[^>]*\ssrc=/);
    expect(page).not.toContain('use client');
    const inline = [...page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? "");
    expect(inline.length).toBeLessThanOrEqual(1);
    for (const code of inline) expect(Buffer.byteLength(code, 'utf8')).toBeLessThanOrEqual(3072);
  });
  it('ids únicos', () => {
    const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
