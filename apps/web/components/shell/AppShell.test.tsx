import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { AppShell, CONTENT_WIDTH_CLASS } from './AppShell';
import { DEFAULT_BRANDING } from '../../lib/branding/config';

// TopbarUserMenu usa useRouter (logout por fetch + replace): fuera de Next no hay app router montado.
vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

// globals:false → cleanup explícito entre renders (ver Sidebar.test.tsx).
afterEach(cleanup);

describe('AppShell', () => {
  it('renderiza sidebar (nav principal), topbar (breadcrumb) y el contenido en <main>', async () => {
    const ui = await AppShell({ branding: DEFAULT_BRANDING, title: 'Inicio', role: 'owner', children: <p>contenido hijo</p> });
    render(ui);

    // Navegación del sidebar (única con nombre "Navegación principal" — la barra
    // inferior ahora tiene aria-label="Navegación inferior").
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    // Topbar: el breadcrumb (nav "Ruta") está presente.
    expect(screen.getByRole('navigation', { name: 'Ruta' })).toBeInTheDocument();
    // El título aparece en el breadcrumb.
    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0);
    // Main: el contenido hijo se renderiza dentro de <main>.
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent('contenido hijo');
    // Shell de colapso presente (expandido por defecto sin cookie) + toggle accesible.
    expect(document.querySelector('[data-sidebar="expanded"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Colapsar navegación' })).toBeInTheDocument();
  });

  it('con `parent`, el breadcrumb es Inicio / Padre (enlace) / Título', async () => {
    render(await AppShell({
      branding: DEFAULT_BRANDING, title: 'Nueva actividad', role: 'owner',
      parent: { label: 'Actividades', href: '/app/actividades' }, children: <p>x</p>,
    }));
    const crumb = screen.getByRole('navigation', { name: 'Ruta' });
    expect(crumb).toHaveTextContent('Inicio/Actividades/Nueva actividad');
    expect(crumb.querySelector('a')).toHaveAttribute('href', '/app/actividades');
    expect(crumb.querySelector('[aria-current="page"]')).toHaveTextContent('Nueva actividad');
  });

  it('aplica la regla ÚNICA de ancho: el hijo de <main> centra y topa con --content-max', async () => {
    render(await AppShell({ branding: DEFAULT_BRANDING, title: 'Inicio', role: 'owner', children: <h1>Título</h1> }));
    const main = screen.getByRole('main');
    const box = main.firstElementChild as HTMLElement;
    expect(main.children).toHaveLength(1);
    expect(box).toHaveAttribute('data-content-width', 'default');
    expect(box.className).toBe(CONTENT_WIDTH_CLASS.default);
    expect(box.className).toContain('mx-auto');
    expect(box.className).toContain('w-full');
    expect(box.className).toContain('max-w-[var(--content-max)]');
    expect(box).toContainElement(screen.getByRole('heading', { name: 'Título' }));
  });

  it('`wide` cambia SOLO el token (--content-max-wide), sin clases sueltas en la página', async () => {
    render(await AppShell({ branding: DEFAULT_BRANDING, title: 'Usuarios', role: 'owner', wide: true, children: <p>tabla</p> }));
    const box = screen.getByRole('main').firstElementChild as HTMLElement;
    expect(box).toHaveAttribute('data-content-width', 'wide');
    expect(box.className).toContain('max-w-[var(--content-max-wide)]');
    expect(box.className).not.toContain('max-w-[var(--content-max)]');
  });
});

// Guardas estáticas: el ancho del admin vive en UN lugar (AppShell + token en
// globals.css). Si alguien vuelve a envolver una página con su propio max-w, esto falla.
describe('ancho del contenido del admin · sin divergencias', () => {
  const webRoot = resolve(__dirname, '../..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });

  it('globals.css define los tokens --content-max y --content-max-wide', () => {
    const css = readFileSync(join(webRoot, 'app/globals.css'), 'utf8');
    expect(css).toMatch(/--content-max:\s*[\d.]+rem;/);
    expect(css).toMatch(/--content-max-wide:\s*[\d.]+rem;/);
  });

  it('ninguna ruta de app/app/** fija su propio ancho (max-w) a nivel de página', () => {
    // /app/kit es la galería interna del kit: NO usa AppShell (se verifica abajo), así que
    // no participa de la regla.
    const allow = new Set(['app/app/kit/page.tsx']);
    const offenders = walk(join(webRoot, 'app/app'))
      .map((f) => relative(webRoot, f))
      .filter((f) => !allow.has(f))
      .filter((f) => /\bmax-w-(\[|screen|[0-9]xl\b|prose\b|full\b)/.test(readFileSync(join(webRoot, f), 'utf8')));
    expect(offenders).toEqual([]);
    for (const f of allow) expect(readFileSync(join(webRoot, f), 'utf8')).not.toMatch(/AppShell/);
  });

  it('ningún componente reintroduce el wrapper de página `mx-auto w-full max-w-…`', () => {
    const offenders = walk(join(webRoot, 'components'))
      .map((f) => relative(webRoot, f))
      .filter((f) => f !== 'components/shell/AppShell.tsx')
      .filter((f) => /mx-auto w-full max-w-/.test(readFileSync(join(webRoot, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
