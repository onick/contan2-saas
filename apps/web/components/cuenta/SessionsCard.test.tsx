// components/cuenta/SessionsCard.test.tsx · revocar una sesión ajena (Q8-72):
// si el DELETE no devuelve 204 se muestra el error y la sesión sigue listada.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { SessionsCard } from './AccountClient';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const now = new Date().toISOString();
const sessions = [
  { id: 'a1111111-1111-4111-8111-111111111111', createdAt: now, expiresAt: now, lastSeenAt: now, userAgent: 'Mozilla/5.0 (iPhone)', rememberMe: false, current: true },
  { id: 'b2222222-2222-4222-8222-222222222222', createdAt: now, expiresAt: now, lastSeenAt: now, userAgent: 'Mozilla/5.0 (Windows NT 10.0)', rememberMe: false, current: false },
];
const list = () => new Response(JSON.stringify({ sessions }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('SessionsCard · revoke', () => {
  it('DELETE no-204 → muestra error y conserva la sesión', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? new Response('{}', { status: 500 }) : list()));
    render(<SessionsCard />);
    const btn = await screen.findByRole('button', { name: /Cerrar$/ });
    fireEvent.click(btn);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cerrar esa sesión');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('DELETE 204 → quita la sesión y no muestra error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : list()));
    render(<SessionsCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Cerrar$/ }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
