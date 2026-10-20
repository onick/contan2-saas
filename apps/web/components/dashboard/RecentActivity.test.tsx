import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { RecentActivity } from './RecentActivity';
import { groupConsecutive } from '../../lib/dashboard/groupActivity';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const row = (id: string, action: string, actor = 'l***@gmail.com') => ({
  id, action, actorEmailMasked: actor, createdAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
});

function stubFetch(items: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 })));
}

describe('groupConsecutive', () => {
  it('colapsa repeticiones consecutivas de la misma acción y actor', () => {
    const out = groupConsecutive([
      { id: '1', action: 'a', detalle: 'x' }, { id: '2', action: 'a', detalle: 'x' },
      { id: '3', action: 'b', detalle: 'x' }, { id: '4', action: 'a', detalle: 'x' },
    ]);
    expect(out.map((o) => [o.id, o.count])).toEqual([['1', 2], ['3', 1], ['4', 1]]);
  });

  it('mismo evento con distinto actor no se agrupa', () => {
    const out = groupConsecutive([{ action: 'a', detalle: 'x' }, { action: 'a', detalle: 'y' }]);
    expect(out).toHaveLength(2);
  });
});

describe('RecentActivity', () => {
  it('agrupa 4 exportaciones seguidas en una fila "×4" y conserva el resto', async () => {
    stubFetch([
      row('1', 'puerta.exported'), row('2', 'puerta.exported'), row('3', 'puerta.exported'), row('4', 'puerta.exported'),
      row('5', 'branding.updated'),
    ]);
    render(<RecentActivity demoAllowed={false} period="30d" />);
    await waitFor(() => expect(screen.getByText('Registros de sala exportados')).toBeInTheDocument());
    expect(screen.getAllByText('Registros de sala exportados')).toHaveLength(1);
    expect(screen.getByText(/×4/)).toBeInTheDocument();
    expect(screen.getByText('Identidad visual actualizada')).toBeInTheDocument();
  });

  it('"Ver todo" lleva al Historial con target de 44 px', async () => {
    stubFetch([row('1', 'branding.updated')]);
    render(<RecentActivity demoAllowed={false} />);
    const link = await screen.findByRole('link', { name: /Ver todo/ });
    expect(link.getAttribute('href')).toBe('/app/historial');
    expect(link.className).toContain('min-h-11');
  });

  it('un evento único no muestra ×N', async () => {
    stubFetch([row('1', 'branding.updated')]);
    render(<RecentActivity demoAllowed={false} />);
    await screen.findByText('Identidad visual actualizada');
    expect(screen.queryByText(/×/)).toBeNull();
  });
});
