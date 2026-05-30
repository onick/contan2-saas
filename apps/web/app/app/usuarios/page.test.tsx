import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import UsuariosPage from './page';

afterEach(cleanup);

describe('/app/usuarios', () => {
  it('renderiza encabezado y acciones', () => {
    render(<UsuariosPage />);
    expect(screen.getByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo usuario/i })).toBeInTheDocument();
  });

  it('renderiza usuarios demo (sin PII real, @example.com)', () => {
    render(<UsuariosPage />);
    expect(screen.getByText('Sofía Méndez')).toBeInTheDocument();
    expect(screen.getByText('sofia.m@example.com')).toBeInTheDocument();
    expect(screen.getByText('Mariana Tavárez')).toBeInTheDocument();
  });

  it('marca "Usuarios" como ítem activo del sidebar', () => {
    render(<UsuariosPage />);
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('aria-current', 'page');
  });
});
