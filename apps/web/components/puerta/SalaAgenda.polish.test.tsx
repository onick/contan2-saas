import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SalaAgenda } from './SalaAgenda';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const booking = {
  id: 'b1', salaId: 's1', salaName: 'Sala VR', scheduledAt: '2030-01-15T15:00:00.000Z', colegio: 'Colegio Demo',
  kind: null, level: null, contactName: 'Prof', contactEmail: null, contactPhone: null, studentCount: 8,
  status: 'confirmed', notes: null, confirmedAt: null, notifiedAt: null, attendanceId: null,
};
const cancelled = { ...booking, id: 'b2', colegio: 'Colegio Cancelado', status: 'cancelled' };

describe('SalaAgenda · pulido (PR-10)', () => {
  it('la hora se muestra en 24 h (America/Santo_Domingo), igual que "Reservas de hoy"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { bookings: [{ ...booking, scheduledAt: '2030-01-15T17:27:00.000Z' }] })));
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    // 17:27Z = 13:27 en Santo Domingo (UTC-4)
    expect(await screen.findByText('13:27')).toBeInTheDocument();
    expect(screen.queryByText(/p\. ?m\./i)).not.toBeInTheDocument();
  });

  it('las canceladas se ocultan por defecto y se muestran con el toggle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { bookings: [booking, cancelled] })));
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    expect(await screen.findByText('Colegio Demo')).toBeInTheDocument();
    expect(screen.queryByText('Colegio Cancelado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mostrar canceladas \(1\)/ }));
    expect(screen.getByText('Colegio Cancelado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ocultar canceladas/ }));
    expect(screen.queryByText('Colegio Cancelado')).not.toBeInTheDocument();
  });

  it('solo canceladas → "Sin reservas próximas" y el toggle disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { bookings: [cancelled] })));
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    expect(await screen.findByText('Sin reservas próximas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mostrar canceladas \(1\)/ })).toBeInTheDocument();
  });

  it('avisa (sin bloquear) si la cantidad supera el aforo de la sala', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { bookings: [] })));
    render(<SalaAgenda salaId="s1" salaName="Sala VR" aforo={8} />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Nueva reserva/ }))[0]!);
    expect(screen.queryByText(/Supera el aforo/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Cantidad de alumnos/), { target: { value: '40' } });
    expect(screen.getByRole('status')).toHaveTextContent('Supera el aforo de la sala (8). Se dividirá en turnos.');
    expect(screen.getByRole('button', { name: /Agendar/ })).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Cantidad de alumnos/), { target: { value: '8' } });
    expect(screen.queryByText(/Supera el aforo/)).not.toBeInTheDocument();
  });
});
