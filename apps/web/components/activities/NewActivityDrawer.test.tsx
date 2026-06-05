import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { NewActivityDrawer } from './NewActivityDrawer';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Fecha futura fija (evita el rechazo "no-pasada" del contrato). ISO esperado
// se computa igual que el componente → independiente de la zona horaria del CI.
const DATE_LOCAL = '2030-06-10T19:00';
const DATE_ISO = new Date(DATE_LOCAL).toISOString();

function mockFetch(status: number, body?: unknown) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const fn = vi.fn().mockResolvedValue(
    new Response(payload, { status, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderDrawer(over: Partial<React.ComponentProps<typeof NewActivityDrawer>> = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(<NewActivityDrawer open onClose={onClose} onCreated={onCreated} {...over} />);
  return { onClose, onCreated };
}

function fillValid() {
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Recital de prueba' } });
  fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'concierto' } });
  fireEvent.change(screen.getByLabelText(/Lugar/), { target: { value: 'Sala 2' } });
  fireEvent.change(screen.getByLabelText(/Fecha y hora/), { target: { value: DATE_LOCAL } });
  fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: '120' } });
}

// Cubre ambos estados del botón submit (idle "Crear actividad" / "Creando…").
const submitBtn = () => screen.getByRole('button', { name: /Crear actividad|Creando/ });
const submit = () => fireEvent.click(submitBtn());

