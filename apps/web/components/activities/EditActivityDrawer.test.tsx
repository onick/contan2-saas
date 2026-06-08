import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EditActivityDrawer } from './EditActivityDrawer';
import type { Activity } from '../../lib/activities/demoData';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ACT: Activity = {
  id: 'A1', title: 'Concierto de prueba', category: 'Música', date: '10 jun 2030',
  startsAt: '2030-06-10T19:00:00.000Z', location: 'Sala 2', status: 'live', statusLabel: 'Activa',
  registered: 10, capacity: 100, occupancyPct: 10, type: 'concierto', statusRaw: 'activa',
};

// Detalle completo que devuelve el GET (incluye endDate + description reales).
const DETAIL = {
  id: 'A1', name: 'Concierto de prueba', type: 'concierto', location: 'Sala 2',
  date: '2030-06-10T19:00:00.000Z', endDate: null, capacity: 100, enrolledCount: 10,
  status: 'activa', description: 'Descripción real cargada', category: 'Música', imageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

// Mock por método: GET (sin method) → detalle; PATCH → respuesta del test.
function mockFetch(patch: { status: number; body?: unknown }, detail: { status: number; body?: unknown } = { status: 200, body: DETAIL }) {
  const fn = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
    if (init?.method === 'PATCH') {
      const payload = patch.body === undefined ? '{}' : JSON.stringify(patch.body);
      return Promise.resolve(new Response(payload, { status: patch.status, headers: { 'content-type': 'application/json' } }));
    }
    const payload = detail.body === undefined ? '{}' : JSON.stringify(detail.body);
    return Promise.resolve(new Response(payload, { status: detail.status, headers: { 'content-type': 'application/json' } }));
  });
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
// Settle de timer real (act-wrapped) → flushea la cadena de promesas del GET de
// detalle antes de consultar el form (más robusto que findBy para microtareas).
async function ready() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return screen.getByLabelText(/Nombre/);
}

describe('EditActivityDrawer · full-fidelity', () => {
  it('precarga full-fidelity desde el detalle (incluye description/endDate reales)', async () => {
    mockFetch({ status: 200 });
    renderDrawer();
    await ready();
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Concierto de prueba');
    expect((screen.getByLabelText(/Tipo/) as HTMLSelectElement).value).toBe('concierto');
    expect((screen.getByLabelText(/Capacidad/) as HTMLInputElement).value).toBe('100');
    expect((screen.getByLabelText(/Descripción/) as HTMLTextAreaElement).value).toBe('Descripción real cargada');
    expect((screen.getByLabelText(/Fecha y hora/) as HTMLInputElement).value).not.toBe('');
  });

  it('muestra loading mientras carga el detalle', () => {
    mockFetch({ status: 200 });
    renderDrawer();
    expect(screen.getByText(/Cargando actividad/i)).toBeInTheDocument();
  });

  it('si el detalle falla (404) → no permite editar: error + Reintentar, sin form', async () => {
    mockFetch({ status: 200 }, { status: 404, body: { error: 'x' } });
    renderDrawer();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/ya no existe/i));
    expect(screen.queryByLabelText(/Nombre/)).toBeNull();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar cambios/ })).toBeNull();
  });

  it('sin cambios: el botón Guardar está deshabilitado', async () => {
    mockFetch({ status: 200 });
    renderDrawer();
    await ready();
    expect(saveBtn()).toBeDisabled();
  });

  it('PATCH sólo con el campo modificado (capacity); sin campos prohibidos', async () => {
    const fetchFn = mockFetch({ status: 200, body: { activity: { id: 'A1' } } });
    const { onSaved } = renderDrawer();
    await ready();
    fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: '150' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const patchCall = fetchFn.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(patchCall[0]).toBe('/app/actividades/api/A1');
    const body = JSON.parse(patchCall[1].body);
    expect(body).toEqual({ capacity: 150 });
    for (const f of ['organizationId', 'enrolledCount', 'imageUrl', 'status']) expect(body).not.toHaveProperty(f);
  });

  it('convierte datetime-local a ISO al modificar la fecha', async () => {
    const fetchFn = mockFetch({ status: 200 });
    const { onSaved } = renderDrawer();
    await ready();
    fireEvent.change(screen.getByLabelText(/Fecha y hora/), { target: { value: '2031-01-01T10:00' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const patchCall = fetchFn.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(patchCall[1].body)).toEqual({ date: new Date('2031-01-01T10:00').toISOString() });
  });

  it('capacity < inscritos → 409: mensaje claro, sin onSaved, datos conservados', async () => {
    mockFetch({ status: 409, body: { error: 'La capacidad no puede ser menor que la cantidad de inscritos.' } });
    const { onSaved } = renderDrawer();
    await ready();
    fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: '5' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/capacidad no puede ser menor/i));
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Capacidad/) as HTMLInputElement).value).toBe('5');
  });

  it.each([[403, /No tenés permiso/i], [404, /ya no existe/i]])('error %i en PATCH muestra mensaje, sin onSaved', async (status, re) => {
    mockFetch({ status, body: { error: 'x' } });
    const { onSaved } = renderDrawer();
    await ready();
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Otro nombre' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(re));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('fallo de red en PATCH → 502 (mensaje), conserva datos', async () => {
    const fn = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve(new Response(JSON.stringify(DETAIL), { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fn);
    const { onSaved } = renderDrawer();
    await ready();
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Otro' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/red/i));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('anti doble-submit: dos clicks → un solo PATCH', async () => {
    let resolve!: (r: Response) => void;
    const fn = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') return new Promise<Response>((r) => { resolve = r; });
      return Promise.resolve(new Response(JSON.stringify(DETAIL), { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fn);
    renderDrawer();
    await ready();
    fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: '200' } });
    fireEvent.click(saveBtn());
    fireEvent.click(saveBtn());
    const patchCalls = () => fn.mock.calls.filter((c) => c[1]?.method === 'PATCH');
    expect(patchCalls()).toHaveLength(1);
    resolve(new Response('{}', { status: 200 }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
  });
});
