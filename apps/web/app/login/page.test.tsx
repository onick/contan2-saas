// apps/web/app/login/page.test.tsx · textos e identidad del login (presentación).
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import LoginPage from './page';

afterEach(cleanup);

async function renderPage(next?: string) {
  const ui = await LoginPage({ searchParams: Promise.resolve(next ? { next } : {}) });
  render(ui);
}

describe('/login', () => {
  it('conserva la identidad y los textos en español', async () => {
    await renderPage();
    // Logo: ícono real de la marca (símbolo CCB), con alt accesible.
    const logo = screen.getByRole('img', { name: 'Centro Cultural Banreservas' });
    expect(logo).toHaveAttribute('src', '/ccb-icon.svg');
    // Nombre en dos líneas.
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

  it('no agrega Google, registro, recuperación ni enlaces', async () => {
    await renderPage();
    expect(screen.queryByText(/google/i)).toBeNull();
    expect(screen.queryByText(/sign up|regist|crear cuenta/i)).toBeNull();
    expect(screen.queryByText(/forgot|olvid|recuperar/i)).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
