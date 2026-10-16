import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { VrAgenda } from './VrAgenda';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const booking = {
  id: 'b1', salaId: 's1', salaName: 'Sala VR', scheduledAt: '2030-01-15T15:00:00.000Z', colegio: 'Colegio Demo',
  kind: null, level: null, contactName: 'Prof', contactEmail: null, contactPhone: null, studentCount: 8,
  status: 'confirmed', notes: null, confirmedAt: null, notifiedAt: null, attendanceId: null,
};

describe('VrAgenda', () => {
  it('lista fallida → error con Reintentar, no "Sin reservas próximas"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(500, {})));
    render(<VrAgenda salaId="s1" salaName="Sala VR" />);
    expect(await screen.findByText('No pudimos cargar la agenda')).toBeInTheDocument();
    expect(screen.queryByText('Sin reservas próximas')).not.toBeInTheDocument();
  });

  it('lista 200 vacía → "Sin reservas próximas"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { bookings: [] })));
    render(<VrAgenda salaId="s1" salaName="Sala VR" />);
    expect(await screen.findByText('Sin reservas próximas')).toBeInTheDocument();
  });

  it('check-in con 409 → muestra el mensaje del servidor en un role=alert', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return J(409, { error: 'Esta reserva ya tiene check-in.' });
      return J(200, { bookings: [booking] });
    });
    vi.stubGlobal('fetch', f);
    render(<VrAgenda salaId="s1" salaName="Sala VR" />);
    fireEvent.click(await screen.findByRole('button', { name: /Check-in/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Esta reserva ya tiene check-in.');
  });

  it('acción con fetch rechazado → aviso de red, no falla en silencio', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') throw new Error('red');
      return J(200, { bookings: [{ ...booking, status: 'scheduled' }] });
    });
    vi.stubGlobal('fetch', f);
    render(<VrAgenda salaId="s1" salaName="Sala VR" />);
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/red/i));
  });

  it('acción exitosa → aviso role=status', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return J(200, { ok: true });
      return J(200, { bookings: [booking] });
    });
    vi.stubGlobal('fetch', f);
    render(<VrAgenda salaId="s1" salaName="Sala VR" />);
    fireEvent.click(await screen.findByRole('button', { name: /Check-in/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Check-in registrado.'));
  });
});
