import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// useRouter mockeado para capturar router.refresh().
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { NewActivityButton } from './NewActivityButton';

afterEach(() => { cleanup(); vi.restoreAllMocks(); refresh.mockClear(); });

const DATE_LOCAL = '2030-06-10T19:00';

describe('NewActivityButton', () => {
  it('abre el drawer, y en éxito 201 cierra y llama router.refresh()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ activity: { id: 'x' } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    ));
    render(<NewActivityButton />);

    // Sin drawer al inicio.
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Nueva actividad/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Recital' } });
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'concierto' } });
    fireEvent.change(screen.getByLabelText(/Lugar/), { target: { value: 'Sala 2' } });
    fireEvent.change(screen.getByLabelText(/Fecha y hora/), { target: { value: DATE_LOCAL } });
    fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear actividad/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull(); // se cerró
  });
});
