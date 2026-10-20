import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PuertaBoard } from './PuertaBoard';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('PuertaBoard · error ≠ vacío', () => {
  it('API 500 → estado de error con Reintentar (no "No hay salas permanentes")', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(500, { error: 'boom' })));
    render(<PuertaBoard initial={[]} />);
    expect(await screen.findByText('No pudimos cargar las salas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('No hay salas permanentes')).not.toBeInTheDocument();
  });

  it('fetch rechazado → estado de error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('red')));
    render(<PuertaBoard initial={[]} />);
    expect(await screen.findByText('No pudimos cargar las salas')).toBeInTheDocument();
  });

  it('403 → "sin permiso", sin Reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(403, { error: 'x' })));
    render(<PuertaBoard initial={[]} />);
    expect(await screen.findByText('No tienes permiso para ver las salas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('200 con lista vacía → sí muestra el vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { salas: [] })));
    render(<PuertaBoard initial={[]} />);
    expect(await screen.findByText('No hay salas permanentes')).toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar las salas')).not.toBeInTheDocument();
  });

  it('Reintentar vuelve a consultar y se recupera', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(J(500, {}))
      .mockResolvedValue(J(200, { salas: [] }));
    vi.stubGlobal('fetch', f);
    render(<PuertaBoard initial={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('No hay salas permanentes')).toBeInTheDocument());
  });
});

// ── PR-P2 · registrar idempotente, Deshacer y aviso de reentrada ──────────────
const SALA = { id: 's1', name: 'Ada Balcácer', type: 'otro', audience: 'adultos', aforo: null, kind: 'exposicion', hasAgenda: false, occupancy: 0, visitorsToday: 0, visitorsWeek: 0, todayBookings: [] };
const OK_BODY = { ok: true, registered: [{ salaId: 's1', salaName: 'Ada Balcácer', partySize: 1 }], visitor: null, code: null, entryIds: ['e1'], replay: false, lastEntryToday: null };

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
function mockApi(handler: (c: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const c: Call = { url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    if (c.url.endsWith('/api/salas')) return J(200, { salas: [SALA] });
    // «Entradas de hoy» (PR-P4) consulta por su cuenta: no cuenta como llamada del registro.
    if (c.method === 'GET' && c.url.includes('/api/entries?')) return J(200, { date: '2030-01-01', entries: [], total: 0, people: 0, limit: 50, offset: 0 });
    calls.push(c);
    return handler(c, calls.length);
  });
  vi.stubGlobal('fetch', f);
  return calls;
}
async function openAndRegisterAnon() {
  render(<PuertaBoard initial={[SALA] as never} />);
  fireEvent.click(screen.getByRole('button', { name: /Registrar entrada/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Registrar sin datos/ }));
}

