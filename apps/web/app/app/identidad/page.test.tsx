import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import IdentidadPage from './page';

afterEach(cleanup);

describe('/app/identidad', () => {
  it('renderiza el encabezado y las secciones clave', () => {
    render(<IdentidadPage />);
    expect(screen.getByRole('heading', { name: 'Identidad de marca' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Colores de marca' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Estilo del menú' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dominio personalizado' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Emails' })).toBeInTheDocument();
  });

  it('muestra el dominio verificado y la barra de guardado', () => {
    render(<IdentidadPage />);
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar cambios/ })).toBeInTheDocument();
  });

  it('marca "Identidad" como ítem activo del sidebar', () => {
    render(<IdentidadPage />);
    expect(screen.getByRole('link', { name: 'Identidad' })).toHaveAttribute('aria-current', 'page');
  });
});
