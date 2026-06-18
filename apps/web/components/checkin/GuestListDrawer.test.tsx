// components/checkin/GuestListDrawer.test.tsx · el panel de lista de invitados en
// la puerta: progreso, filtros (pendientes/llegaron), "Dar entrada" (POST checkin)
// y los chips de protocolo / sin email.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { GuestListDrawer } from './GuestListDrawer';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const J = (status: number, obj: unknown) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

const activity = {
  id: 'A1', name: 'Un Siglo · Minerva Mirabal', location: 'Centro Cultural Banreservas',
  date: '2030-06-17T23:00:00.000Z', capacity: 125, enrolledCount: 1, available: 124,
  occupancyPct: 1, recentMovement: 0, full: false, guestList: { total: 3, arrived: 1 },
};

const inv = (over: Record<string, unknown>) => ({
  id: 'x', userId: 'x', code: 'CCB-X', firstName: 'F', lastName: 'L', email: 'f@x.do',
  kind: 'audience', plusOnes: 0, status: 'pending', attendanceId: null,
  sentAt: null, respondedAt: null, expiresAt: '2030-06-18T00:00:00.000Z', createdAt: '2030-06-01T00:00:00.000Z',
  ...over,
});
const listBody = {
  summary: { total: 3, pending: 2, confirmed: 0, declined: 0, expired: 0, canceled: 0, attended: 1 },
  invitations: [
    inv({ id: 'i1', userId: 'u1', code: 'CCB-AAA1', firstName: 'María Mercedes', lastName: 'Ortíz', status: 'pending' }),
    inv({ id: 'i2', userId: 'u2', code: 'CCB-BBB2', firstName: 'Pedro Ramón', lastName: 'López', status: 'attended', attendanceId: 'att-2' }),
    inv({ id: 'i3', userId: 'u3', code: 'CCB-CCC3', firstName: 'Amelia', lastName: 'Deschamps', email: null, kind: 'protocol', plusOnes: 2, status: 'pending' }),
  ],
};
const checkinOk = { code: 'CCB-AAA1', visitCount: 1, partySize: 1, activity: { id: 'A1', name: 'Un Siglo' }, mode: 'existing' as const, protocol: null };
const padronItem = { id: 'p1', code: 'CCB-PAD1', firstName: 'Marcela', lastName: 'Pérez', email: 'marcela@x.do', visitCount: 4, protocol: null, invitedTo: [] };

