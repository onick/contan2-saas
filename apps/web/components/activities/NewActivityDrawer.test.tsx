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
