import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CheckinPage from './page';

// La consola (client) fetchea al montar; stub para que no rompa + estados honestos.
beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 502 }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('/app/check-in', () => {
  it('renderiza el encabezado y la consola real (sin demo)', () => {
    render(<CheckinPage />);
    expect(screen.getByRole('heading', { name: 'Check-in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo visitante/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Actividades activas/i })).toBeInTheDocument();
  });
});