describe('PuertaBoard · registro idempotente (PUE-A01)', () => {
  it('manda una Idempotency-Key por intento y muestra el aviso fijo con Deshacer', async () => {
    const calls = mockApi(() => J(201, OK_BODY));
    await openAndRegisterAnon();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entrada registrada · 1 persona'));
    expect(screen.getByRole('button', { name: /Deshacer/ })).toBeInTheDocument();
    expect(calls[0]!.headers['idempotency-key']).toMatch(/\S{8,}/);
    expect((calls[0]!.body as { checkRecent?: boolean }).checkRecent).toBe(true);
  });

  it('falla de red y "Reintentar" reutilizan LA MISMA clave; un registro nuevo usa otra', async () => {
    const calls = mockApi((_c, n) => (n === 1 ? Promise.reject(new Error('red')) : J(201, OK_BODY)));
    await openAndRegisterAnon();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entrada registrada'));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers['idempotency-key']).toBe(calls[0]!.headers['idempotency-key']);

    // Nuevo intento (otro registro) → clave distinta.
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrada/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Registrar sin datos/ }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]!.headers['idempotency-key']).not.toBe(calls[0]!.headers['idempotency-key']);
  });

  it('doble disparo en el mismo frame → una sola petición', async () => {
    const calls = mockApi(() => new Promise<Response>((r) => setTimeout(() => r(J(201, OK_BODY)), 30)));
    render(<PuertaBoard initial={[SALA] as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrada/ }));
    const btn = await screen.findByRole('button', { name: /Registrar sin datos/ });
    fireEvent.click(btn); fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entrada registrada'));
    expect(calls).toHaveLength(1);
  });

  it('Deshacer llama DELETE /entries/:id y refresca', async () => {
    const calls = mockApi((c) => (c.method === 'DELETE' ? J(200, { ok: true, entryId: 'e1', partySize: 1 }) : J(201, OK_BODY)));
    await openAndRegisterAnon();
    fireEvent.click(await screen.findByRole('button', { name: /Deshacer/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entrada deshecha.'));
    expect(calls.find((c) => c.method === 'DELETE')!.url).toBe('/app/puerta/api/entries/e1');
  });

  it('Deshacer rechazado (403) muestra el motivo del servidor', async () => {
    mockApi((c) => (c.method === 'DELETE' ? J(403, { error: 'Pasaron más de 10 minutos.' }) : J(201, OK_BODY)));
    await openAndRegisterAnon();
    fireEvent.click(await screen.findByRole('button', { name: /Deshacer/ }));
    expect(await screen.findByText('Pasaron más de 10 minutos.')).toBeInTheDocument();
  });

  it('409 recent_entry → pide confirmar ("Entró a las …") y al confirmar reenvía sin checkRecent', async () => {
    const last = new Date(Date.now() - 3 * 60_000).toISOString();
    const calls = mockApi((_c, n) => (n === 1
      ? J(409, { error: 'x', code: 'recent_entry', lastEntryToday: last })
      : J(201, { ...OK_BODY, lastEntryToday: last })));
    await openAndRegisterAnon();
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent(/Entró a las \d{2}:\d{2}\. ¿Registrar otra entrada\?/);
    expect(screen.queryByRole('button', { name: /Deshacer/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar otra' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entrada registrada'));
    expect(calls).toHaveLength(2);
    expect((calls[1]!.body as { checkRecent?: boolean }).checkRecent).toBeUndefined();
  });

  it('el +N de acompañantes se resetea al cambiar de pestaña', async () => {
    mockApi(() => J(201, OK_BODY));
    render(<PuertaBoard initial={[SALA] as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrada/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Más acompañantes' }));
    expect(screen.getByRole('button', { name: /Registrar entrada · 2 personas/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Grupo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Nuevo visitante/ }));
    expect(screen.getByRole('button', { name: /^Registrar entrada$/ })).toBeInTheDocument();
  });
});

// ── PR-P5 · tablet y accesibilidad (PUE-A06) ──────────────────────────────────
const VR = { ...SALA, id: 's2', name: 'Sala VR', aforo: 8 };

function stubStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } },
  });
  return m;
}

// Un control mide ≥44 px si tiene min-h-11/h-11/h-12 y NO lo baja a 40 px en md+.
const BIG = /(^|\s)(min-h-1[1-9]|h-1[1-9])(\s|$)/;
function undersized(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input'))
    .filter((el) => el.tabIndex !== -1)
    .filter((el) => {
      // Los <input> del kit (Field) miden su caja contenedora, que sube a 44 px con [&>div]:md:min-h-11.
      const box = el.tagName === 'INPUT' ? el.closest('label')?.className ?? '' : '';
      if (/\[&>div\]:md:min-h-11/.test(box)) return false;
      return !BIG.test(el.className) || /md:min-h-10\b|sm:min-h-9\b/.test(el.className);
    })
    .map((el) => `${el.tagName}:${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}`);
}

describe('PuertaBoard · tablet (PUE-A06)', () => {
  it('las tarjetas de sala van en 2 columnas desde md (820 px)', () => {
    mockApi(() => J(201, OK_BODY));
    const { container } = render(<PuertaBoard initial={[SALA, VR] as never} />);
    const grid = container.querySelector('.grid')!;
    expect(grid.className).toMatch(/md:grid-cols-2/);
    expect(grid.className).not.toMatch(/lg:grid-cols-2/);
  });

  it('ningún control del tablero ni del drawer mide menos de 44 px', async () => {
    mockApi(() => J(201, OK_BODY));
    const { container } = render(<PuertaBoard initial={[SALA, VR] as never} />);
    expect(undersized(container)).toEqual([]);
    fireEvent.click(screen.getAllByRole('button', { name: /Registrar entrada/ })[0]!);
    const dlg = await screen.findByRole('dialog');
    expect(undersized(dlg)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /Grupo/ }));
    expect(undersized(dlg)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /Buscar \/ QR/ }));
    expect(undersized(dlg)).toEqual([]);
  });

  it('los contadores +/− de la puerta usan el tamaño kiosk (48 px)', async () => {
    mockApi(() => J(201, OK_BODY));
    render(<PuertaBoard initial={[SALA] as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrada/ }));
    expect((await screen.findByRole('button', { name: 'Más acompañantes' })).className).toMatch(/\bh-12\b/);
    fireEvent.click(screen.getByRole('button', { name: /Grupo/ }));
    expect(screen.getByRole('button', { name: /^Más alumnos$/i }).className).toMatch(/\bh-12\b/);
  });

  it('el cierre del aviso tiene nombre accesible', async () => {
    mockApi(() => J(201, OK_BODY));
    await openAndRegisterAnon();
    await screen.findByRole('status');
    expect(await screen.findByRole('button', { name: 'Cerrar aviso' })).toBeInTheDocument();
  });
});

