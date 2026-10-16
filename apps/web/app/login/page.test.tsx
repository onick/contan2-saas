// apps/web/app/login/page.test.tsx · textos e identidad del login (presentación).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
const pubState = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock('../../lib/api/kiosko', () => ({ getPublicBranding: async () => pubState.value }));

import LoginPage from './page';

afterEach(() => { cleanup(); pubState.value = null; });

async function renderPage(next?: string) {
  const ui = await LoginPage({ searchParams: Promise.resolve(next ? { next } : {}) });
  render(ui);
}

describe('/login', () => {
  it('host sin organización (API pública sin tenant): login NEUTRO, nunca la identidad del CCB (Q8-65)', async () => {
    await renderPage();
    expect(screen.getByTestId('brand-chip')).toBeInTheDocument();
    expect(screen.getByText('contan2')).toBeInTheDocument();
    expect(screen.queryByText(/Banreservas|Centro Cultural/)).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('conserva la identidad y los textos en español', async () => {
    pubState.value = {
      name: 'Centro Cultural Banreservas', logoUrl: null, verticalLogoUrl: null,
      primaryColor: '#f39228', secondaryColor: '#31a3db',
    };
    await renderPage();
    expect(screen.getByTestId('brand-chip')).toBeInTheDocument();
    // Nombre del tenant en dos líneas.
    expect(screen.getByText('Centro Cultural')).toBeInTheDocument();
    expect(screen.getByText('Banreservas')).toBeInTheDocument();
    expect(screen.getByRole('heading')).toBeInTheDocument();
    expect(screen.getByText('Panel de administración')).toBeInTheDocument();
    expect(screen.getByText('Correo')).toBeInTheDocument();
    expect(screen.getByText('Contraseña')).toBeInTheDocument();
    expect(screen.getByText('Mantener la sesión iniciada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeInTheDocument();
    expect(
      screen.getByText('Acceso restringido al equipo del centro cultural.'),
    ).toBeInTheDocument();
  });

  it('no agrega Google ni registro; la recuperación es el único enlace (S1)', async () => {
    await renderPage();
    expect(screen.queryByText(/google/i)).toBeNull();
    expect(screen.queryByText(/sign up|regist|crear cuenta/i)).toBeNull();
    expect(screen.getByText(/¿Olvidaste tu contraseña\?/)).toBeInTheDocument(); // S1: recuperación real
    expect(screen.queryAllByRole('link')).toHaveLength(1);
  });
});
