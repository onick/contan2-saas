import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MobileNav } from './MobileNav';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('MobileNav', () => {
  it('renderiza la barra inferior con los ítems preferidos como links', () => {
    render(<MobileNav activeKey="dashboard" />);
    // Ítems preferidos: dashboard → "Inicio", actividades, usuarios.
    expect(screen.getAllByRole('link', { name: /inicio/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /actividades/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /usuarios/i }).length).toBeGreaterThan(0);
    // Botón "Más" siempre presente.
    expect(screen.getByRole('button', { name: /más opciones/i })).toBeInTheDocument();
  });

  it('el ítem activo en la barra tiene aria-current="page" y el resto no', () => {
    render(<MobileNav activeKey="usuarios" />);
    const usuariosLinks = screen.getAllByRole('link', { name: /usuarios/i });
    expect(usuariosLinks[0]).toHaveAttribute('aria-current', 'page');
    const inicioLinks = screen.getAllByRole('link', { name: /inicio/i });
    expect(inicioLinks[0]).not.toHaveAttribute('aria-current');
  });

  it('el botón "Más" arranca cerrado (aria-expanded=false) y al clicar lo abre (aria-expanded=true)', () => {
    render(<MobileNav />);
    const btn = screen.getByRole('button', { name: /más opciones/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('role=protocolo → barra inferior con protocolo y mi cuenta, sin inicio', () => {
    render(<MobileNav activeKey="protocolo" role="protocolo" />);
    expect(screen.getAllByRole('link', { name: /protocolo/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /mi cuenta/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /inicio/i })).not.toBeInTheDocument();
  });

  it('role=null → sin confinamiento, ítems preferidos presentes en la barra', () => {
    render(<MobileNav activeKey="dashboard" role={null} />);
    expect(screen.getAllByRole('link', { name: /inicio/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /actividades/i }).length).toBeGreaterThan(0);
  });
});
