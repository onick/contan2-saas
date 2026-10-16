import { describe, it, expect, afterEach, vi, type Mock } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// El overview lo trae el server (apiGet → next/headers); lo mockeamos.
vi.mock('../../../lib/api/audit', () => ({ getAuditOverview: vi.fn() }));
import { getAuditOverview } from '../../../lib/api/audit';
vi.mock('../../../lib/branding/tenant', () => ({
  getTenantBranding: async () => ({
    id: 'local-ccb', slug: 'ccb', name: 'Centro Cultural Banreservas',
    logoUrl: null, emailLogoUrl: null, credentialLogoUrl: null, logoScale: 100,
    primaryColor: '#e65100', secondaryColor: '#ff6f00', sidebarTheme: 'brand',
    status: 'active', plan: 'free', trialEndsAt: null,
  }),
}));
// AppShell es async (Server Component); mock síncrono que renderiza el sidebar
// para que el test de activeKey siga verificando el ítem activo.
vi.mock('../../../components/shell/AppShell', async () => {
  const { Sidebar } = await import('../../../components/shell/Sidebar');
  const { DEFAULT_BRANDING } = await import('../../../lib/branding/config');
  return {
    AppShell: ({ children, branding, activeKey }: {
      children: React.ReactNode; branding?: unknown; activeKey?: string;
    }) => (
      <>
        <Sidebar branding={(branding as Parameters<typeof Sidebar>[0]['branding']) ?? DEFAULT_BRANDING} activeKey={activeKey} role="owner" />
        {children}
      </>
    ),
  };
});
import HistorialPage from './page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

const emptyAudit = () => new Response('{"items":[],"nextCursor":null}', { status: 200, headers: { 'content-type': 'application/json' } });
const OVERVIEW = {
  kpis: { eventsToday: 5, eventsDeltaPct: 18, activeUsersToday: 2, activeUsersDeltaPct: 6, reportsToday: 1, reportsDeltaPct: 33, activitiesToday: 1, activitiesDeltaPct: 12, deletions24h: 0 },
  byCategory: [{ category: 'reporte', count: 3 }],
  topActors: [{ staffId: 's1', name: 'Karen López', role: 'admin', count: 4 }],
  suspicious: { exportsToday: 1, deletions24h: 0 },
};

describe('/app/historial', () => {
  it('renderiza el dashboard con KPIs reales + el feed (filtros server-side)', async () => {
    (getAuditOverview as Mock).mockResolvedValue(OVERVIEW);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyAudit()));
    render(await HistorialPage());
    expect(screen.getByRole('heading', { name: /Historial y auditor/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de evento')).toBeInTheDocument(); // AuditTimeline real
    expect(screen.getByText('Karen López')).toBeInTheDocument(); // top actor con nombre real
  });

  it('overview null (rol sin permiso) → estado de acceso restringido', async () => {
    (getAuditOverview as Mock).mockResolvedValue(null);
    render(await HistorialPage());
    expect(screen.getByText(/Acceso restringido/)).toBeInTheDocument();
  });

  it('marca "Historial" como ítem activo del sidebar', async () => {
    (getAuditOverview as Mock).mockResolvedValue(OVERVIEW);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyAudit()));
    render(await HistorialPage());
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('aria-current', 'page');
  });
});
