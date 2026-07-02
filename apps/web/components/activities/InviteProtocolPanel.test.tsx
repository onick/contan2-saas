// components/activities/InviteProtocolPanel.test.tsx · panel de invitar
// protocolo: candidatos con tratamiento/categoría, stepper de acompañantes
// (+N con tope), payload {invites:[{userId, plusOnes}]} y outcome honesto.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { InviteProtocolPanel } from './InviteProtocolPanel';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const candidates = {
  candidates: [{
    userId: 'u1', code: 'CCB-ABC123', firstName: 'Juan', lastName: 'Pérez',
    email: 'emb@x.do', category: 'diplomatico', honorific: 'Sr. Embajador', orgTitle: 'Embajada',
  }],
  excluded: { alreadyRegistered: 0, alreadyInvited: 1, noEmail: 0 },
};

describe('InviteProtocolPanel', () => {
  it('lista designados con tratamiento; seleccionar muestra stepper y arma el payload con plusOnes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(candidates))
      .mockResolvedValueOnce(json({ ok: true, summary: { created: 1, reused: 0, skipped: 0, noCapacity: 0, dryRun: true } }, 201))
      .mockResolvedValue(json(candidates));
    vi.stubGlobal('fetch', fetchMock);
    render(<InviteProtocolPanel activityId="a1" activityName="Gala" open onClose={() => {}} onSent={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Sr\. Embajador Juan Pérez/)).toBeInTheDocument());
    expect(screen.getByText(/1 ya invitados/)).toBeInTheDocument();

    // seleccionar → aparece el stepper en +0; sumar dos acompañantes
    fireEvent.click(screen.getByRole('checkbox', { name: /Invitar a Juan Pérez/ }));
    expect(screen.getByText('+0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sumar acompañante a Juan/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sumar acompañante a Juan/ }));
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText(/1 invitado · 3 personas con acompañantes/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Enviar 1 invitación/ }));
    await waitFor(() => expect(screen.getByText(/asiento garantizado/)).toBeInTheDocument());

    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ invites: [{ userId: 'u1', plusOnes: 2 }] });
  });

  it('sin designados invitables → estado honesto que apunta al módulo Protocolo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ candidates: [], excluded: { alreadyRegistered: 0, alreadyInvited: 0, noEmail: 0 } })));
    render(<InviteProtocolPanel activityId="a1" activityName="Gala" open onClose={() => {}} onSent={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No quedan designados invitables/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Enviar 0/ })).toBeDisabled();
  });
});