describe('PuertaBoard · pestaña recordada', () => {
  it('abre en "Nuevo visitante" por defecto y recuerda la última pestaña usada', async () => {
    const store = stubStorage();
    mockApi(() => J(201, OK_BODY));
    const { unmount } = render(<PuertaBoard initial={[SALA] as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrada/ }));
    expect(await screen.findByRole('textbox', { name: /Nombre/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Buscar \/ QR/ }));
    expect(store.get('puerta:reg-tab')).toBe('search');
    unmount(); cleanup();

    render(<PuertaBoard initial={[SALA] as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrada/ }));
    expect(await screen.findByPlaceholderText(/Buscar por nombre/)).toBeInTheDocument();
  });

  it('un valor inválido o un localStorage roto cae en "Nuevo visitante" sin romper', async () => {
    stubStorage({ 'puerta:reg-tab': 'zzz' });
    mockApi(() => J(201, OK_BODY));
    render(<PuertaBoard initial={[SALA] as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrada/ }));
    expect(await screen.findByRole('textbox', { name: /Nombre/ })).toBeInTheDocument();
    cleanup();
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('bloqueado'); } });
    render(<PuertaBoard initial={[SALA] as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrada/ }));
    expect(await screen.findByRole('textbox', { name: /Nombre/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Grupo/ })); // escribir tampoco rompe
  });
});

describe('PuertaBoard · +1 anónimo por tarjeta', () => {
  it('registra una entrada anónima en esa sala con Idempotency-Key y aviso con Deshacer, sin abrir el drawer', async () => {
    const calls = mockApi(() => J(201, OK_BODY));
    render(<PuertaBoard initial={[SALA, VR] as never} />);
    fireEvent.click(screen.getByRole('button', { name: '+1 anónimo en Sala VR' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entrada registrada · 1 persona'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const reg = calls.filter((c) => c.url.endsWith('/registrar'));
    expect(reg).toHaveLength(1);
    expect(reg[0]!.body).toMatchObject({ salaIds: ['s2'], mode: 'anonymous', companions: 0 });
    expect(reg[0]!.headers['idempotency-key']).toMatch(/\S{8,}/);
    expect(screen.getByRole('button', { name: /Deshacer/ })).toBeInTheDocument();
  });

  it('tras un fallo de red, reintentar reutiliza la misma clave; un +1 nuevo usa otra', async () => {
    const calls = mockApi((_c, n) => (n === 1 ? Promise.reject(new Error('red')) : J(201, OK_BODY)));
    render(<PuertaBoard initial={[SALA] as never} />);
    fireEvent.click(screen.getByRole('button', { name: '+1 anónimo en Ada Balcácer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entrada registrada'));
    expect(calls[1]!.headers['idempotency-key']).toBe(calls[0]!.headers['idempotency-key']);
    fireEvent.click(screen.getByRole('button', { name: '+1 anónimo en Ada Balcácer' }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]!.headers['idempotency-key']).not.toBe(calls[0]!.headers['idempotency-key']);
  });

  it('el doble toque rápido manda una sola petición', async () => {
    const calls = mockApi(() => new Promise<Response>((r) => setTimeout(() => r(J(201, OK_BODY)), 30)));
    render(<PuertaBoard initial={[SALA] as never} />);
    const b = screen.getByRole('button', { name: '+1 anónimo en Ada Balcácer' });
    fireEvent.click(b); fireEvent.click(b);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entrada registrada'));
    expect(calls).toHaveLength(1);
  });
});