describe('NewActivityDrawer', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });

  it('muestra los campos y el aviso de publicación inmediata', () => {
    renderDrawer();
    for (const re of [/Nombre/, /Tipo/, /Capacidad/, /Lugar/, /Fecha y hora/, /Cierre/, /Categoría/, /Descripción/]) {
      expect(screen.getByLabelText(re)).toBeInTheDocument();
    }
    expect(screen.getByText(/publica de inmediato/i)).toBeInTheDocument();
  });

  it('formulario inválido: no hace POST y muestra errores por campo', () => {
    const fetchFn = mockFetch(201, { activity: {} });
    renderDrawer();
    submit();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByText('Seleccioná un tipo')).toBeInTheDocument();
    expect(screen.getAllByText('Requerido').length).toBeGreaterThan(0);
  });

  it('convierte datetime-local a ISO y postea el body correcto al proxy', async () => {
    const fetchFn = mockFetch(201, { activity: { id: 'x' } });
    const { onCreated } = renderDrawer();
    fillValid();
    submit();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/app/actividades/api');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({
      name: 'Recital de prueba',
      type: 'concierto',
      location: 'Sala 2',
      date: DATE_ISO,
      capacity: 120, // número, no string
    });
    expect(typeof sent.capacity).toBe('number');
    expect(sent.date).toBe(DATE_ISO);
    // Decisiones lockeadas: NO se envían status ni imageUrl; endDate vacío se excluye.
    expect('status' in sent).toBe(false);
    expect('imageUrl' in sent).toBe(false);
    expect('endDate' in sent).toBe(false);
  });

  it('endDate presente se envía en ISO', async () => {
    const fetchFn = mockFetch(201, { activity: { id: 'x' } });
    const { onCreated } = renderDrawer();
    fillValid();
    const endLocal = '2030-06-11T22:00';
    fireEvent.change(screen.getByLabelText(/Cierre/), { target: { value: endLocal } });
    submit();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const sent = JSON.parse(fetchFn.mock.calls[0]![1].body as string);
    expect(sent.endDate).toBe(new Date(endLocal).toISOString());
  });

  it('400 con issues de Zod del server: los mapea por campo', async () => {
    mockFetch(400, { error: 'Datos inválidos.', issues: [{ path: ['name'], message: 'Nombre duplicado' }] });
    renderDrawer();
    fillValid();
    submit();
    expect(await screen.findByText('Nombre duplicado')).toBeInTheDocument();
  });

  it.each([
    [401, /sesión expiró/i],
    [403, /No tienes permisos para crear actividades\./],
    [502, /No pudimos crear la actividad/i],
  ])('status %i muestra mensaje de formulario', async (status, re) => {
    mockFetch(status, { error: 'x' });
    renderDrawer();
    fillValid();
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(re);
  });

  it('durante submitting no duplica el POST ni cierra el drawer', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchFn = vi.fn(() => new Promise<Response>((r) => { resolveFetch = r; }));
    vi.stubGlobal('fetch', fetchFn);
    const { onClose, onCreated } = renderDrawer();
    fillValid();
    submit();
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    submit(); // segundo intento mientras envía
    fireEvent.keyDown(document, { key: 'Escape' }); // intento de cierre
    expect(fetchFn).toHaveBeenCalledTimes(1); // sin duplicar
    expect(onClose).not.toHaveBeenCalled(); // no cerró

    resolveFetch(new Response(JSON.stringify({ activity: {} }), { status: 201, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('éxito 201: llama onCreated y resetea el formulario', async () => {
    mockFetch(201, { activity: { id: 'x' } });
    const { onCreated, onClose } = renderDrawer();
    fillValid();
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Recital de prueba');
    submit();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled(); // el éxito va por onCreated
    // El drawer sigue abierto (open=true) pero el form quedó reseteado.
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('');
  });

  it('Escape cierra (resetea) cuando NO está enviando', () => {
    const { onClose } = renderDrawer();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Flujo de portada: crear → subir, éxito parcial, reintento ────────────────
describe('NewActivityDrawer · portada (2 fases)', () => {
  beforeEach(() => {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:p';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
  });
  afterEach(() => vi.restoreAllMocks());

  const COVER_RE = /\/app\/actividades\/api\/.+\/cover$/;
  // fetch ruteado: distingue create (/app/actividades/api) de cover (.../:id/cover).
  function routedFetch(create: () => Promise<Response>, cover: () => Promise<Response>) {
    const fn = vi.fn((url: string, _init: RequestInit) => (COVER_RE.test(url) ? cover() : create()));
    vi.stubGlobal('fetch', fn);
    return fn;
  }
  const ok = (status: number, body?: unknown) =>
    new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  function pickCover() {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(32)], 'c.png', { type: 'image/png' })] } });
  }

  it('crear → subir portada: 201 + cover 200 → onCreated; cover POST al id correcto', async () => {
    const fn = routedFetch(() => Promise.resolve(ok(201, { activity: { id: 'A1' } })), () => Promise.resolve(ok(200, { activity: {} })));
    const { onCreated } = renderDrawer();
    fillValid();
    pickCover();
    submit();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const coverCall = fn.mock.calls.find((c) => COVER_RE.test(c[0] as string));
    expect(coverCall).toBeTruthy();
    expect(coverCall![0]).toBe('/app/actividades/api/A1/cover');
    expect(coverCall![1].method).toBe('POST');
    // body es FormData (no JSON) → el navegador pone el boundary; no se setea content-type.
    expect(coverCall![1].body).toBeInstanceOf(FormData);
    expect(coverCall![1].headers).toBeUndefined();
  });

  it('crear sin portada: no llama al endpoint de cover', async () => {
    const fn = routedFetch(() => Promise.resolve(ok(201, { activity: { id: 'A1' } })), () => Promise.resolve(ok(200)));
    const { onCreated } = renderDrawer();
    fillValid();
    submit();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(fn.mock.calls.some((c) => COVER_RE.test(c[0] as string))).toBe(false);
  });

  it('éxito parcial: cover falla → muestra mensaje + reintentar SOLO el upload', async () => {
    let coverCalls = 0;
    const fn = routedFetch(
      () => Promise.resolve(ok(201, { activity: { id: 'A1' } })),
      () => { coverCalls += 1; return Promise.resolve(coverCalls === 1 ? ok(500, { error: 'x' }) : ok(200, { activity: {} })); },
    );
    const { onCreated } = renderDrawer();
    fillValid();
    pickCover();
    submit();
    // mensaje de éxito parcial
    expect(await screen.findByText(/La actividad fue creada/)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    const createCalls = fn.mock.calls.filter((c) => !COVER_RE.test(c[0] as string)).length;
    // Reintentar portada
    fireEvent.click(screen.getByRole('button', { name: /Reintentar portada/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(coverCalls).toBe(2); // reintentó el upload
    // NO recreó la actividad (mismo número de create calls)
    expect(fn.mock.calls.filter((c) => !COVER_RE.test(c[0] as string)).length).toBe(createCalls);
  });

  it('finalizar sin portada: tras parcial, cierra/onCreated sin reintentar cover', async () => {
    let coverCalls = 0;
    routedFetch(
      () => Promise.resolve(ok(201, { activity: { id: 'A1' } })),
      () => { coverCalls += 1; return Promise.resolve(ok(500, { error: 'x' })); },
    );
    const { onCreated } = renderDrawer();
    fillValid();
    pickCover();
    submit();
    await screen.findByText(/La actividad fue creada/);
    fireEvent.click(screen.getByRole('button', { name: /Finalizar sin portada/ }));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(coverCalls).toBe(1); // no reintentó
  });

  it('doble submit durante creación: no duplica el POST de create', async () => {
    let resolveCreate!: (r: Response) => void;
    const fn = routedFetch(() => new Promise<Response>((r) => { resolveCreate = r; }), () => Promise.resolve(ok(200)));
    const { onCreated } = renderDrawer();
    fillValid();
    submit();
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    submit(); // segundo intento mientras crea
    expect(fn.mock.calls.filter((c) => !COVER_RE.test(c[0] as string)).length).toBe(1);
    resolveCreate(ok(201, { activity: { id: 'A1' } }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});
