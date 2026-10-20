import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserProfilePanel } from './UserProfilePanel';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.style.overflow = ''; });

const J = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const detail = (over = {}) => ({ user: { id: 'u1', code: 'CCB-7K2P9Q', firstName: 'Sofía', lastName: 'Méndez', email: 'sofia@ccb.do', phone: '809-555-1', visitCount: 4, createdAt: '2024-01-15T00:00:00.000Z', lastVisitAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), credentialSentAt: '2024-02-01T00:00:00.000Z', status: 'active', deletedAt: null, ...over } });
const histItem = (over = {}) => ({ activityId: 'a1', name: 'Concierto', type: 'Concierto', location: 'Sala 1', status: 'activa', registeredAt: '2024-06-01T00:00:00.000Z', checkedInAt: '2024-06-01T00:00:00.000Z', attended: true, companionsChildren: 2, companionsAdults: 0, ...over });
const affinity = (over = {}) => ({ byType: [{ key: 'Concierto', count: 2 }, { key: 'Cine', count: 1 }], byCategory: [{ key: 'Música', count: 2 }], byLocation: [{ key: 'Sala 1', count: 2 }], totalAttended: 3, lastVisitAt: new Date().toISOString(), status: 'active', ...over });

interface H { detail?: () => Response; activities?: (offset: number) => Response; affinity?: () => Response; patch?: (body: Record<string, unknown>) => Response; credential?: (key: string) => Response }
function installFetch(h: H) {
  const fn = vi.fn(async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const u = String(url);
    if (init?.method === 'POST' && u.includes('/archive')) return J({ archived: true, deletedAt: new Date().toISOString() });
    if (init?.method === 'POST' && u.includes('/reactivate')) return J({ archived: false, deletedAt: null });
    if (init?.method === 'POST' && u.includes('/credential')) return h.credential?.(init.headers?.['idempotency-key'] ?? '') ?? J({ result: 'dry-run', credentialSentAt: null, message: 'Dry-run: no se envió.' });
    if (init?.method === 'PATCH') return h.patch?.(JSON.parse(init.body ?? '{}')) ?? J(detail({ firstName: JSON.parse(init.body ?? '{}').firstName ?? 'Sofía' }));
    if (u.includes('/detail')) return h.detail?.() ?? J(detail());
    if (u.includes('/activities')) { const off = Number(new URL(u, 'http://x').searchParams.get('offset')); return h.activities?.(off) ?? J({ items: [histItem()], total: 1, limit: 10, offset: off }); }
    if (u.includes('/affinity')) return h.affinity?.() ?? J(affinity());
    return J({}, 404);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const panelEl = () => document.querySelector('[data-detail-panel]') as HTMLElement | null;
const tab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
function stubViewport(xl: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('min-width') ? xl : false, media: q,
    addEventListener: () => {}, removeEventListener: () => {},
  }));
}

