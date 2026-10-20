import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { SalaAgenda } from './SalaAgenda';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const base = {
  id: 'b1', salaId: 's1', salaName: 'Sala VR', scheduledAt: '2030-01-15T15:00:00.000Z', colegio: 'Colegio Demo',
  kind: null, level: '5.º primaria', contactName: 'Prof. Eva', contactEmail: 'eva@colegio.do', contactPhone: '809-555-0101', studentCount: 12,
  status: 'confirmed', notes: 'Llegan en guagua', confirmedAt: null, notifiedAt: null, attendanceId: null,
};
const HISTORY = [
  { id: 'h1', action: 'created', at: '2030-01-02T14:00:00.000Z', actor: 'Marta', metadata: {} },
  { id: 'h2', action: 'confirmed', at: '2030-01-03T14:00:00.000Z', actor: 'Luis', metadata: {} },
  { id: 'h3', action: 'rescheduled', at: '2030-01-04T14:00:00.000Z', actor: null, metadata: { from: '2030-01-10T15:00:00.000Z', to: '2030-01-15T15:00:00.000Z' } },
];

/** fetch por URL: próximas, pasadas (from=), historial y el resto de las acciones. */
function mockApi(opts: { upcoming?: unknown[]; past?: unknown[]; history?: unknown[]; onWrite?: (url: string, init: RequestInit) => Response } = {}) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return opts.onWrite ? opts.onWrite(url, init) : J(200, { booking: base });
    if (url.includes('/history')) return J(200, { history: opts.history ?? HISTORY });
    if (url.includes('from=')) return J(200, { bookings: opts.past ?? [] });
    return J(200, { bookings: opts.upcoming ?? [base] });
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const openDetail = async (name: RegExp = /Ver reserva de Colegio Demo/) => {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'Detalle de la reserva' });
};

