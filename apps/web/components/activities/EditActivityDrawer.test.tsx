import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EditActivityDrawer } from './EditActivityDrawer';
import type { Activity } from '../../lib/activities/demoData';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ACT: Activity = {
  id: 'A1', title: 'Concierto de prueba', category: 'Música', date: '10 jun 2030',
  startsAt: '2030-06-10T19:00:00.000Z', location: 'Sala 2', status: 'live', statusLabel: 'Activa',
  registered: 10, capacity: 100, occupancyPct: 10, type: 'concierto', statusRaw: 'activa',
};

function mockFetch(status: number, body?: unknown) {
  const payload = body === undefined ? '{}' : JSON.stringify(body);
  const fn = vi.fn().mockResolvedValue(new Response(payload, { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderDrawer(over: Partial<React.ComponentProps<typeof EditActivityDrawer>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<EditActivityDrawer activity={ACT} onClose={onClose} onSaved={onSaved} {...over} />);
  return { onClose, onSaved };
}

const saveBtn = () => screen.getByRole('button', { name: /Guardar cambios|Guardando/ });

describe('EditActivityDrawer', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });

  it('precarga los campos reales del listado', () => {
    renderDrawer();
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Concierto de prueba');
    expect((screen.getByLabelText(/Tipo/) as HTMLSelectElement).value).toBe('concierto');
    expect((screen.getByLabelText(/Lugar/) as HTMLInputElement).value).toBe('Sala 2');
    expect((screen.getByLabelText(/Capacidad/) as HTMLInputElement).value).toBe('100');
    expect((screen.getByLabelText(/Fecha y hora/) as HTMLInputElement).value).not.toBe('');
  });

  it('sin cambios: el botón Guardar está deshabilitado', () => {
    renderDrawer();
    expect(saveBtn()).toBeDisabled();
  });

  it('PATCH sólo con el campo modificado (capacity); sin campos prohibidos', async () => {
    const fetchFn = mockFetch(200, { activity: { id: 'A1' } });
    const { onSaved } = renderDrawer();
    fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: '150' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/app/actividades/api/A1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(body).toEqual({ capacity: 150 });
    for (const forbidden of ['organizationId', 'enrolledCount', 'imageUrl', 'status']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('convierte datetime-local a ISO al modificar la fecha', async () => {
    const fetchFn = mockFetch(200, {});
    const { onSaved } = renderDrawer();
    fireEvent.change(screen.getByLabelText(/Fecha y hora/), { target: { value: '2031-01-01T10:00' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const body = JSON.parse(fetchFn.mock.calls[0]![1].body);
    expect(body).toEqual({ date: new Date('2031-01-01T10:00').toISOString() });
  });

  it('capacity < inscritos → 409: mensaje claro, sin onSaved, datos conservados', async () => {
    mockFetch(409, { error: 'La capacidad no puede ser menor que la cantidad de inscritos.' });
    const { onSaved } = renderDrawer();
    fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: '5' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/capacidad no puede ser menor/i));
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Capacidad/) as HTMLInputElement).value).toBe('5'); // preservado
  });

  it.each([
    [403, /No tenés permiso/i],
    [404, /ya no existe/i],
  ])('error %i muestra mensaje y no llama onSaved', async (status, re) => {
    mockFetch(status, { error: 'x' });
    const { onSaved } = renderDrawer();
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Otro nombre' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(re));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('fallo de red → 502 (mensaje), conserva datos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { onSaved } = renderDrawer();
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Otro' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/red/i));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('anti doble-submit: dos clicks → un solo PATCH', async () => {
    let resolve!: (r: Response) => void;
    const fetchFn = vi.fn().mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal('fetch', fetchFn);
    renderDrawer();
    fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: '200' } });
    fireEvent.click(saveBtn());
    fireEvent.click(saveBtn());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    resolve(new Response('{}', { status: 200 }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
  });
});
