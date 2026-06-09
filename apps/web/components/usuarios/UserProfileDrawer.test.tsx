import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { UserProfileDrawer } from './UserProfileDrawer';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.style.overflow = ''; });

const J = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const detail = (over = {}) => ({ user: { id: 'u1', code: 'CCB-7K2P9Q', firstName: 'Sofía', lastName: 'Méndez', email: 'sofia@ccb.do', phone: '809-555-1', visitCount: 4, createdAt: '2024-01-15T00:00:00.000Z', lastVisitAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), credentialSentAt: '2024-02-01T00:00:00.000Z', status: 'active', ...over } });
const histItem = (over = {}) => ({ activityId: 'a1', name: 'Concierto', type: 'Concierto', location: 'Sala 1', status: 'activa', registeredAt: '2024-06-01T00:00:00.000Z', checkedInAt: '2024-06-01T00:00:00.000Z', attended: true, companionsChildren: 2, ...over });
const affinity = (over = {}) => ({ byType: [{ key: 'Concierto', count: 2 }, { key: 'Cine', count: 1 }], byCategory: [{ key: 'Música', count: 2 }], byLocation: [{ key: 'Sala 1', count: 2 }], totalAttended: 3, lastVisitAt: new Date().toISOString(), status: 'active', ...over });

interface H { detail?: () => Response; activities?: (offset: number) => Response; affinity?: () => Response }
function installFetch(h: H) {
  const fn = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/detail')) return h.detail?.() ?? J(detail());
    if (u.includes('/activities')) { const off = Number(new URL(u, 'http://x').searchParams.get('offset')); return h.activities?.(off) ?? J({ items: [histItem()], total: 1, limit: 10, offset: off }); }
    if (u.includes('/affinity')) return h.affinity?.() ?? J(affinity());
    return J({}, 404);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const panel = () => document.querySelector('.drawer-panel') as HTMLElement | null;

describe('UserProfileDrawer', () => {
  it('carga y muestra nombre, código, métricas, contacto, afinidad e historial', async () => {
    installFetch({});
    render(<UserProfileDrawer code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Sofía Méndez/ })).toBeInTheDocument());
    expect(screen.getAllByText('CCB-7K2P9Q').length).toBeGreaterThan(0);
    expect(screen.getByText('sofia@ccb.do')).toBeInTheDocument();
    expect(screen.getByText(/Activo/)).toBeInTheDocument();
    expect(screen.getByText(/Credencial enviada/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Tipos de actividad/)).toBeInTheDocument());
    expect(screen.getAllByText('Concierto').length).toBeGreaterThan(0); // afinidad + historial
    await waitFor(() => expect(screen.getByText(/Asistió/)).toBeInTheDocument());
  });

  it('copiar código: usa clipboard + aria-live', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    installFetch({});
    render(<UserProfileDrawer code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    fireEvent.click(screen.getByRole('button', { name: /Copiar/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('CCB-7K2P9Q'));
    await waitFor(() => expect(screen.getByText(/Código copiado/)).toBeInTheDocument());
  });

  it('historial paginado: "Cargar más" agrega la siguiente página', async () => {
    installFetch({ activities: (off) => off === 0
      ? J({ items: [histItem({ activityId: 'a1', name: 'Acto 1' })], total: 2, limit: 10, offset: 0 })
      : J({ items: [histItem({ activityId: 'a2', name: 'Acto 2', attended: false, checkedInAt: null })], total: 2, limit: 10, offset: 1 }) });
    render(<UserProfileDrawer code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Acto 1')).toBeInTheDocument());
    expect(screen.queryByText('Acto 2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Cargar más/ }));
    await waitFor(() => expect(screen.getByText('Acto 2')).toBeInTheDocument());
    expect(screen.getByText(/Registrado/)).toBeInTheDocument(); // RSVP sin asistir
  });

  it('estado vacío: sin asistencias → mensajes honestos', async () => {
    installFetch({
      activities: () => J({ items: [], total: 0, limit: 10, offset: 0 }),
      affinity: () => J(affinity({ byType: [], byCategory: [], byLocation: [], totalAttended: 0, lastVisitAt: null, status: 'dormant' })),
    });
    render(<UserProfileDrawer code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Aún sin asistencias registradas/)).toBeInTheDocument());
    expect(screen.getByText(/Todavía no participó en actividades/)).toBeInTheDocument();
  });

  it('error de detalle: muestra alerta honesta', async () => {
    installFetch({ detail: () => J({ error: 'No pudimos cargar el visitante.' }, 502) });
    render(<UserProfileDrawer code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos cargar el visitante/));
  });

  it('cierre animado: X cierra → permanece montado en closing → desmonta tras animationend', async () => {
    const onClose = vi.fn();
    installFetch({});
    const { rerender } = render(<UserProfileDrawer code="CCB-7K2P9Q" onClose={onClose} />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cerrar perfil/ }));
    expect(onClose).toHaveBeenCalled();
    // el contenedor controla `code`: simulamos el cierre (code=null)
    rerender(<UserProfileDrawer code={null} onClose={onClose} />);
    expect(panel()).toHaveClass('drawer-panel--closing'); // sigue montado, animando
    act(() => { fireEvent.animationEnd(panel()!); });
    expect(document.querySelector('[role="dialog"]')).toBeNull(); // desmontó
  });

  it('Escape cierra (onEscape)', async () => {
    const onClose = vi.fn();
    installFetch({});
    render(<UserProfileDrawer code="CCB-7K2P9Q" onClose={onClose} />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('no monta cuando code=null', () => {
    installFetch({});
    render(<UserProfileDrawer code={null} onClose={() => {}} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