function installFetch(over: { checkin?: () => Response; visitors?: () => Response; invite?: () => Response } = {}) {
  const fn = vi.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (u.includes('/check-in/api/visitors')) return over.visitors?.() ?? J(200, { items: [padronItem] });
    if (u.includes('/invite-existing')) return over.invite?.() ?? J(201, { ok: true, summary: { invited: 1, alreadyInvited: 0, skipped: 0 } });
    if (u.includes('/invitations')) return J(200, listBody);
    if (u.includes('/check-in/api/checkin')) return over.checkin?.() ?? J(200, checkinOk);
    if (u.includes('/check-in/api/attendance/')) return new Response(null, { status: 204 });
    return J(404, {});
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('GuestListDrawer', () => {
  it('progreso + filtro Pendientes por defecto (no muestra a los que llegaron)', async () => {
    installFetch();
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={() => {}} />);
    expect(await screen.findByText('María Mercedes Ortíz')).toBeInTheDocument();
    // progreso: 1 de 3
    expect(screen.getByText('de 3 llegaron')).toBeInTheDocument();
    // pendientes por defecto: María y Amelia sí; Pedro (llegó) no
    expect(screen.getByText('Amelia Deschamps')).toBeInTheDocument();
    expect(screen.queryByText('Pedro Ramón López')).not.toBeInTheDocument();
    // botones "Dar entrada" para los pendientes
    expect(screen.getAllByRole('button', { name: /Dar entrada/ }).length).toBe(2);
  });

  it('chips: protocolo (+2) y sin email en la fila correspondiente', async () => {
    installFetch();
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={() => {}} />);
    const row = (await screen.findByText('Amelia Deschamps')).closest('li')!;
    expect(within(row).getByText(/Protocolo · \+2/)).toBeInTheDocument();
    expect(within(row).getByText(/sin email/)).toBeInTheDocument();
  });

  it('designado de protocolo invitado como audiencia (isProtocol) muestra etiqueta Protocolo', async () => {
    const body = {
      summary: { total: 1, pending: 1, confirmed: 0, declined: 0, expired: 0, canceled: 0, attended: 0 },
      invitations: [inv({ id: 'i9', userId: 'u9', code: 'CCB-DHAQIG', firstName: 'Nelson', lastName: 'Encarnación', email: null, kind: 'audience', isProtocol: true, status: 'pending' })],
    };
    vi.stubGlobal('fetch', vi.fn(async () => J(200, body)));
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={() => {}} />);
    const row = (await screen.findByText('Nelson Encarnación')).closest('li')!;
    expect(within(row).getByText('Protocolo')).toBeInTheDocument(); // aunque kind='audience'
  });

  it('filtro Llegaron muestra al asistido con "Llegó" y "Deshacer"', async () => {
    installFetch();
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={() => {}} />);
    await screen.findByText('María Mercedes Ortíz');
    fireEvent.click(screen.getByRole('button', { name: /Llegaron/ }));
    expect(await screen.findByText('Pedro Ramón López')).toBeInTheDocument();
    expect(screen.getByText('Llegó')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deshacer/ })).toBeInTheDocument();
  });

  it('"Dar entrada" hace POST checkin con el código del invitado y avisa onArrival', async () => {
    const onArrival = vi.fn();
    const fetchMock = installFetch();
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={onArrival} />);
    const row = (await screen.findByText('María Mercedes Ortíz')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Dar entrada/ }));
    await waitFor(() => expect(onArrival).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/check-in/api/checkin'))!;
    expect(JSON.parse((call[1] as { body: string }).body).visitor.code).toBe('CCB-AAA1');
  });

  it('buscar a alguien que NO está en la lista → aparece del padrón; "Agregar y dar entrada" hace checkin con addToList', async () => {
    const onArrival = vi.fn();
    const fetchMock = installFetch();
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={onArrival} />);
    await screen.findByText('María Mercedes Ortíz');
    fireEvent.change(screen.getByPlaceholderText(/Buscar en la lista/), { target: { value: 'marcela' } });
    const row = (await screen.findByText('Marcela Pérez')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Agregar y dar entrada/ }));
    await waitFor(() => expect(onArrival).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/check-in/api/checkin'))!;
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.visitor.code).toBe('CCB-PAD1');
    expect(body.addToList).toBe(true);
  });

  it('si no está en el padrón, "Crear «…»" abre el form (prefijado) y crea+agrega+entrada con visitor.new + addToList', async () => {
    const onArrival = vi.fn();
    const fetchMock = installFetch({ visitors: () => J(200, { items: [] }) });
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={onArrival} />);
    await screen.findByText('María Mercedes Ortíz');
    fireEvent.change(screen.getByPlaceholderText(/Buscar en la lista/), { target: { value: 'Marcela Pérez' } });
    fireEvent.click(await screen.findByRole('button', { name: /Crear visitante/ }));
    expect(screen.getByDisplayValue('Marcela')).toBeInTheDocument(); // nombre prefijado del query
    expect(screen.getByDisplayValue('Pérez')).toBeInTheDocument();   // apellido prefijado
    fireEvent.click(screen.getByRole('button', { name: /Crear, agregar y dar entrada/ }));
    await waitFor(() => expect(onArrival).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/check-in/api/checkin'))!;
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.visitor.new).toEqual({ firstName: 'Marcela', lastName: 'Pérez' });
    expect(body.addToList).toBe(true);
  });

  it('"Solo agregar" usa invite-existing con el userId del padrón', async () => {
    const fetchMock = installFetch();
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={() => {}} />);
    await screen.findByText('María Mercedes Ortíz');
    fireEvent.change(screen.getByPlaceholderText(/Buscar en la lista/), { target: { value: 'marcela' } });
    const row = (await screen.findByText('Marcela Pérez')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /^Solo agregar$/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/invite-existing'))).toBe(true));
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/invite-existing'))!;
    expect(JSON.parse((call[1] as { body: string }).body).userIds).toEqual(['p1']);
  });

  it('protocolo con +N: "Dar entrada" cuenta los acompañantes autorizados en el aforo', async () => {
    const onArrival = vi.fn();
    const fetchMock = installFetch();
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={onArrival} />);
    const row = (await screen.findByText('Amelia Deschamps')).closest('li')!; // protocolo, plusOnes 2
    fireEvent.click(within(row).getByRole('button', { name: /Dar entrada/ }));
    await waitFor(() => expect(onArrival).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/check-in/api/checkin'))!;
    expect(JSON.parse((call[1] as { body: string }).body).companionsChildren).toBe(2);
  });

  it('invitado normal: agregar acompañante (botón + stepper) → "Dar entrada" lo cuenta', async () => {
    const fetchMock = installFetch();
    render(<GuestListDrawer activity={activity} onClose={() => {}} onArrival={() => {}} />);
    const row = (await screen.findByText('María Mercedes Ortíz')).closest('li')!; // audiencia, plusOnes 0
    fireEvent.click(within(row).getByRole('button', { name: /Agregar acompañante/ })); // 0 → 1 (aparece el stepper)
    fireEvent.click(within(row).getByRole('button', { name: 'Más acompañantes' }));     // 1 → 2
    fireEvent.click(within(row).getByRole('button', { name: /Dar entrada/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/check-in/api/checkin'))).toBe(true));
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/check-in/api/checkin'))!;
    expect(JSON.parse((call[1] as { body: string }).body).companionsChildren).toBe(2);
  });
});
