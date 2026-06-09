import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => state.params }));

import { ProfileProvider, ProfileLink } from './ProfileProvider';

const J = (obj: unknown) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
function installFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/detail')) return J({ user: { id: 'u1', code: decodeURIComponent(u.split('/').slice(-2)[0] ?? ''), firstName: 'Sofía', lastName: 'Méndez', email: null, phone: null, visitCount: 1, createdAt: '2024-01-15T00:00:00.000Z', lastVisitAt: null, credentialSentAt: null, status: 'dormant' } });
    if (u.includes('/activities')) return J({ items: [], total: 0, limit: 10, offset: 0 });
    if (u.includes('/affinity')) return J({ byType: [], byCategory: [], byLocation: [], totalAttended: 0, lastVisitAt: null, status: 'dormant' });
    return J({});
  }));
}
// Tabla mínima con filas data-user-row + acción "Ver".
function Table() {
  return (
    <ProfileProvider>
      <table><tbody>
        <tr data-user-row="CCB-AAA111"><td>Ana</td><td><ProfileLink code="CCB-AAA111" /></td></tr>
        <tr data-user-row="CCB-BBB222"><td>Beto</td><td><ProfileLink code="CCB-BBB222" /></td></tr>
      </tbody></table>
    </ProfileProvider>
  );
}

beforeEach(() => { state.params = new URLSearchParams(); installFetch(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ProfileProvider · UI-2b interacción', () => {
  it('click en "Ver" abre el drawer', async () => {
    render(<Table />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /Ver perfil/ })[0]!);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Sofía Méndez/ })).toBeInTheDocument());
  });

  it('click en cualquier parte de la fila abre el perfil', async () => {
    render(<Table />);
    fireEvent.click(screen.getByText('Beto')); // celda, no el botón
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('deep-link ?ver=<code> abre ese perfil al cargar', async () => {
    state.params = new URLSearchParams('ver=ccb-bbb222'); // case-insensitive
    render(<Table />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('deep-link inválido NO abre nada (anti-inyección)', async () => {
    state.params = new URLSearchParams('ver=<script>');
    render(<Table />);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('↓ mueve el foco entre botones "Ver"', () => {
    render(<Table />);
    const btns = screen.getAllByRole('button', { name: /Ver perfil/ });
    const [b0, b1] = [btns[0]!, btns[1]!];
    b0.focus();
    fireEvent.keyDown(b0, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(b1);
    fireEvent.keyDown(b1, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(b0);
  });
});