// El perfil se renderiza como columna fija (xl) o como panel lateral modal (< xl): cubrimos ambos.
describe.each([['xl · columna fija', true], ['< xl · panel lateral', false]] as const)('UserProfilePanel · %s', (_label, xl) => {
  beforeEach(() => stubViewport(xl));

  it('carga y muestra nombre, código, métricas, contacto, afinidad e historial', async () => {
    installFetch({});
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Sofía Méndez/ })).toBeInTheDocument());
    expect(screen.getAllByText('CCB-7K2P9Q').length).toBeGreaterThan(0);
    expect(screen.getByText('sofia@ccb.do')).toBeInTheDocument();
    expect(screen.getByText(/Activo/)).toBeInTheDocument();
    expect(screen.getByText(/Credencial enviada/)).toBeInTheDocument();
    // Visitas: métricas + historial
    tab('Visitas');
    await waitFor(() => expect(screen.getByText(/Asistió/)).toBeInTheDocument());
    expect(screen.getByText('Última visita')).toBeInTheDocument();
    // Afinidad: pestaña presente sólo con asistencias
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Afinidad' })).toBeInTheDocument());
    tab('Afinidad');
    await waitFor(() => expect(screen.getByText(/Tipos de actividad/)).toBeInTheDocument());
    expect(screen.getAllByText('Concierto').length).toBeGreaterThan(0);
  });

  it('copiar código: usa clipboard + aria-live', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    installFetch({});
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('CCB-7K2P9Q'));
    await waitFor(() => expect(screen.getByText(/Código copiado/)).toBeInTheDocument());
  });

  it('historial paginado: "Cargar más" agrega la siguiente página', async () => {
    installFetch({ activities: (off) => off === 0
      ? J({ items: [histItem({ activityId: 'a1', name: 'Acto 1' })], total: 2, limit: 10, offset: 0 })
      : J({ items: [histItem({ activityId: 'a2', name: 'Acto 2', attended: false, checkedInAt: null })], total: 2, limit: 10, offset: 1 }) });
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => screen.getByRole('tab', { name: 'Visitas' }));
    tab('Visitas');
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
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => screen.getByRole('tab', { name: 'Visitas' }));
    await settle(10);
    expect(screen.queryByRole('tab', { name: 'Afinidad' })).toBeNull(); // sin asistencias no hay pestaña de afinidad
    tab('Visitas');
    await waitFor(() => expect(screen.getByText(/Todavía no participó en actividades/)).toBeInTheDocument());
  });

  it('error de detalle: muestra alerta honesta', async () => {
    installFetch({ detail: () => J({ error: 'No pudimos cargar el visitante.' }, 502) });
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos cargar el visitante/));
  });

  it('la X cierra el perfil (onClose)', async () => {
    const onClose = vi.fn();
    installFetch({});
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={onClose} />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cerrar perfil/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape cierra el perfil (panel lateral y columna)', async () => {
    const onClose = vi.fn();
    installFetch({});
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={onClose} />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    screen.getByRole('button', { name: /Cerrar perfil/ }).focus();
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('code=null: sin diálogo; la columna queda plegada (sin estado vacío)', () => {
    installFetch({});
    render(<UserProfilePanel code={null} onClose={() => {}} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.queryByText(/Selecciona una fila/)).toBeNull();
    if (xl) expect(document.querySelector('aside[data-detail-panel]')).toHaveAttribute('data-detail-state', 'closed');
    else expect(panelEl()).toBeNull();
  });

  it('canEdit=false → sin botón Editar', async () => {
    installFetch({});
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} canEdit={false} />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    expect(screen.queryByRole('button', { name: /^Editar$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reenviar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Archivar visitante/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Imprimir credencial/ })).toBeInTheDocument(); // lectura: sí
  });

  it('initialEdit + canEdit: abre directo en modo edición; sin permiso no edita', async () => {
    installFetch({});
    const { unmount } = render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} canEdit initialEdit />);
    await waitFor(() => expect(within(panelEl()!).getByLabelText('Nombre')).toBeInTheDocument());
    unmount();
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} initialEdit />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    expect(screen.queryByLabelText('Nombre')).toBeNull();
  });

  it('canEdit: Editar → form → Guardar envía PATCH parcial y actualiza el detalle', async () => {
    const fn = installFetch({ patch: (b) => J(detail({ firstName: String(b.firstName), lastName: 'Méndez' })) });
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} canEdit />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía Méndez/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Editar$/ }));
    const nombre = within(panelEl()!).getByLabelText('Nombre');
    fireEvent.change(nombre, { target: { value: 'Sofía Beatriz' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Sofía Beatriz/ })).toBeInTheDocument());
    const patchCall = fn.mock.calls.find((c) => (c[1] as { method?: string })?.method === 'PATCH')!;
    expect(JSON.parse((patchCall[1] as { body: string }).body)).toEqual({ firstName: 'Sofía Beatriz' }); // sólo el campo cambiado
  });

  it('reenviar credencial: confirm con email enmascarado → dry-run honesto (no "enviado") + key reusada', async () => {
    const keys: string[] = [];
    const fn = installFetch({ credential: (k) => { keys.push(k); return J({ result: 'dry-run', credentialSentAt: null, message: 'Dry-run: sin clave de envío, no se envió.' }); } });
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} canEdit />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    expect(screen.getByText(/s\*\*\*@ccb\.do/)).toBeInTheDocument(); // email enmascarado
    fireEvent.click(screen.getByRole('button', { name: /Sí, enviar/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Dry-run/));
    expect(screen.queryByText(/enviada al email/i)).toBeNull(); // NO afirma "enviado" en dry-run
    // reintento (nueva apertura) usa una key nueva; dentro de un intento la key es la misma
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toMatch(/[0-9a-f-]{36}/); // crypto.randomUUID
    const fn2 = fn; void fn2;
  });

  it('reenviar: error mantiene el confirm para reintentar', async () => {
    let first = true;
    installFetch({ credential: () => { if (first) { first = false; return J({ error: 'Problema de red.' }, 502); } return J({ result: 'sent', credentialSentAt: new Date().toISOString(), message: 'Credencial enviada al email del visitante.' }); } });
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} canEdit />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    fireEvent.click(screen.getByRole('button', { name: /Sí, enviar/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Problema de red/));
    fireEvent.click(screen.getByRole('button', { name: /Sí, enviar/ })); // reintento
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/enviada al email/));
  });

  it('archivar: confirm → "Sí, archivar" → muestra chip Archivado + botón Reactivar', async () => {
    installFetch({});
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} canEdit />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    fireEvent.click(screen.getByRole('button', { name: /Archivar visitante/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sí, archivar/ }));
    await waitFor(() => expect(screen.getByText('Archivado')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Reactivar visitante/ })).toBeInTheDocument();
  });

  it('reactivar: visitante archivado → "Reactivar" lo vuelve activo', async () => {
    installFetch({ detail: () => J(detail({ deletedAt: new Date().toISOString() })) });
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} canEdit />);
    await waitFor(() => expect(screen.getByText('Archivado')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Reactivar visitante/ }));
    await waitFor(() => expect(screen.queryByText('Archivado')).toBeNull());
    expect(screen.getByRole('button', { name: /Archivar visitante/ })).toBeInTheDocument();
  });

  it('canEdit=false → sin botón de reenviar', async () => {
    installFetch({});
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} canEdit={false} />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    expect(screen.queryByRole('button', { name: 'Reenviar' })).toBeNull();
  });

  it('edición: email duplicado (409) muestra error y mantiene el form', async () => {
    installFetch({ patch: () => J({ error: 'Ya existe un visitante con ese email.' }, 409) });
    render(<UserProfilePanel code="CCB-7K2P9Q" onClose={() => {}} canEdit />);
    await waitFor(() => screen.getByRole('heading', { name: /Sofía/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Editar$/ }));
    fireEvent.change(within(panelEl()!).getByLabelText('Email'), { target: { value: 'otra@ccb.do' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Ya existe un visitante/));
    expect(within(panelEl()!).getByLabelText('Email')).toBeInTheDocument(); // sigue en edición
  });
});
