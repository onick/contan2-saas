import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CategoryReport } from './ReportesDashboard';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const range = { from: '2026-10-01', to: '2026-10-16' };

describe('CategoryReport · error ≠ vacío', () => {
  it('API 500 → alerta de error, no "Todavía no hay actividades con categoría"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(500, {})));
    render(<CategoryReport range={range} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar las categorías');
    expect(screen.queryByText(/Todavía no hay actividades con categoría/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('403 → "sin permiso" sin Reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(403, {})));
    render(<CategoryReport range={range} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('200 con lista vacía → mensaje de vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { categories: [] })));
    render(<CategoryReport range={range} />);
    expect(await screen.findByText(/Todavía no hay actividades con categoría/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Reintentar se recupera', async () => {
    const f = vi.fn().mockResolvedValueOnce(J(500, {})).mockResolvedValue(J(200, { categories: [{ category: 'Cine', activities: 2 }] }));
    vi.stubGlobal('fetch', f);
    render(<CategoryReport range={range} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Cine (2)' })).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