describe('SalaAgenda · detalle de la reserva (PUE-A04)', () => {
  it('abre el panel con grupo, fecha y hora en prosa, estado, contacto con tel:/mailto:, cantidad y notas', async () => {
    mockApi();
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    const dlg = await openDetail();
    expect(within(dlg).getByRole('heading', { name: 'Colegio Demo' })).toBeInTheDocument();
    expect(within(dlg).getByText(/^Martes, 15 de enero(?: de 2030)? · 11:00$/)).toBeInTheDocument();
    expect(within(dlg).getAllByText('Confirmada').length).toBeGreaterThan(0); // chip del estado (+ la fila del historial)
    expect(within(dlg).getByRole('link', { name: /809-555-0101/ })).toHaveAttribute('href', 'tel:8095550101');
    expect(within(dlg).getByRole('link', { name: /eva@colegio\.do/ })).toHaveAttribute('href', 'mailto:eva@colegio.do');
    expect(within(dlg).getByText('Llegan en guagua')).toBeInTheDocument();
    expect(within(dlg).getByText('12')).toBeInTheDocument();
  });

  it('el historial sale de /bookings/:id/history, en orden y con quién lo hizo', async () => {
    const f = mockApi();
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    const dlg = await openDetail();
    expect(await within(dlg).findByText('Reserva creada')).toBeInTheDocument();
    const items = within(dlg).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items[0]).toMatch(/Reserva creada.*Marta/);
    expect(items[1]).toMatch(/Confirmada.*Luis/);
    expect(items[2]).toMatch(/Reprogramada para.*automático/);
    expect(f).toHaveBeenCalledWith('/app/puerta/api/bookings/b1/history', expect.anything());
  });

  it('historial fallido → mensaje honesto, el resto del detalle sigue', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/history') ? J(500, {}) : url.includes('from=') ? J(200, { bookings: [] }) : J(200, { bookings: [base] }))));
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    const dlg = await openDetail();
    expect(await within(dlg).findByText('No pudimos cargar el historial.')).toBeInTheDocument();
    expect(within(dlg).getByText('Llegan en guagua')).toBeInTheDocument();
  });

  it.each([
    ['scheduled', ['Check-in', 'Confirmar', 'No vino', 'Reprogramar', 'Editar', 'Cancelar'], []],
    ['confirmed', ['Check-in', 'No vino', 'Reprogramar', 'Editar', 'Cancelar'], ['Confirmar']],
    ['no_show', ['Check-in', 'Reprogramar', 'Editar'], ['Confirmar', 'No vino', 'Cancelar']],
    ['attended', [], ['Check-in', 'Confirmar', 'No vino', 'Reprogramar', 'Editar', 'Cancelar']],
    ['cancelled', [], ['Check-in', 'Confirmar', 'No vino', 'Reprogramar', 'Editar', 'Cancelar']],
  ])('acciones al pie con la reserva %s', async (status, shown, hidden) => {
    mockApi({ upcoming: [{ ...base, status }] });
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    if (status === 'cancelled') fireEvent.click(await screen.findByRole('button', { name: /Mostrar canceladas/ }));
    const dlg = await openDetail();
    for (const n of shown) expect(within(dlg).getByRole('button', { name: n })).toBeInTheDocument();
    for (const n of hidden) expect(within(dlg).queryByRole('button', { name: n })).not.toBeInTheDocument();
  });

  it('Cancelar pide confirmación: "Volver" no llama al servidor; "Sí, cancelar reserva" sí', async () => {
    const f = mockApi();
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    const dlg = await openDetail();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    expect(within(dlg).getByRole('group', { name: 'Confirmar cancelación' })).toHaveTextContent('¿Cancelar la reserva de Colegio Demo?');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Volver' }));
    expect(f.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(false);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Sí, cancelar reserva' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Reserva cancelada.'));
    const call = f.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ action: 'cancel' });
  });

  it('avisa que se enviará un correo si la reserva ya estaba avisada', async () => {
    mockApi({ upcoming: [{ ...base, notifiedAt: '2030-01-03T14:00:00.000Z' }] });
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    const dlg = await openDetail();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    expect(within(dlg).getByRole('group', { name: 'Confirmar cancelación' })).toHaveTextContent('Se le enviará un correo al responsable.');
  });

  it('Editar manda solo los campos que cambiaron (PATCH action:edit)', async () => {
    const f = mockApi();
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    const dlg = await openDetail();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Editar' }));
    fireEvent.change(within(dlg).getByLabelText('Teléfono'), { target: { value: '829-555-9999' } });
    fireEvent.change(within(dlg).getByLabelText('Notas'), { target: { value: '' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados.'));
    const call = f.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ action: 'edit', edit: { contactPhone: '829-555-9999', notes: null } });
    await waitFor(() => expect(within(screen.getByRole('dialog')).queryByLabelText('Teléfono')).not.toBeInTheDocument());
  });

  it('Reprogramar usa fecha y hora separadas y manda el ISO local', async () => {
    const f = mockApi();
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    const dlg = await openDetail();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reprogramar' }));
    fireEvent.change(within(dlg).getByLabelText('Nueva fecha'), { target: { value: '2030-02-01' } });
    fireEvent.change(within(dlg).getByLabelText('Nueva hora'), { target: { value: '10:30' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Reserva reprogramada.'));
    const call = f.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
    expect(new Date(JSON.parse(String(call[1]!.body)).scheduledAt).toISOString()).toBe(new Date('2030-02-01T10:30').toISOString());
  });

  it('Escape cierra el detalle', async () => {
    mockApi();
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    await openDetail();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Detalle de la reserva' })).not.toBeInTheDocument());
  });

  it('los controles nuevos miden 44 px (también en tablet)', async () => {
    mockApi();
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    for (const n of [/^Próximas$/, /^Pendientes de cerrar/]) {
      const cls = (await screen.findByRole('button', { name: n })).className;
      expect(cls).toMatch(/min-h-11/);
      expect(cls).not.toMatch(/(sm|md):min-h-(8|9|10)\b/);
    }
    const dlg = await openDetail();
    for (const n of ['Check-in', 'No vino', 'Reprogramar', 'Editar', 'Cancelar']) {
      const cls = within(dlg).getByRole('button', { name: n }).className;
      expect(cls).toMatch(/min-h-11/);
      expect(cls).not.toMatch(/(sm|md):min-h-(8|9|10)\b/);
    }
  });
});

describe('SalaAgenda · Pendientes de cerrar', () => {
  const old = (over: object) => ({ ...base, scheduledAt: '2020-03-10T15:00:00.000Z', ...over });

  it('lista las reservas de días pasados sin desenlace (agendada/confirmada) y las cuenta en la pestaña', async () => {
    const f = mockApi({ past: [
      old({ id: 'p1', colegio: 'Colegio Ayer', status: 'confirmed' }),
      old({ id: 'p2', colegio: 'Escuela Vieja', status: 'scheduled' }),
      old({ id: 'p3', colegio: 'Ya Asistio', status: 'attended' }),
      old({ id: 'p4', colegio: 'Ya Cancelada', status: 'cancelled' }),
      old({ id: 'p5', colegio: 'No Vino SA', status: 'no_show' }),
    ] });
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    const tab = await screen.findByRole('button', { name: 'Pendientes de cerrar (2)' });
    fireEvent.click(tab);
    expect(screen.getByText(/Colegio Ayer/)).toBeInTheDocument();
    expect(screen.getByText(/Escuela Vieja/)).toBeInTheDocument();
    for (const n of ['Ya Asistio', 'Ya Cancelada', 'No Vino SA', 'Colegio Demo']) expect(screen.queryByText(new RegExp(n))).not.toBeInTheDocument();
    // La consulta pide un rango que termina hoy (to=) y empieza 60 días antes (from=).
    expect(f.mock.calls.some(([u]) => String(u).includes('from=') && String(u).includes('to=') && String(u).includes('salaId=s1'))).toBe(true);
  });

  it('desde Pendientes se puede cerrar con "No vino" en el detalle', async () => {
    const f = mockApi({ past: [old({ id: 'p1', colegio: 'Colegio Ayer', status: 'confirmed' })], onWrite: () => J(200, { booking: base }) });
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pendientes de cerrar (1)' }));
    const dlg = await openDetail(/Ver reserva de Colegio Ayer/);
    fireEvent.click(within(dlg).getByRole('button', { name: 'No vino' }));
    await waitFor(() => expect(f).toHaveBeenCalledWith('/app/puerta/api/bookings/p1/no-show', expect.objectContaining({ method: 'POST' })));
  });

  it('sin pendientes → "Todo al día"; la pestaña no muestra conteo', async () => {
    mockApi({ past: [] });
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    const tab = await screen.findByRole('button', { name: 'Pendientes de cerrar' });
    fireEvent.click(tab);
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
  });

  it('si falla la consulta de pasadas, la agenda de próximas sigue funcionando', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('from=') ? J(500, {}) : J(200, { bookings: [base] }))));
    render(<SalaAgenda salaId="s1" salaName="Sala VR" />);
    expect(await screen.findByText(/Colegio Demo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pendientes de cerrar' })).toBeInTheDocument();
  });
});
