import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import HistorialPage from './page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const emptyAudit = () => new Response('{"items":[],"nextCursor":null}', { status: 200, headers: { 'content-type': 'application/json' } });

describe('/app/historial', () => {
  it('renderiza el encabezado y el feed real (filtros server-side)', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyAudit()));
    render(<HistorialPage />);
    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de evento')).toBeInTheDocument(); // generador real, no demo
  });

  it('marca "Historial" como ítem activo del sidebar', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyAudit()));
    render(<HistorialPage />);
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('aria-current', 'page');
  });
});
