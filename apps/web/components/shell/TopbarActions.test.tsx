// components/shell/TopbarActions.test.tsx · el menú de usuario y las
// notificaciones del Topbar son REALES: identidad de la sesión en el menú,
// feed del historial en la campana (no-leídas honestas; operator sin permiso
// → campana ausente, cero affordances falsas).

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { TopbarUserMenu } from './TopbarUserMenu';
import { TopbarNotifications } from './TopbarNotifications';

// El window del entorno de test no trae un localStorage completo → stub
// determinista respaldado por un Map (el componente igual es resiliente).
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

  it('con eventos nuevos: punto de no-leídas; abrir lista y marca visto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ items: [item('e1', '2026-06-11T15:00:00.000Z')], nextCursor: null })));
    render(<TopbarNotifications />);
    // No-leídas honesto: el aria-label lo refleja.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificaciones (hay novedades)' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
    expect(screen.getByText(/registró un check-in/)).toBeInTheDocument();
    expect(screen.getByText(/Frank C\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver historial completo/ })).toHaveAttribute('href', '/app/historial');
    // Abierto → visto: el label vuelve a neutro y el lastSeen queda guardado.
    expect(store.get('contan2.notif.lastSeen')).toBe('2026-06-11T15:00:00.000Z');
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
  });

  it('sin eventos nuevos (ya vistos): sin punto', async () => {
    store.set('contan2.notif.lastSeen', '2026-06-11T16:00:00.000Z');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ items: [item('e1', '2026-06-11T15:00:00.000Z')], nextCursor: null })));
    render(<TopbarNotifications />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Notificaciones (hay novedades)' })).toBeNull();
  });

  it('operator (403 del historial): la campana NO se renderiza', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'no' }, 403)));
    const { container } = render(<TopbarNotifications />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('feed vacío: estado honesto en el panel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ items: [], nextCursor: null })));
    render(<TopbarNotifications />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones' }));
    expect(screen.getByText(/Sin actividad reciente/)).toBeInTheDocument();
  });
});
