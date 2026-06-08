import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// useRouter mockeado para capturar router.refresh().
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

// optimizeCover mockeado (portada obligatoria): selección de portada → resultado listo.
vi.mock('../../lib/images/optimizeCover', async (orig) => {
  const a = await (orig() as Promise<Record<string, unknown>>);
  return { ...a, optimizeCover: vi.fn() };
});
import { optimizeCover, type OptimizeResult } from '../../lib/images/optimizeCover';
import { NewActivityButton } from './NewActivityButton';

const DATE_LOCAL = '2030-06-10T19:00';
const okResult = (): OptimizeResult => ({ blob: new Blob([new Uint8Array(8)], { type: 'image/webp' }), originalSize: 8_000_000, finalSize: 400_000, optimized: true, width: 1600, height: 900 });

beforeEach(() => {
  let n = 0;
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => `blob:c${n++}`);
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  vi.mocked(optimizeCover).mockResolvedValue(okResult());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); refresh.mockClear(); });

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('NewActivityButton', () => {
  it('abre el drawer; con portada + 201 cierra y llama router.refresh()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ activity: { id: 'x' } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    ));
    render(<NewActivityButton />);

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Nueva actividad/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Portada obligatoria: seleccionar + optimizar antes de poder crear.
    const input = [...document.querySelectorAll('input[type="file"]')].at(-1) as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(4)], 'x.png', { type: 'image/png' })], configurable: true });
    fireEvent.change(input);
    await settle();
    await screen.findByText(/Cambiar/);

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
