import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { NewActivityDrawer } from './NewActivityDrawer';
import { optimizeCover, OptimizeError, type OptimizeResult } from '../../lib/images/optimizeCover';

// optimizeCover mockeado (la lógica real se prueba en optimizeCover.test.ts).
vi.mock('../../lib/images/optimizeCover', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, optimizeCover: vi.fn() };
});

const DATE_LOCAL = '2030-06-10T19:00';
const DATE_ISO = new Date(DATE_LOCAL).toISOString();

const okResult = (optimized = true): OptimizeResult => ({
  // Blob REAL (chico) para que FormData.append funcione; los tamaños mostrados
  // son los números originalSize/finalSize, no el tamaño del blob.
  blob: new Blob([new Uint8Array(8)], { type: 'image/webp' }),
  originalSize: optimized ? 8_000_000 : 400_000, finalSize: 400_000, optimized, width: 1600, height: 900,
});

let revoked: string[] = [];
beforeEach(() => {
  revoked = [];
  let urlN = 0;
  // jsdom no trae createObjectURL/revoke → los stubeamos. URLs distintas por llamada
  // para que el reemplazo de portada revoque la anterior.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => `blob:cover${urlN++}`);
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn((u: string) => revoked.push(u));
  vi.mocked(optimizeCover).mockResolvedValue(okResult());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(body === undefined ? '{}' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}
function renderDrawer(over: Partial<React.ComponentProps<typeof NewActivityDrawer>> = {}) {
  const onClose = vi.fn(); const onCreated = vi.fn();
  const utils = render(<NewActivityDrawer open onClose={onClose} onCreated={onCreated} {...over} />);
  return { onClose, onCreated, ...utils };
}
// El input vive en el portal (document.body); tomamos el último montado.
const fileInput = () => [...document.querySelectorAll('input[type="file"]')].at(-1) as HTMLInputElement;
// Settle de timer real (act) → flushea la promesa de optimizeCover tras el change.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
// jsdom no permite setear input.files vía target → se define la propiedad.
const setFile = (type = 'image/png', name = 'x.png') => {
  const input = fileInput();
  Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(4)], name, { type })], configurable: true });
  fireEvent.change(input);
};
const selectCover = async (type = 'image/png') => {
  setFile(type);
  await settle();
  await screen.findByText(/Cambiar/);
};
function fillFields() {
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Recital con portada' } });
  fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'concierto' } });
  fireEvent.change(screen.getByLabelText(/Lugar/), { target: { value: 'Sala 2' } });
  fireEvent.change(screen.getByLabelText(/Fecha y hora/), { target: { value: DATE_LOCAL } });
  fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: '120' } });
}
const createBtn = () => screen.getByRole('button', { name: /Crear actividad|Creando/ });

describe('NewActivityDrawer · portada obligatoria', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });

  it('la PORTADA aparece primero (antes de Nombre)', () => {
    renderDrawer();
    const cover = screen.getByText(/Arrastrá una imagen/);
    const nombre = screen.getByLabelText(/Nombre/);
    // cover precede a Nombre en el DOM.
    expect(cover.compareDocumentPosition(nombre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/se optimizan automáticamente/i)).toBeInTheDocument();
  });

  it('Crear está deshabilitado sin portada', () => {
    renderDrawer();
    expect(createBtn()).toBeDisabled();
  });

  it('con portada lista, muestra preview + mensaje de optimización + tamaños', async () => {
    renderDrawer();
    await selectCover();
    expect(screen.getByText(/Imagen optimizada con calidad visual alta/i)).toBeInTheDocument();
    expect(screen.getByText(/Original .* → optimizada/i)).toBeInTheDocument();
    expect(createBtn()).not.toBeDisabled();
  });

  it('submit usa EXCLUSIVAMENTE /activities/with-cover (no legacy ni /cover) con FormData', async () => {
    const fetchFn = mockFetch(201, { activity: { id: 'A1' } });
    const { onCreated } = renderDrawer();
    await selectCover();
    fillFields();
    fireEvent.click(createBtn());
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/app/actividades/api/with-cover');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    expect(fd.get('name')).toBe('Recital con portada');
    expect(fd.get('date')).toBe(DATE_ISO);
    expect(fd.get('capacity')).toBe('120');
    expect(fd.get('cover')).toBeTruthy();
    // No tocó el endpoint legacy ni el de reemplazo.
    for (const c of fetchFn.mock.calls) { expect(c[0]).not.toBe('/app/actividades/api'); expect(String(c[0])).not.toMatch(/\/cover$/); }
  });

  it('tipo/dimensiones peligrosas → error de portada, conserva el formulario', async () => {
    vi.mocked(optimizeCover).mockRejectedValueOnce(new OptimizeError('bad_type', 'Formato no permitido. Usá JPEG, PNG o WebP.'));
    renderDrawer();
    fillFields();
    setFile('image/gif', 'x.gif');
    await settle();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Formato no permitido/i));
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Recital con portada'); // preservado
    expect(createBtn()).toBeDisabled();
  });

  it.each([[401, /sesión expiró/i], [403, /permiso/i], [502, /red/i]])('error %i del server → mensaje, sin onCreated', async (status, re) => {
    mockFetch(status); // sin body → mensajes fijos del cliente (incluye 502 → "red")
    const { onCreated } = renderDrawer();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(re));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it.each([[413, /5 MB/i], [415, /no permitido/i]])('error %i → mensaje en la portada', async (status) => {
    mockFetch(status, { error: status === 413 ? 'La imagen supera el máximo de 5 MB.' : 'Formato no permitido.' });
    renderDrawer();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  });

  it('anti doble-submit: dos clicks → un solo POST', async () => {
    let resolve!: (r: Response) => void;
    const fetchFn = vi.fn().mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal('fetch', fetchFn);
    renderDrawer();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    fireEvent.click(createBtn());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    resolve(new Response('{}', { status: 201 }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
  });

  it('éxito (201) cierra/resetea/refresca (onCreated)', async () => {
    mockFetch(201, { activity: { id: 'A1' } });
    const { onCreated } = renderDrawer();
    await selectCover(); fillFields();
    fireEvent.click(createBtn());
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('libera el object URL al cambiar de portada / cerrar (revokeObjectURL)', async () => {
    renderDrawer();
    await selectCover();
    expect((URL.createObjectURL as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    await selectCover(); // reemplaza → revoca el anterior
    expect(revoked.length).toBeGreaterThan(0); // se revocó el object URL previo
  });

  it('submit en vuelo (busy) bloquea el cierre: ni Cancelar ni Escape cierran', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => {}))); // cuelga → busy
    const { onClose } = renderDrawer();
    await selectCover(); fillFields();
    fireEvent.click(createBtn()); // entra en busy (Creando…)
    expect(screen.getByRole('button', { name: /Creando/ })).toBeDisabled();
    // Cancelar y Escape NO cierran mientras está enviando.
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.drawer-panel')).toBeInTheDocument(); // sigue montado
  });
});
