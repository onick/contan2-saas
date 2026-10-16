// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../lib/marketing/landing-font', () => ({
  schibsted: { className: 'font-landing', variable: 'font-landing-var' },
}));

import { LandingPage } from './LandingPage';
import { landing } from '../../../content/landing';

describe('LandingPage', () => {
  const html = renderToStaticMarkup(<LandingPage content={landing} />);

  it('un solo h1 con el título del contenido', () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(landing.hero.title);
  });

  it('landmarks y formulario nativo de contacto', () => {
    expect(html).toContain('<main');
    expect(html).toContain('<footer');
    expect(html).toContain('action="/api/contact"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="fax"');
  });
});

describe('ContactSection · espejo de ContactRequestSchema', () => {
  it('límites HTML iguales al schema', () => {
    const html = renderToStaticMarkup(<LandingPage content={landing} />);
    expect(html).toContain('minLength="2"');
    expect(html).toContain('maxLength="120"');
    expect(html).toContain('maxLength="160"');
    expect(html).toContain('maxLength="255"');
    expect(html).toContain('maxLength="2000"');
  });
});
