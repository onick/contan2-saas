import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ProtocolSection } from './ProtocolSection';

vi.mock('../../lib/anim', () => ({ loadAnim: () => Promise.resolve(null), prefersReducedMotion: () => true }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const guest = (o: Record<string, unknown>) => ({
  userId: 'u1', code: 'CCB-AAA111', firstName: 'Ana', lastName: 'Pérez', email: null,
  category: 'autoridad', honorific: null, orgTitle: null, status: 'pending',
  plusOnes: 0, partySize: 1, attended: false, sentAt: null, respondedAt: null, ...o,
});
const KPIS = { invited: 1, confirmed: 0, attended: 0, declined: 0, pending: 1, totalPartySize: 1 };

function mockApi(guests: unknown[], kpis: Record<string, number> = KPIS) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    activity: { id: 'A1', name: 'X', date: '2026-10-20T19:00:00.000Z', status: 'activa', location: null, imageUrl: null },
    kpis, guests,
  }), { status: 200, headers: { 'content-type': 'application/json' } })));
}

describe('ProtocolSection · reservas vs asistencias', () => {
  it('pending + seatHeld → "Invitado · asiento reservado"; resumen con asientos retenidos', async () => {
    mockApi([guest({ seatHeld: true, plusOnes: 2, partySize: 3, checkedInAt: null })], { ...KPIS, totalPartySize: 3, seatsHeld: 3 });
    render(<ProtocolSection activityId="A1" refreshKey={0} />);
    await waitFor(() => expect(screen.getByText('Invitado · asiento reservado')).toBeInTheDocument());
    expect(screen.getByText(/con asiento retenido/)).toBeInTheDocument();
    expect(screen.queryByText(/asistieron?\b/)).toBeNull();
  });

  it('confirmed → "Confirmado"', async () => {
    mockApi([guest({ status: 'confirmed', seatHeld: true })], { ...KPIS, confirmed: 1, pending: 0, seatsHeld: 1 });
    render(<ProtocolSection activityId="A1" refreshKey={0} />);
    await waitFor(() => expect(screen.getByText('Confirmado')).toBeInTheDocument());
  });

  it('attended real → "Asistió" y el resumen cuenta asistió', async () => {
    mockApi([guest({ status: 'attended', attended: true, seatHeld: false, checkedInAt: '2026-10-20T19:05:00.000Z' })], { ...KPIS, attended: 1, pending: 0, seatsHeld: 0 });
    render(<ProtocolSection activityId="A1" refreshKey={0} />);
    await waitFor(() => expect(screen.getByText('Asistió')).toBeInTheDocument());
    expect(screen.getByText(/ asistió/)).toBeInTheDocument();
    expect(screen.queryByText(/con asiento retenido/)).toBeNull();
  });

  it('API vieja (sin seatHeld/seatsHeld): pending sigue siendo "Invitado" y no hay línea de asientos', async () => {
    mockApi([guest({})]);
    render(<ProtocolSection activityId="A1" refreshKey={0} />);
    await waitFor(() => expect(screen.getByText('Invitado')).toBeInTheDocument());
    expect(screen.queryByText(/asiento/)).toBeNull();
  });
});
