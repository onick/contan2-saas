import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ProfileProvider, ProfileLink } from './ProfileProvider';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (obj: unknown) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });

describe('ProfileProvider · abrir perfil desde "Ver"', () => {
  it('click en "Ver" abre el drawer del visitante', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/detail')) return J({ user: { id: 'u1', code: 'CCB-7K2P9Q', firstName: 'Sofía', lastName: 'Méndez', email: 'sofia@ccb.do', phone: null, visitCount: 1, createdAt: '2024-01-15T00:00:00.000Z', lastVisitAt: null, credentialSentAt: null, status: 'dormant' } });
      if (u.includes('/activities')) return J({ items: [], total: 0, limit: 10, offset: 0 });
      if (u.includes('/affinity')) return J({ byType: [], byCategory: [], byLocation: [], totalAttended: 0, lastVisitAt: null, status: 'dormant' });
      return J({});
    }));
    render(<ProfileProvider><ProfileLink code="CCB-7K2P9Q" /></ProfileProvider>);
    expect(document.querySelector('[role="dialog"]')).toBeNull(); // cerrado al inicio
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Sofía Méndez/ })).toBeInTheDocument());
  });
});
