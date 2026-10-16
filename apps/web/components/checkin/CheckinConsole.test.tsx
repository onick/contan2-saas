import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { CheckinConsole } from './CheckinConsole';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

const J = (status: number, obj: unknown) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const metricsBody = { metrics: { checkinsToday: 7, checkinsLast10Min: 2, uniqueVisitorsToday: 5, activeActivities: 2 }, serverNow: new Date().toISOString(), timezone: 'America/Santo_Domingo' };
const act1 = { id: 'A1', name: 'Concierto', location: 'Sala 1', date: '2030-06-10T19:00:00.000Z', capacity: 100, enrolledCount: 40, available: 60, occupancyPct: 40, recentMovement: 2, full: false };
const actFull = { id: 'A2', name: 'Lleno', location: 'Sala 2', date: '2030-06-10T19:00:00.000Z', capacity: 1, enrolledCount: 1, available: 0, occupancyPct: 100, recentMovement: 0, full: true };
const visitor = { id: 'u1', code: 'CCB-7K2P9Q', firstName: 'Sofía', lastName: 'Méndez', email: 'sofia@ccb.do', visitCount: 4 };

interface H {
  metrics?: () => Response; activities?: () => Response; visitors?: (q: string) => Response;
  checkin?: (b: Record<string, unknown>) => Response; anonymous?: (b: Record<string, unknown>, key: string | null) => Response;
  recent?: () => Response; invitations?: () => Response;
}
const emptyInvitations = { summary: { total: 0, pending: 0, confirmed: 0, declined: 0, expired: 0, canceled: 0, attended: 0 }, invitations: [] };
function installFetch(h: H) {
  const fn = vi.fn(async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
    const u = String(url);
    if (u.includes('/api/metrics')) return h.metrics?.() ?? J(502, {});
    if (u.includes('/api/recent')) return h.recent?.() ?? J(200, { items: [], total: 0, limit: 8, offset: 0 });
    if (u.includes('/api/activities')) return h.activities?.() ?? J(502, {});
    if (u.includes('/invitations')) return h.invitations?.() ?? J(200, emptyInvitations);
    if (u.includes('/api/visitors')) return h.visitors?.(new URL(u, 'http://x').searchParams.get('q') ?? '') ?? J(200, { items: [] });
    if (u.includes('/api/checkin')) return h.checkin?.(JSON.parse(init?.body ?? '{}')) ?? J(502, {});
    if (u.includes('/api/anonymous')) return h.anonymous?.(JSON.parse(init?.body ?? '{}'), init?.headers?.['idempotency-key'] ?? null) ?? J(502, {});
    return J(404, {});
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const okMetrics = () => J(200, metricsBody);
const okActs = (items = [act1]) => () => J(200, { items, serverNow: metricsBody.serverNow });

describe('CheckinConsole', () => {
  it('métricas + actividades REALES se renderizan', async () => {
    installFetch({ metrics: okMetrics, activities: okActs() });
    render(<CheckinConsole />);
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument()); // checkinsToday
    expect(screen.getByText('Concierto')).toBeInTheDocument();
  });

  it('actividad de HOY: badge "Hoy" + fila resaltada (bg-accent-soft)', async () => {
    const today = { ...act1, name: 'Evento de hoy', date: new Date().toISOString() };
    installFetch({ metrics: okMetrics, activities: okActs([today]) });
    render(<CheckinConsole />);
    await waitFor(() => expect(screen.getByText('Evento de hoy')).toBeInTheDocument());
    expect(screen.getAllByText('Hoy').length).toBeGreaterThan(0);
    expect(screen.getByText('Evento de hoy').closest('li')!.className).toContain('bg-accent-soft');
  });

  it('actividad con lista: el progreso de invitados vive EN la misma tarjeta (sin sección duplicada) y el botón dice "Invitados 2/5"', async () => {
    const conLista = { ...act1, guestList: { total: 5, arrived: 2 }, imageUrl: null, imagePosY: null };
    installFetch({ metrics: okMetrics, activities: okActs([conLista]) });
    render(<CheckinConsole />);
    await waitFor(() => expect(screen.getByText('Concierto')).toBeInTheDocument());
    expect(screen.queryByText('Listas de invitados')).not.toBeInTheDocument(); // ya no hay tarjeta aparte
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /2 de 5 llegaron · 3 pendientes/.test(el.textContent ?? ''))).toBeInTheDocument();
    expect(screen.getAllByText('Concierto')).toHaveLength(1); // UNA sola tarjeta para la actividad
    expect(screen.getByRole('button', { name: /Invitados 2\/5/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir lista/ })).not.toBeInTheDocument();
  });

  it('sin lista en ninguna actividad → sin progreso de invitados y el botón dice "Lista"', async () => {
    installFetch({ metrics: okMetrics, activities: okActs() }); // act1 sin guestList
    render(<CheckinConsole />);
    await waitFor(() => expect(screen.getByText('Concierto')).toBeInTheDocument());
    expect(screen.queryByText(/llegaron/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Lista$/ })).toBeInTheDocument();
  });

  it('botón "Lista" en una actividad activa (aunque vacía) abre el modal con estado para empezar la lista', async () => {
    installFetch({ metrics: okMetrics, activities: okActs() }); // act1 sin guestList
    render(<CheckinConsole />);
    await waitFor(() => expect(screen.getByText('Concierto')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Lista$/ }));
    expect(await screen.findByText('Lista de invitados')).toBeInTheDocument(); // eyebrow del modal
    expect(await screen.findByText(/Nadie en la lista todavía/)).toBeInTheDocument(); // estado vacío que invita a buscar
  });

  it('API caída → estado honesto, NUNCA demo', async () => {
    installFetch({ metrics: () => J(502, { error: 'down' }), activities: () => J(502, { error: 'down' }) });
    render(<CheckinConsole />);
    await waitFor(() => expect(screen.getAllByText(/No disponible/i).length).toBeGreaterThan(0));
    expect(screen.queryByText('48')).toBeNull(); // ningún número demo
  });

  it('búsqueda: q corto (<2) no dispara; q válido busca server-side (debounce)', async () => {
    const fn = installFetch({ metrics: okMetrics, activities: okActs(), visitors: () => J(200, { items: [visitor] }) });
    render(<CheckinConsole />);
    await settle();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a' } }); // 1 char
    await settle(400);
    expect(fn.mock.calls.some((c) => String(c[0]).includes('/api/visitors'))).toBe(false);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofia' } });
    await settle(400);
    expect(fn.mock.calls.some((c) => String(c[0]).includes('q=sofia'))).toBe(true);
    await waitFor(() => expect(screen.getByText('Sofía Méndez')).toBeInTheDocument());
  });

  it('selección y deselección del visitante', async () => {
    installFetch({ metrics: okMetrics, activities: okActs(), visitors: () => J(200, { items: [visitor] }) });
    render(<CheckinConsole />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofia' } });
    await settle(400);
    fireEvent.click(await screen.findByText('Sofía Méndez'));
    expect(screen.getByText('CCB-7K2P9Q')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Quitar visitante/i }));
    expect(screen.getByRole('searchbox')).toBeInTheDocument(); // volvió a la búsqueda
  });

  it('registrar EXISTENTE → POST correcto + éxito + refresca', async () => {
    let metricCalls = 0;
    const fn = installFetch({
      metrics: () => { metricCalls++; return okMetrics(); }, activities: okActs(), visitors: () => J(200, { items: [visitor] }),
      checkin: () => J(201, { code: 'CCB-7K2P9Q', visitCount: 5, partySize: 1, activity: { id: 'A1', name: 'Concierto' }, mode: 'existing' }),
    });
    render(<CheckinConsole />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofia' } });
    await settle(400);
    fireEvent.click(await screen.findByText('Sofía Méndez'));
    const before = metricCalls;
    fireEvent.click(screen.getAllByRole('button', { name: /Registrar/i })[0]!);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Quedó auditado/i));
    const post = fn.mock.calls.find((c) => String(c[0]).includes('/api/checkin'))!;
    expect(JSON.parse((post[1] as { body: string }).body)).toEqual({ activityId: 'A1', visitor: { code: 'CCB-7K2P9Q' }, companionsChildren: 0, companionsAdults: 0 });
    await waitFor(() => expect(metricCalls).toBeGreaterThan(before)); // refrescó
  });

  it('actividad enfocada: al seleccionar visitante sube la tarjeta (checkin-rise); al limpiar, desaparece', async () => {
    installFetch({ metrics: okMetrics, activities: okActs(), visitors: () => J(200, { items: [visitor] }) });
    render(<CheckinConsole />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofia' } });
    await settle(400);
    fireEvent.click(await screen.findByText('Sofía Méndez'));
    const focus = await screen.findByText(/Registrar a Sofía en/);
    expect(focus.closest('.checkin-rise')).toBeTruthy(); // tarjeta animada presente
    fireEvent.click(screen.getByRole('button', { name: /Quitar visitante/i }));
    expect(screen.queryByText(/Registrar a Sofía en/)).toBeNull(); // vuelve a la normalidad
  });

  it('actividad enfocada: la elegida en el selector manda sobre la primera por fecha y es la que se registra', async () => {
    const act3 = { ...act1, id: 'A3', name: 'Taller de cerámica' };
    const fn = installFetch({
      metrics: okMetrics, activities: okActs([act1, act3]), visitors: () => J(200, { items: [visitor] }),
      checkin: () => J(201, { code: 'CCB-7K2P9Q', visitCount: 5, partySize: 1, activity: { id: 'A3', name: 'Taller de cerámica' }, mode: 'existing' }),
    });
    render(<CheckinConsole />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofia' } });
    await settle(400);
    fireEvent.click(await screen.findByText('Sofía Méndez'));
    // la tarjeta se remonta al cambiar de actividad (key): se vuelve a consultar cada vez
    const card = async () => (await screen.findByText(/Registrar a Sofía en/)).closest('.checkin-rise') as HTMLElement;
    const select = within(await card()).getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('A1'); // sin elección explícita: la primera activa
    fireEvent.change(select, { target: { value: 'A3' } });
    expect((await card()).textContent).toContain('Taller de cerámica');
    // un refresco de actividades NO le quita la elección al staff
    fireEvent.click(screen.getByRole('button', { name: 'Refrescar' }));
    await settle(10);
    expect((within(await card()).getByRole('combobox') as HTMLSelectElement).value).toBe('A3');
    fireEvent.click(within(await card()).getByRole('button', { name: /Registrar/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Quedó auditado/i));
    const post = fn.mock.calls.find((c) => String(c[0]).includes('/api/checkin'))!;
    expect(JSON.parse((post[1] as { body: string }).body).activityId).toBe('A3');
  });

  it('al cambiar de visitante se descarta la actividad elegida (vuelve al criterio por defecto)', async () => {
    const act3 = { ...act1, id: 'A3', name: 'Taller de cerámica' };
    installFetch({ metrics: okMetrics, activities: okActs([act1, act3]), visitors: () => J(200, { items: [visitor] }) });
    render(<CheckinConsole />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofia' } });
    await settle(400);
    fireEvent.click(await screen.findByText('Sofía Méndez'));
    fireEvent.change(within((await screen.findByText(/Registrar a Sofía en/)).closest('.checkin-rise') as HTMLElement).getByRole('combobox'), { target: { value: 'A3' } });
    fireEvent.click(screen.getByRole('button', { name: /Quitar visitante/i }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofia' } });
    await settle(400);
    fireEvent.click(await screen.findByText('Sofía Méndez'));
    const sel = within((await screen.findByText(/Registrar a Sofía en/)).closest('.checkin-rise') as HTMLElement).getByRole('combobox') as HTMLSelectElement;
    expect(sel.value).toBe('A1');
  });

  it('hidratación (#418): el HTML de servidor (TZ=UTC) y el primer render de cliente coinciden', async () => {
    const prevTz = process.env.TZ;
    const errors: unknown[] = [];
    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const prevAct = g.IS_REACT_ACT_ENVIRONMENT;
    g.IS_REACT_ACT_ENVIRONMENT = true;
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
    try {
      process.env.TZ = 'UTC';
      const html = renderToString(<CheckinConsole />);
      expect(html).toContain('--:--'); // el reloj no pinta "ahora" en el servidor
      process.env.TZ = 'America/Santo_Domingo'; // el navegador está en hora DR
      installFetch({ metrics: okMetrics, activities: okActs() });
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => { root = hydrateRoot(host, <CheckinConsole />, { onRecoverableError: (e) => errors.push(e) }); });
      expect(errors).toEqual([]);
      await act(async () => { root.unmount(); });
      host.remove();
    } finally {
      if (prevTz === undefined) delete process.env.TZ; else process.env.TZ = prevTz;
      g.IS_REACT_ACT_ENVIRONMENT = prevAct;
      spy.mockRestore();
    }
  });

  it('duplicado/cupo → 409 muestra error, sin éxito', async () => {
    installFetch({ metrics: okMetrics, activities: okActs(), visitors: () => J(200, { items: [visitor] }), checkin: () => J(409, { error: 'El visitante ya está registrado en esta actividad.' }) });
    render(<CheckinConsole />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofia' } });
    await settle(400);
    fireEvent.click(await screen.findByText('Sofía Méndez'));
    fireEvent.click(screen.getAllByRole('button', { name: /Registrar/i })[0]!);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/ya está registrado/i));
  });

  it('doble-submit en registrar → un solo POST', async () => {
    let resolve!: (r: Response) => void;
    const fn = installFetch({
      metrics: okMetrics, activities: okActs(), visitors: () => J(200, { items: [visitor] }),
      checkin: () => { throw new Error('unused'); },
    });
    // override checkin con promesa diferida
    (fn as unknown as { mockImplementation: (f: unknown) => void }).mockImplementation(async (url: string, init?: { body?: string }) => {
      const u = String(url);
      if (u.includes('/api/metrics')) return okMetrics();
      if (u.includes('/api/activities')) return okActs()();
      if (u.includes('/api/visitors')) return J(200, { items: [visitor] });
      if (u.includes('/api/checkin')) return new Promise<Response>((r) => { resolve = r; });
      return J(404, {});
    });
    render(<CheckinConsole />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sofia' } });
    await settle(400);
    fireEvent.click(await screen.findByText('Sofía Méndez'));
    const btn = screen.getAllByRole('button', { name: /Registrar/i })[0]!;
    fireEvent.click(btn); fireEvent.click(btn);
    const checkinCalls = () => fn.mock.calls.filter((c) => String(c[0]).includes('/api/checkin')).length;
    expect(checkinCalls()).toBe(1);
    resolve(J(201, { code: 'x', visitCount: 1, partySize: 1, activity: { id: 'A1', name: 'Concierto' }, mode: 'existing' }));
    await settle();
    expect(checkinCalls()).toBe(1);
  });

  it('+1 reutiliza la MISMA Idempotency-Key en reintentos; una nueva acción usa key distinta', async () => {
    const keys: (string | null)[] = [];
    let failFirst = true;
    installFetch({
      metrics: okMetrics, activities: okActs(),
      anonymous: (_b, key) => { keys.push(key); if (failFirst) { failFirst = false; return J(502, { error: 'red' }); } return J(201, { attendanceId: 'att1', activity: { id: 'A1', name: 'Concierto' }, mode: 'anonymous', replay: false }); },
    });
    render(<CheckinConsole />);
    await waitFor(() => screen.getByText('Concierto'));
    fireEvent.click(screen.getByRole('button', { name: /\+1 sin credencial/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Sí, registrar/i })); // 1er intento → falla
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/red/i));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sí, registrar/i })); // retry → MISMA key
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(keys.length).toBe(2);
    expect(keys[0]).toBe(keys[1]); // misma key en el retry
    expect(keys[0]).toBeTruthy();
    // Nueva acción → key distinta
    fireEvent.click(screen.getByRole('button', { name: /\+1 sin credencial/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sí, registrar/i }));
    await waitFor(() => expect(keys.length).toBe(3));
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('polling 30s + cleanup al desmontar', async () => {
    vi.useFakeTimers();
    const fn = installFetch({ metrics: okMetrics, activities: okActs() });
    const { unmount } = render(<CheckinConsole />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const m0 = fn.mock.calls.filter((c) => String(c[0]).includes('/metrics')).length;
    expect(m0).toBeGreaterThanOrEqual(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    const m1 = fn.mock.calls.filter((c) => String(c[0]).includes('/metrics')).length;
    expect(m1).toBeGreaterThan(m0); // polleó
    unmount();
    const m2 = fn.mock.calls.filter((c) => String(c[0]).includes('/metrics')).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fn.mock.calls.filter((c) => String(c[0]).includes('/metrics')).length).toBe(m2); // cleanup: sin más polls
  });

  it('a11y: región aria-live presente', async () => {
    installFetch({ metrics: okMetrics, activities: okActs() });
    render(<CheckinConsole />);
    expect(document.querySelector('[role="status"][aria-live="polite"]')).toBeTruthy();
  });

  it('feed "Check-ins de hoy": muestra registros (nombre y anónimo) con su actividad', async () => {
    installFetch({
      metrics: okMetrics, activities: okActs(),
      recent: () => J(200, {
        items: [
          { id: 'r1', userCode: 'CCB-7K2P9Q', firstName: 'Sofía', lastName: 'Méndez', activityId: 'A1', activityName: 'Concierto', anonymous: false, checkedInAt: new Date().toISOString(), registeredAt: new Date().toISOString(), companionsChildren: 0, companionsAdults: 0 },
          { id: 'r2', userCode: null, firstName: null, lastName: null, activityId: 'A1', activityName: 'Concierto', anonymous: true, checkedInAt: new Date(Date.now() - 5 * 60_000 - 30_000).toISOString(), registeredAt: new Date(Date.now() - 5 * 60_000 - 30_000).toISOString(), companionsChildren: 0, companionsAdults: 0 },
        ],
        total: 2, limit: 8, offset: 0,
      }),
    });
    render(<CheckinConsole />);
    await waitFor(() => expect(screen.getByText('Check-ins de hoy')).toBeInTheDocument());
    expect(await screen.findByText('Sofía Méndez')).toBeInTheDocument();
    expect(screen.getByText('+1 sin credencial', { selector: 'span' })).toBeInTheDocument(); // fila anónima del feed
    expect(screen.getByText('hace 5 min')).toBeInTheDocument();
  });

  it('feed: pide solo check-ins reales (status=checked_in) y fecha por checkedInAt (hold convertido hoy = "hace 5 min")', async () => {
    const fn = installFetch({
      metrics: okMetrics, activities: okActs(),
      recent: () => J(200, {
        items: [
          // invitación de hace 3 días convertida en check-in hace 5 min
          { id: 'r1', userCode: 'CCB-7K2P9Q', firstName: 'Sofía', lastName: 'Méndez', activityId: 'A1', activityName: 'Concierto', anonymous: false, checkedInAt: new Date(Date.now() - 5 * 60_000 - 30_000).toISOString(), registeredAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), companionsChildren: 0, companionsAdults: 0 },
        ],
        total: 1, limit: 8, offset: 0,
      }),
    });
    render(<CheckinConsole />);
    expect(await screen.findByText('Sofía Méndez')).toBeInTheDocument();
    expect(screen.getByText('hace 5 min')).toBeInTheDocument();
    const recentCall = fn.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/api/recent'));
    expect(recentCall).toContain('status=checked_in');
  });

  it('feed con API vieja (checkedInAt null): cae a registeredAt', async () => {
    installFetch({
      metrics: okMetrics, activities: okActs(),
      recent: () => J(200, {
        items: [{ id: 'r1', userCode: 'CCB-7K2P9Q', firstName: 'Sofía', lastName: 'Méndez', activityId: 'A1', activityName: 'Concierto', anonymous: false, checkedInAt: null, registeredAt: new Date(Date.now() - 5 * 60_000 - 30_000).toISOString(), companionsChildren: 0, companionsAdults: 0 }],
        total: 1, limit: 8, offset: 0,
      }),
    });
    render(<CheckinConsole />);
    expect(await screen.findByText('Sofía Méndez')).toBeInTheDocument();
    expect(screen.getByText('hace 5 min')).toBeInTheDocument();
  });

  it('aforo: con inRoom/heldPeople → "N en sala · M reservados / cap"', async () => {
    installFetch({ metrics: okMetrics, activities: okActs([{ ...act1, enrolledCount: 40, inRoom: 12, heldPeople: 28 } as typeof act1]) });
    render(<CheckinConsole />);
    expect(await screen.findByText(/12 en sala · 28 reservados \/ 100/)).toBeInTheDocument();
  });

  it('aforo: heldPeople 0 o API vieja → etiqueta de siempre', async () => {
    installFetch({ metrics: okMetrics, activities: okActs([{ ...act1, inRoom: 40, heldPeople: 0 } as typeof act1]) });
    render(<CheckinConsole />);
    expect(await screen.findByText(/40\/100 en sala/)).toBeInTheDocument();
    cleanup();
    installFetch({ metrics: okMetrics, activities: okActs() });
    render(<CheckinConsole />);
    expect(await screen.findByText(/40\/100 en sala/)).toBeInTheDocument();
  });

  it('feed vacío → estado honesto (sin demo)', async () => {
    installFetch({ metrics: okMetrics, activities: okActs(), recent: () => J(200, { items: [], total: 0, limit: 8, offset: 0 }) });
    render(<CheckinConsole />);
    await waitFor(() => expect(screen.getByText(/Aún no hay check-ins hoy/i)).toBeInTheDocument());
  });

  it('Escanear abre el escáner de credencial', async () => {
    installFetch({ metrics: okMetrics, activities: okActs() });
    render(<CheckinConsole />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Escanear/i }));
    expect(screen.getByRole('dialog', { name: /Escanear credencial/i })).toBeInTheDocument();
  });

  it('credencial escaneada con coincidencia exacta selecciona al visitante', async () => {
    const fn = installFetch({ metrics: okMetrics, activities: okActs(), visitors: () => J(200, { items: [visitor] }) });
    render(<CheckinConsole />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Escanear/i }));
    fireEvent.change(screen.getByLabelText('Código de credencial manual'), { target: { value: 'CCB-7K2P9Q' } });
    fireEvent.click(screen.getByRole('button', { name: /Usar código/i }));
    await waitFor(() => expect(screen.getByText('Sofía Méndez')).toBeInTheDocument()); // seleccionado
    expect(screen.queryByRole('dialog')).toBeNull(); // modal cerró
    expect(fn.mock.calls.some((c) => String(c[0]).includes('q=CCB-7K2P9Q'))).toBe(true);
  });
});
