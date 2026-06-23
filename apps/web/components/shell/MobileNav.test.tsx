import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SidebarShell, MobileNavToggle } from './SidebarShell';
import { MobileNav } from './MobileNav';
import type { BrandingOrg } from '../../lib/branding/theme';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const BR: BrandingOrg = {
  id: 'o', slug: 'acme', name: 'Acme Centro', logoUrl: null, emailLogoUrl: null, credentialLogoUrl: null,
  primaryColor: '#e65100', secondaryColor: '#ff6f00', sidebarTheme: 'brand', status: 'active',
  plan: 'free', trialEndsAt: null,
};
const setup = () => render(
  <SidebarShell>
    <MobileNavToggle />
    <MobileNav branding={BR} activeKey="usuarios" />
  </SidebarShell>,
);
// hidden:true → encuentra el panel esté abierto o cerrado (cerrado va aria-hidden).
const panel = () => screen.getByRole('dialog', { name: 'Navegación', hidden: true });
const openDrawer = () => fireEvent.click(screen.getByRole('button', { name: 'Abrir navegación' }));

describe('MobileNav', () => {
  it('arranca cerrado (off-canvas, fuera de pantalla)', () => {
    setup();
    expect(panel().className).toContain('-translate-x-full');
  });

  it('la hamburguesa abre el drawer y expone los ítems; tocar un ítem lo cierra', () => {
    setup();
    openDrawer();
    expect(panel().className).toContain('translate-x-0'); // abierto
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('link', { name: /Usuarios/ })).toHaveAttribute('href', '/app/usuarios');
    fireEvent.click(screen.getByRole('link', { name: /Actividades/ }));
    expect(panel().className).toContain('-translate-x-full'); // cerró al navegar
  });

  it('el item activo marca aria-current', () => {
    setup();
    openDrawer();
    expect(screen.getByRole('link', { name: /Usuarios/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Dashboard/ })).not.toHaveAttribute('aria-current');
  });
});
