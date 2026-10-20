import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SalaAgenda } from './SalaAgenda';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Abre el "Detalle de la reserva" tocando la fila (en jsdom no hay xl: sale como hoja inferior).
const openDetail = async (name: RegExp = /Ver reserva de Colegio Demo/) => { fireEvent.click(await screen.findByRole('button', { name })); await screen.findByRole('dialog', { name: 'Detalle de la reserva' }); };

const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const base = {
  id: 'b1', salaId: 's1', salaName: 'Sala VR', scheduledAt: '2030-01-15T15:00:00.000Z', colegio: 'Colegio Demo',
  kind: null, level: null, contactName: 'Prof', contactEmail: 'p@c.do', contactPhone: null, studentCount: 8,
  status: 'confirmed', notes: null, confirmedAt: null, notifiedAt: null, attendanceId: null,
};

describe('SalaAgenda · estados (PUE-A03)', () => {
  it('"No vino" llama POST /no-show y confirma con aviso', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return J(200, { booking: { ...base, status: 'no_show' } });
      return J(200, { bookings: [base] });
    });
    vi.stubGlobal('fetch', f);
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'No vino' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Marcada como "No vino".'));
    expect(f).toHaveBeenCalledWith('/app/puerta/api/bookings/b1/no-show', expect.objectContaining({ method: 'POST' }));
  });

  it('Reprogramar: abre fecha+hora, guarda con PATCH reschedule y cierra el formulario', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return J(200, { booking: base });
      return J(200, { bookings: [base] });
    });
    vi.stubGlobal('fetch', f);
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Reprogramar' }));
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nueva fecha'), { target: { value: '2030-02-01' } });
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled(); // falta la hora
    fireEvent.change(screen.getByLabelText('Nueva hora'), { target: { value: '10:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Reserva reprogramada.'));
    const call = f.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
    const body = JSON.parse(String(call[1]!.body));
    expect(body.action).toBe('reschedule');
    expect(new Date(body.scheduledAt).toISOString()).toBe(new Date('2030-02-01T10:30').toISOString());
    await waitFor(() => expect(screen.queryByLabelText('Nueva fecha')).not.toBeInTheDocument());
  });

  it('409 legible en alerta; si pide force (otro día) ofrece "Registrar igual hoy" y reintenta con force:true', async () => {
    let posts = 0;
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts += 1;
        return posts === 1
          ? J(409, { error: 'La reserva es del martes, 15 de enero. ¿Registrar la entrada igual hoy?', requiresForce: true })
          : J(201, { booking: { ...base, status: 'attended' }, partySize: 9 });
      }
      return J(200, { bookings: [base] });
    });
    vi.stubGlobal('fetch', f);
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    fireEvent.click(await screen.findByRole('button', { name: /Check-in/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La reserva es del martes, 15 de enero.');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar igual hoy' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Check-in registrado.'));
    const second = f.mock.calls.filter(([, i]) => i?.method === 'POST')[1]!;
    expect(JSON.parse(String(second[1]!.body))).toEqual({ force: true });
  });

  it('409 de transición inválida (sin force) → solo el mensaje, sin botón de forzar', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return J(409, { error: 'No se puede marcar como "No vino" esta reserva: ya está con asistencia registrada.' });
      return J(200, { bookings: [base] });
    });
    vi.stubGlobal('fetch', f);
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'No vino' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya está con asistencia registrada');
    expect(screen.queryByRole('button', { name: 'Registrar igual hoy' })).not.toBeInTheDocument();
  });

  it('acciones por estado: No vino llega tarde (check-in + reprogramar, sin cancelar); asistió/cancelada sin acciones', async () => {
    const list = [
      { ...base, id: 'n1', colegio: 'Tarde SA', status: 'no_show' },
      { ...base, id: 'a1', colegio: 'Asistio SA', status: 'attended' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { bookings: list })));
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    await screen.findByText('Tarde SA');
    // En la fila: atajo de Check-in solo para la que aún admite entrada (No vino llega tarde).
    expect(screen.getAllByRole('button', { name: /Check-in/ })).toHaveLength(1);
    await openDetail(/Ver reserva de Tarde SA/);
    expect(screen.getByRole('button', { name: 'Reprogramar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'No vino' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('muestra "no se pudo enviar el correo" y "reprogramada" en la línea de la reserva', async () => {
    const b = { ...base, emailError: 'resend caído', rescheduledFrom: '2030-01-10T15:00:00.000Z' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { bookings: [b] })));
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    expect(await screen.findByText(/no se pudo enviar el correo/)).toBeInTheDocument();
    expect(screen.getByText(/reprogramada/)).toBeInTheDocument();
  });
});
