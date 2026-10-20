import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { ActivityDetail } from '@contan2/contracts';
import { ActivityForm } from './ActivityForm';
import { optimizeCover, OptimizeError, type OptimizeResult } from '../../lib/images/optimizeCover';

// optimizeCover mockeado (la lógica real se prueba en optimizeCover.test.ts).
vi.mock('../../lib/images/optimizeCover', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, optimizeCover: vi.fn() };
});

const DATE_LOCAL = '2030-06-10T19:00';
// El campo de fecha es tipeable (d/m/yyyy H:mm) y parsea al perder el foco.
const typeDate = (label: string, text: string) => {
  const el = screen.getByLabelText(label);
  fireEvent.change(el, { target: { value: text } });
  fireEvent.blur(el);
};
const DATE_ISO = new Date(DATE_LOCAL).toISOString();

const okResult = (optimized = true): OptimizeResult => ({
  blob: new Blob([new Uint8Array(8)], { type: 'image/webp' }),
  originalSize: optimized ? 8_000_000 : 400_000, finalSize: 400_000, optimized, width: 1600, height: 900,
});

const DETAIL = {
  id: 'A1', name: 'Concierto de prueba', type: 'concierto', location: 'Sala 2',
  date: '2030-06-10T19:00:00.000Z', endDate: null, capacity: 100, enrolledCount: 10,
  status: 'activa', description: 'Descripción real cargada', category: 'Música', imageUrl: null, imagePosY: null, audience: 'adultos',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as ActivityDetail;

let revoked: string[] = [];
beforeEach(() => {
  revoked = [];
  let urlN = 0;
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => `blob:cover${urlN++}`);
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn((u: string) => revoked.push(u));
  vi.mocked(optimizeCover).mockResolvedValue(okResult());
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn().mockImplementation(() => Promise.resolve(new Response(body === undefined ? '{}' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })));
  vi.stubGlobal('fetch', fn);
  return fn;
}
function renderForm(over: Partial<React.ComponentProps<typeof ActivityForm>> = {}) {
  const onSaved = vi.fn(); const onCancel = vi.fn();
  const utils = render(<ActivityForm mode="create" onSaved={onSaved} onCancel={onCancel} {...over} />);
  return { onSaved, onCancel, ...utils };
}
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const setFile = (type = 'image/png', name = 'x.png') => {
  const input = fileInput();
  Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(4)], name, { type })], configurable: true });
  fireEvent.change(input);
};
const selectCover = async (type = 'image/png') => {
  setFile(type);
  await settle();
  await screen.findByRole('button', { name: /Cambiar imagen/ });
};
function fillFields() {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Recital con portada' } });
  fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'concierto' } });
  fireEvent.change(screen.getByLabelText('Lugar'), { target: { value: 'Sala 2' } });
  typeDate('Fecha y hora', '10/6/2030 19:00');
  fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '120' } });
}
const createBtn = () => screen.getByRole('button', { name: /Crear actividad|Creando/ });
const saveBtn = () => screen.getByRole('button', { name: /Guardar cambios|Guardando/ });
const live = () => document.querySelector('[data-testid="form-status"]') as HTMLElement;

