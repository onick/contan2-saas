// components/activities/AddFromPadronPanel.test.tsx · buscar en el padrón,
// seleccionar y agregar a la lista (invite-existing). "En la lista" deshabilitado.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { AddFromPadronPanel } from './AddFromPadronPanel';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, obj: unknown) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

const visitor = (over: Record<string, unknown>) => ({
  id: 'u', code: 'CCB-X', firstName: 'F', lastName: 'L', email: 'f@x.do', visitCount: 0, protocol: null, invitedTo: [], ...over,
});
const visitorsBody = {
  items: [
    visitor({ id: 'u1', code: 'CCB-AAA1', firstName: 'Nelson', lastName: 'Encarnación', email: null }),       // sin email, seleccionable
    visitor({ id: 'u2', code: 'CCB-BBB2', firstName: 'Héctor', lastName: 'Romero' }),                          // seleccionable
    visitor({ id: 'u3', code: 'CCB-CCC3', firstName: 'Ya', lastName: 'Invitado', invitedTo: [{ activityId: 'ACT1', activityName: 'Gala' }] }), // ya en la lista
  ],
};

function installFetch(over: { invite?: () => Response } = {}) {
  const fn = vi.fn(async (url: string, _init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const u = String(url);
    if (u.includes('/check-in/api/visitors')) return J(200, visitorsBody);
    if (u.includes('/invite-existing')) return over.invite?.() ?? J(201, { ok: true, summary: { invited: 2, alreadyInvited: 0, skipped: 0 } });
    return J(404, {});
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('AddFromPadronPanel', () => {
  it('busca, muestra resultados; "ya en la lista" deshabilitado; sin email se puede agregar', async () => {
    installFetch();
    render(<AddFromPadronPanel activityId="ACT1" activityName="Gala" open onClose={() => {}} onAdded={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Nombre, código o email/), { target: { value: 'e' } });
    fireEvent.change(screen.getByPlaceholderText(/Nombre, código o email/), { target: { value: 'en' } });
    expect(await screen.findByText('Nelson Encarnación')).toBeInTheDocument();
    expect(screen.getByText('Héctor Romero')).toBeInTheDocument();
    // el ya-invitado muestra "En la lista" y su fila está deshabilitada
    const yaRow = screen.getByText('Ya Invitado').closest('button')!;
    expect(within(yaRow).getByText('En la lista')).toBeInTheDocument();
    expect(yaRow).toBeDisabled();
    // Nelson (sin email) tiene su chip pero es seleccionable
    expect(within(screen.getByText('Nelson Encarnación').closest('button')!).getByText(/sin email/)).toBeInTheDocument();
  });

  it('comando "*protocolo" busca con protocol=1 (lista completa de protocolo)', async () => {
    const fetchMock = installFetch();
    render(<AddFromPadronPanel activityId="ACT1" activityName="Gala" open onClose={() => {}} onAdded={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Nombre, código o email/), { target: { value: '*protocolo' } });
    await screen.findByText('Nelson Encarnación');
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/check-in/api/visitors'))!;
    expect(String(call[0])).toContain('protocol=1');
  });

  it('selecciona dos y agrega → POST invite-existing con userIds; llama onAdded', async () => {
    const onAdded = vi.fn();
    const fetchMock = installFetch();
    render(<AddFromPadronPanel activityId="ACT1" activityName="Gala" open onClose={() => {}} onAdded={onAdded} />);
    fireEvent.change(screen.getByPlaceholderText(/Nombre, código o email/), { target: { value: 'en' } });
    await screen.findByText('Nelson Encarnación');
    fireEvent.click(screen.getByText('Nelson Encarnación').closest('button')!);
    fireEvent.click(screen.getByText('Héctor Romero').closest('button')!);
    const addBtn = screen.getByRole('button', { name: /Agregar 2 a la lista/ });
    expect(addBtn).toBeEnabled();
    fireEvent.click(addBtn);
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/invite-existing'))!;
    expect(String(call[0])).toContain('/app/actividades/api/ACT1/invite-existing');
    expect(JSON.parse((call[1] as { body: string }).body).userIds.sort()).toEqual(['u1', 'u2']);
  });
});
