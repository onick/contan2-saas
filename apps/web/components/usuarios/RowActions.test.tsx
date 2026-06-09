import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const nav = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: nav.refresh, replace: nav.replace }),
  usePathname: () => '/app/usuarios',
  useSearchParams: () => nav.params,
}));
import { RowActions } from './RowActions';
import { ProfileProvider } from './ProfileProvider';

const J = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

function wrap(props: { email?: string | null; archived?: boolean; canWrite?: boolean } = {}) {
  const email = 'email' in props ? (props.email ?? null) : 'ana@ccb.do';
  return render(
    <ProfileProvider canEdit={props.canWrite ?? true}>
      <RowActions code="CCB-7K2P9Q" email={email} archived={props.archived ?? false} canWrite={props.canWrite ?? true} />
    </ProfileProvider>,
  );
}
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Acciones de CCB-7K2P9Q/ }));
const menu = () => screen.getByRole('menu');

beforeEach(() => { nav.refresh = vi.fn(); nav.params = new URLSearchParams(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('RowActions (F2E)', () => {
  it('abre el menú con aria-expanded y las acciones de escritura (owner/admin)', () => {
    wrap();
    const btn = screen.getByRole('button', { name: /Acciones de/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    openMenu();
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    for (const label of [/Ver perfil/, /Copiar código/, /Editar usuario/, /Reenviar credencial/, /Archivar/]) {
      expect(within(menu()).getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('operator (canWrite=false): sólo Ver perfil + Copiar código', () => {
    wrap({ canWrite: false });
    openMenu();
    expect(within(menu()).getByRole('menuitem', { name: /Ver perfil/ })).toBeInTheDocument();
    expect(within(menu()).getByRole('menuitem', { name: /Copiar código/ })).toBeInTheDocument();
    expect(within(menu()).queryByRole('menuitem', { name: /Editar usuario/ })).toBeNull();
    expect(within(menu()).queryByRole('menuitem', { name: /Reenviar/ })).toBeNull();
    expect(within(menu()).queryByRole('menuitem', { name: /Archivar/ })).toBeNull();
  });

  it('copiar código → clipboard + aria-live', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    wrap();
    openMenu();
    fireEvent.click(within(menu()).getByRole('menuitem', { name: /Copiar código/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('CCB-7K2P9Q'));
    expect(screen.getByText(/Código copiado/)).toBeInTheDocument();
  });

  it('sin email: "Reenviar credencial" deshabilitado con explicación', () => {
    wrap({ email: null });
    openMenu();
    const item = within(menu()).getByRole('menuitem', { name: /Reenviar credencial/ });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', expect.stringMatching(/no tiene email/i));
  });

  it('reenviar: confirma con email enmascarado → POST + refresh; anti-doble-submit', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { method?: string }) => {
      if (init?.method === 'POST') { calls++; return J({ result: 'dry-run', credentialSentAt: null, message: 'Dry-run.' }); }
      return J({}, 404);
    }));
    vi.stubGlobal('crypto', { randomUUID: () => 'key-1' });
    wrap();
    openMenu();
    fireEvent.click(within(menu()).getByRole('menuitem', { name: /Reenviar credencial/ }));
    expect(screen.getByText(/a\*\*\*@ccb\.do/)).toBeInTheDocument();
    const yes = screen.getByRole('button', { name: /Sí, reenviar/ });
    fireEvent.click(yes); fireEvent.click(yes); // doble-click
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(calls).toBe(1); // anti-doble-submit: un solo POST
  });

  it('archivar: confirma → POST archive + refresh', async () => {
    const fetchFn = vi.fn(async (u: string, init?: { method?: string }) => init?.method === 'POST' && String(u).includes('/archive') ? J({ archived: true, deletedAt: '2026-01-01T00:00:00.000Z' }) : J({}, 404));
    vi.stubGlobal('fetch', fetchFn);
    wrap({ archived: false });
    openMenu();
    fireEvent.click(within(menu()).getByRole('menuitem', { name: /Archivar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sí, archivar/ }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(fetchFn.mock.calls.some((c) => String(c[0]).includes('/archive'))).toBe(true);
  });

  it('archivado: muestra "Reactivar" → POST reactivate', async () => {
    const fetchFn = vi.fn(async (u: string) => String(u).includes('/reactivate') ? J({ archived: false, deletedAt: null }) : J({}, 404));
    vi.stubGlobal('fetch', fetchFn);
    wrap({ archived: true });
    openMenu();
    fireEvent.click(within(menu()).getByRole('menuitem', { name: /Reactivar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sí, reactivar/ }));
    await waitFor(() => expect(fetchFn.mock.calls.some((c) => String(c[0]).includes('/reactivate'))).toBe(true));
  });

  it('Escape cierra el menú', () => {
    wrap();
    openMenu();
    expect(screen.queryByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