describe('ActivityForm · crear · estructura y accesibilidad', () => {
  it('etiqueta cada campo por su nombre (sin asterisco en el nombre accesible)', () => {
    renderForm();
    for (const l of ['Nombre', 'Tipo', 'Capacidad', 'Descripción', 'Lugar', 'Fecha y hora', 'Cierre', 'Programa / ciclo']) {
      expect(screen.getByLabelText(l)).toBeInTheDocument();
    }
    expect(screen.getByRole('radiogroup', { name: 'Público' })).toBeInTheDocument();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).required).toBe(true);
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-required', 'true');
  });

  it('fecha tipeada (24 h y 12 h) se muestra formateada y se envía como ISO; Cierre admite texto', async () => {
    const fetchFn = mockFetch(201, { activity: { id: 'A1' } });
    renderForm();
    await selectCover(); fillFields();
    expect((screen.getByLabelText('Fecha y hora') as HTMLInputElement).value).toBe('10/6/2030, 7:00 p. m.');
    typeDate('Cierre', '10/6/2030 9:30 p. m.');
    expect((screen.getByLabelText('Cierre') as HTMLInputElement).value).toBe('10/6/2030, 9:30 p. m.');
    fireEvent.click(createBtn());
    await waitFor(() => expect(fetchFn.mock.calls.some((c) => c[0] === '/app/actividades/api/with-cover')).toBe(true));
    const fd = fetchFn.mock.calls.find((c) => c[0] === '/app/actividades/api/with-cover')![1].body as FormData;
    expect(fd.get('date')).toBe(new Date('2030-06-10T19:00').toISOString());
    expect(fd.get('endDate')).toBe(new Date('2030-06-10T21:30').toISOString());
  });

  it('Público: Adultos por defecto; cambiar a Infantil viaja en el submit', async () => {
    const fetchFn = mockFetch(201, { activity: { id: 'A1' } });
    renderForm();
    expect(screen.getByRole('radio', { name: 'Adultos' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Infantil' }));
    expect(screen.getByRole('radio', { name: 'Infantil' })).toBeChecked();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    await waitFor(() => expect(fetchFn.mock.calls.some((c) => c[0] === '/app/actividades/api/with-cover')).toBe(true));
    const fd = fetchFn.mock.calls.find((c) => c[0] === '/app/actividades/api/with-cover')![1].body as FormData;
    expect(fd.get('audience')).toBe('infantil');
  });
});

describe('ActivityForm · crear · portada obligatoria y barra', () => {
  it('sin nada: aria-disabled, enfocable, y la barra lista lo que falta', () => {
    renderForm();
    expect(createBtn()).toHaveAttribute('aria-disabled', 'true');
    expect(createBtn()).not.toBeDisabled();
    expect(live()).toHaveTextContent(/Faltan 6 campos obligatorios/);
    expect(live()).toHaveTextContent(/Nombre, tipo, capacidad, lugar, fecha y hora y portada\./);
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('con los campos completos pero sin portada: "Solo falta la portada"', () => {
    renderForm();
    fillFields();
    expect(live()).toHaveTextContent('Solo falta la portada');
    expect(live()).toHaveTextContent('Añade una imagen para habilitar la creación.');
    expect(createBtn()).toHaveAttribute('aria-disabled', 'true');
  });

  it('con portada y campos: "Todo listo para crear", portada "Lista" y botón habilitado', async () => {
    renderForm();
    await selectCover(); fillFields();
    expect(live()).toHaveTextContent('Todo listo para crear');
    expect(screen.getByText('Lista')).toBeInTheDocument();
    expect(createBtn()).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText(/Optimizada · original/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quitar/ })).toBeInTheDocument();
  });

  it('Quitar vuelve al estado vacío (Pendiente) y revoca el preview', async () => {
    renderForm();
    await selectCover();
    fireEvent.click(screen.getByRole('button', { name: /Quitar/ }));
    expect(screen.getByText('Arrastra tu imagen aquí')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(revoked.length).toBeGreaterThan(0);
  });

  it('clic con datos incompletos: no envía, muestra errores inline y enfoca el primer campo', () => {
    const fetchFn = mockFetch(201);
    renderForm();
    fireEvent.click(createBtn());
    expect(fetchFn.mock.calls.filter((c) => c[0] === '/app/actividades/api/with-cover')).toHaveLength(0);
    expect(screen.getByText('Selecciona un tipo')).toBeInTheDocument();
    expect(screen.getAllByText('Requerido').length).toBeGreaterThan(0);
    const name = screen.getByLabelText('Nombre');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(name);
    expect(screen.getByRole('alert')).toHaveTextContent(/portada es obligatoria/i);
  });

  it('submit usa EXCLUSIVAMENTE with-cover con FormData', async () => {
    const fetchFn = mockFetch(201, { activity: { id: 'A1' } });
    const { onSaved } = renderForm();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('A1'));
    const submitCalls = fetchFn.mock.calls.filter((c) => c[0] === '/app/actividades/api/with-cover');
    expect(submitCalls).toHaveLength(1);
    const [, init] = submitCalls[0]!;
    expect(init.method).toBe('POST');
    const fd = init.body as FormData;
    expect(fd.get('name')).toBe('Recital con portada');
    expect(fd.get('date')).toBe(DATE_ISO);
    expect(fd.get('capacity')).toBe('120');
    expect(fd.get('cover')).toBeTruthy();
    for (const c of fetchFn.mock.calls) { expect(c[0]).not.toBe('/app/actividades/api'); expect(String(c[0])).not.toMatch(/\/cover$/); }
  });

  it('formato peligroso → error de portada, conserva el formulario', async () => {
    vi.mocked(optimizeCover).mockRejectedValueOnce(new OptimizeError('bad_type', 'Formato no permitido. Usa JPEG, PNG o WebP.'));
    renderForm();
    fillFields();
    setFile('image/gif', 'x.gif');
    await settle();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Formato no permitido/i));
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Recital con portada');
    expect(createBtn()).toHaveAttribute('aria-disabled', 'true');
  });

  it.each([[401, /sesión expiró/i], [403, /permiso/i], [502, /red/i]])('error %i del server → mensaje, sin onSaved', async (status, re) => {
    mockFetch(status);
    const { onSaved } = renderForm();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(re));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each([[413, /5 MB/i], [415, /no permitido/i]])('error %i → mensaje en la portada', async (status, re) => {
    mockFetch(status, { error: status === 413 ? 'La imagen supera el máximo de 5 MB.' : 'Formato no permitido.' });
    renderForm();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(re));
  });

  it('anti doble-submit: dos clicks → un solo POST', async () => {
    let resolve!: (r: Response) => void;
    const fetchFn = vi.fn().mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal('fetch', fetchFn);
    renderForm();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    fireEvent.click(createBtn());
    const submitCalls = () => fetchFn.mock.calls.filter((c) => c[0] === '/app/actividades/api/with-cover');
    expect(submitCalls()).toHaveLength(1);
    resolve(new Response('{}', { status: 201 }));
    await waitFor(() => expect(submitCalls()).toHaveLength(1));
  });

  it('libera el object URL al reemplazar la portada', async () => {
    renderForm();
    await selectCover();
    expect((URL.createObjectURL as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    await selectCover();
    expect(revoked.length).toBeGreaterThan(0);
  });

  it('submit en vuelo: Cancelar deshabilitado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => {})));
    const { onCancel } = renderForm();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    expect(screen.getByRole('button', { name: /Creando/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Cancelar llama onCancel', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('ActivityForm · editar', () => {
  const renderEdit = (detail: ActivityDetail = DETAIL) => renderForm({ mode: 'edit', initial: detail });

  it('precarga los valores reales y muestra el estado actual', () => {
    renderEdit();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Concierto de prueba');
    expect((screen.getByLabelText('Tipo') as HTMLSelectElement).value).toBe('concierto');
    expect((screen.getByLabelText('Capacidad') as HTMLInputElement).value).toBe('100');
    expect((screen.getByLabelText('Descripción') as HTMLTextAreaElement).value).toBe('Descripción real cargada');
    expect(screen.getByText('Estado actual')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Publicación' })).toBeInTheDocument();
  });

  it('sin cambios: Guardar en aria-disabled y la barra lo dice', () => {
    renderEdit();
    expect(saveBtn()).toHaveAttribute('aria-disabled', 'true');
    expect(live()).toHaveTextContent('Sin cambios por guardar');
  });

  it('PATCH sólo con el campo modificado; sin campos prohibidos', async () => {
    const fetchFn = mockFetch(200, { activity: { id: 'A1' } });
    const { onSaved } = renderEdit();
    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '150' } });
    expect(live()).toHaveTextContent('Todo listo para guardar');
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('A1'));
    const patchCall = fetchFn.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(patchCall[0]).toBe('/app/actividades/api/A1');
    const body = JSON.parse(patchCall[1].body);
    expect(body).toEqual({ capacity: 150 });
    for (const f of ['organizationId', 'enrolledCount', 'imageUrl', 'status']) expect(body).not.toHaveProperty(f);
  });

  it('convierte datetime-local a ISO al modificar la fecha', async () => {
    const fetchFn = mockFetch(200);
    const { onSaved } = renderEdit();
    typeDate('Fecha y hora', '1/1/2031 10:00');
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const patchCall = fetchFn.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(patchCall[1].body)).toEqual({ date: new Date('2031-01-01T10:00').toISOString() });
  });

  it('vaciar un obligatorio: no envía, error inline y foco en el campo', () => {
    const fetchFn = mockFetch(200);
    renderEdit();
    fireEvent.change(screen.getByLabelText('Lugar'), { target: { value: '' } });
    expect(live()).toHaveTextContent(/Falta 1 campo obligatorio/);
    expect(live()).toHaveTextContent(/Lugar\./);
    fireEvent.click(saveBtn());
    expect(fetchFn.mock.calls.filter((c) => c[1]?.method === 'PATCH')).toHaveLength(0);
    expect(screen.getByLabelText('Lugar')).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(screen.getByLabelText('Lugar'));
  });

  it('409 por capacidad: mensaje claro, sin onSaved, datos conservados', async () => {
    mockFetch(409, { error: 'La capacidad no puede ser menor que la cantidad de inscritos.' });
    const { onSaved } = renderEdit();
    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '5' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/capacidad no puede ser menor/i));
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Capacidad') as HTMLInputElement).value).toBe('5');
  });

  it.each([[403, /No tienes permiso/i], [404, /ya no existe/i]])('error %i en PATCH muestra mensaje, sin onSaved', async (status, re) => {
    mockFetch(status, { error: 'x' });
    const { onSaved } = renderEdit();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otro nombre' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(re));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('anti doble-submit: dos clicks → un solo PATCH', async () => {
    let resolve!: (r: Response) => void;
    const fn = vi.fn().mockImplementation(() => new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal('fetch', fn);
    renderEdit();
    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '200' } });
    fireEvent.click(saveBtn());
    fireEvent.click(saveBtn());
    const patchCalls = () => fn.mock.calls.filter((c) => c[1]?.method === 'PATCH');
    expect(patchCalls()).toHaveLength(1);
    resolve(new Response('{}', { status: 200 }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
  });

  it('sin portada: dropzone vacío (Sin portada); con portada: reencuadre + Cambiar imagen, sin Quitar', () => {
    renderEdit();
    expect(screen.getByText(/no tiene portada/i)).toBeInTheDocument();
    expect(screen.getByText('Sin portada')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).toBeNull();

    cleanup();
    renderEdit({ ...DETAIL, imageUrl: '/uploads/x.webp', imagePosY: 30 } as ActivityDetail);
    expect(screen.getByAltText(/Vista previa de la portada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cambiar imagen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull();
    expect(screen.getByText('Lista')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '30');
  });

  it('portada nueva: sube primero a /cover y luego PATCH sólo con lo modificado', async () => {
    const fetchFn = mockFetch(200, { activity: { id: 'A1' } });
    const { onSaved } = renderEdit({ ...DETAIL, imageUrl: '/uploads/x.webp' } as ActivityDetail);
    await selectCover();
    fireEvent.change(screen.getByLabelText('Lugar'), { target: { value: 'Sala 9' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const urls = fetchFn.mock.calls.map((c) => `${c[1]?.method ?? 'GET'} ${c[0]}`).filter((u) => u.includes('/api/A1'));
    expect(urls).toEqual(['POST /app/actividades/api/A1/cover', 'PATCH /app/actividades/api/A1']);
  });

  it('ajustar el encuadre habilita Guardar y el PATCH lleva sólo imagePosY', async () => {
    const fetchFn = mockFetch(200);
    const { onSaved } = renderEdit({ ...DETAIL, imageUrl: '/uploads/x.webp', imagePosY: null } as ActivityDetail);
    expect(saveBtn()).toHaveAttribute('aria-disabled', 'true');
    const box = screen.getByRole('slider');
    const img = screen.getByAltText(/Vista previa de la portada/) as HTMLImageElement;
    Object.defineProperty(box, 'clientWidth', { value: 640, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: 360, configurable: true });
    Object.defineProperty(img, 'naturalWidth', { value: 1600, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 2400, configurable: true });
    fireEvent.load(img);
    for (let i = 0; i < 15; i++) fireEvent.keyDown(box, { key: 'ArrowDown' }); // 50 → 80
    expect(saveBtn()).not.toHaveAttribute('aria-disabled');
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const patchCall = fetchFn.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(patchCall[1].body)).toEqual({ imagePosY: 80 });
  });
});
