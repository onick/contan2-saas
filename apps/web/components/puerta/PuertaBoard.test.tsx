import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PuertaBoard } from './PuertaBoard';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('PuertaBoard · error ≠ vacío', () => {
  it('API 500 → estado de error con Reintentar (no "No hay salas permanentes")', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(500, { error: 'boom' })));
    render(<PuertaBoard initial={[]} />);
    expect(await screen.findByText('No pudimos cargar las salas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('No hay salas permanentes')).not.toBeInTheDocument();
  });

  it('fetch rechazado → estado de error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('red')));
    render(<PuertaBoard initial={[]} />);
    expect(await screen.findByText('No pudimos cargar las salas')).toBeInTheDocument();
  });

  it('403 → "sin permiso", sin Reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(403, { error: 'x' })));
    render(<PuertaBoard initial={[]} />);
    expect(await screen.findByText('No tienes permiso para ver las salas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('200 con lista vacía → sí muestra el vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { salas: [] })));
    render(<PuertaBoard initial={[]} />);
    expect(await screen.findByText('No hay salas permanentes')).toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar las salas')).not.toBeInTheDocument();
  });

  it('Reintentar vuelve a consultar y se recupera', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(J(500, {}))
      .mockResolvedValue(J(200, { salas: [] }));
    vi.stubGlobal('fetch', f);
    render(<PuertaBoard initial={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('No hay salas permanentes')).toBeInTheDocument());
  });
});
