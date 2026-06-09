import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { AuditTimeline } from './AuditTimeline';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const page = {
  items: [
    { id: '3', category: 'reporte', action: 'report.generated', actorEmailMasked: 'm***@ccb.do', actorRole: 'admin', targetType: 'report', targetId: 'attendance-by-activity', targetLabel: null, metadata: {}, createdAt: new Date().toISOString() },
  ],
  nextCursor: null,
};

describe('AuditTimeline', () => {
  it('carga y muestra eventos con actor enmascarado + etiqueta de acción, agrupados', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, page)));
    render(<AuditTimeline />);
    await waitFor(() => expect(screen.getByText('m***@ccb.do')).toBeInTheDocument());
    expect(screen.getByText('report:attendance-by-activity')).toBeInTheDocument(); // targetType:targetId de la fila
    expect(screen.getByRole('heading', { name: 'Hoy' })).toBeInTheDocument();
  });

  it('403 → mensaje honesto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(403, { error: 'no' })));
    render(<AuditTimeline />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/No tenés permiso/i));
  });

  it('vacío → estado honesto (sin demo)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(200, { items: [], nextCursor: null })));
    render(<AuditTimeline />);
    await waitFor(() => expect(screen.getByText(/No hay eventos/i)).toBeInTheDocument());
  });
});
