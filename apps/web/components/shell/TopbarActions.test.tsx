// components/shell/TopbarActions.test.tsx · el menú de usuario y las
// notificaciones del Topbar son REALES: identidad de la sesión en el menú,
// feed del historial en la campana (no-leídas honestas; operator sin permiso
// → campana ausente, cero affordances falsas).

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { TopbarUserMenu } from './TopbarUserMenu';
import { TopbarNotifications } from './TopbarNotifications';
import { ShellDataProvider } from './ShellData';

// El window del entorno de test no trae un localStorage completo → stub
// determinista respaldado por un Map (el componente igual es resiliente).
const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('TopbarUserMenu', () => {
  it('Cerrar sesión: el clic envía POST /api/auth/logout y navega a /login (Q8-63)', async () => {
    replace.mockClear();
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      url.includes('/api/auth/logout')
        ? new Response(null, { status: 200 })
        : json({ staff: { fullName: 'Ana Pérez', email: 'ana@ccb.do', role: 'admin' } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<TopbarUserMenu orgName="Centro Cultural" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Menú de usuario' })).toHaveTextContent('AP'));
    fireEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }));
    const item = screen.getByRole('menuitem', { name: 'Cerrar sesión' });
    fireEvent.click(item);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/auth/logout'));
    expect(call?.[1]?.method).toBe('POST');
  });

  it('muestra identidad de la sesión + Mi cuenta + Cerrar sesión; Historial para admin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      staff: { fullName: 'Ana Pérez', email: 'ana@ccb.do', role: 'admin' },
    })));
    render(<TopbarUserMenu orgName="Centro Cultural" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Menú de usuario' })).toHaveTextContent('AP'));

    fireEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }));
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('ana@ccb.do')).toBeInTheDocument();
    expect(screen.getByText('Administración')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Mi cuenta/ })).toHaveAttribute('href', '/app/cuenta');
    expect(screen.getByRole('menuitem', { name: /Historial/ })).toHaveAttribute('href', '/app/historial');
    expect(screen.getByRole('menuitem', { name: /Cerrar sesión/ })).toBeInTheDocument();
  });

  it('operator: sin link a Historial (no tiene permiso del log)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      staff: { fullName: 'Op Uno', email: 'op@ccb.do', role: 'operator' },
    })));
    render(<TopbarUserMenu orgName="Centro Cultural" />);
    fireEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }));
    await waitFor(() => expect(screen.getByText('Op Uno')).toBeInTheDocument());
    expect(screen.queryByRole('menuitem', { name: /Historial/ })).toBeNull();
  });
});

describe('TopbarNotifications', () => {
  const item = (id: string, createdAt: string) => ({
    id, action: 'checkin.manual', actorEmailMasked: 'a***@ccb.do', targetLabel: 'Frank C.', createdAt,
  });

  const renderBell = (role: string) => render(<ShellDataProvider initialRole={role}><TopbarNotifications /></ShellDataProvider>);

  it('con eventos nuevos: punto de no-leídas; abrir lista y marca visto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ items: [item('e1', '2026-06-11T15:00:00.000Z')], nextCursor: null })));
    renderBell('admin');
    // No-leídas honesto: el aria-label lo refleja.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificaciones (hay novedades)' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
    expect(screen.getByText(/Check-in registrado/)).toBeInTheDocument();
    expect(screen.getByText(/Frank C\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver historial completo/ })).toHaveAttribute('href', '/app/historial');
    // Abierto → visto: el label vuelve a neutro y el lastSeen queda guardado.
    expect(store.get('contan2.notif.lastSeen')).toBe('2026-06-11T15:00:00.000Z');
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
  });

  it('sin eventos nuevos (ya vistos): sin punto', async () => {
    store.set('contan2.notif.lastSeen', '2026-06-11T16:00:00.000Z');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ items: [item('e1', '2026-06-11T15:00:00.000Z')], nextCursor: null })));
    renderBell('admin');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Notificaciones (hay novedades)' })).toBeNull();
  });

  it('operator (403 del historial): la campana NO se renderiza', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ error: 'no' }, 403)));
    const { container } = renderBell('admin');
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('operator/consulta/puerta: NO piden el audit (sin 403 ruidoso) y no hay campana', async () => {
    for (const role of ['operator', 'consulta', 'puerta', 'protocolo', 'biblioteca']) {
      const f = vi.fn().mockImplementation(async (u: string) => (String(u).includes('/historial/api/audit') ? json({ error: 'no' }, 403) : json({})));
      vi.stubGlobal('fetch', f);
      const { container } = renderBell(role);
      await new Promise((r) => setTimeout(r, 0));
      expect(f.mock.calls.some((c) => String(c[0]).includes('/historial/api/audit')), role).toBe(false);
      expect(container.querySelector('button')).toBeNull();
      cleanup();
    }
  });

  it('feed vacío: estado honesto en el panel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ items: [], nextCursor: null })));
    renderBell('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones' }));
    expect(screen.getByText(/Sin actividad reciente/)).toBeInTheDocument();
  });
});
